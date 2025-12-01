const { sql, poolPromise } = require('../db');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const moment = require('moment'); // ✅ Requerido para formatear fechas

module.exports = function(app) {
    app.get('/api/generar-constancia-servicios/:idDocente', async (req, res) => {
        const { idDocente } = req.params;

        try {
            const pool = await poolPromise;

            // 1. Obtener datos del docente
            const queryDocente = `
                SELECT 
                    D.NombreDocente, D.DocenteApePat, D.DocenteApeMat, D.RFCDocente,
                    Depto.NombreDepartamento,
                    (J.NombreTitular + ' ' + J.ApePatTitular + ' ' + ISNULL(J.ApeMatTitular,'')) as NombreJefe
                FROM Docente D
                LEFT JOIN Departamento Depto ON D.DepartamentoID = Depto.DepartamentoID
                LEFT JOIN JefaDepartamento J ON D.DepartamentoID = J.DepartamentoID
                WHERE D.DocenteID = @idDocente;
            `;
            const resultDocente = await pool.request()
                .input('idDocente', sql.Int, idDocente)
                .query(queryDocente);

            if (resultDocente.recordset.length === 0) {
                return res.status(404).send('Docente no encontrado.');
            }
            const docente = resultDocente.recordset[0];
            const nombreCompletoDocente = `${docente.NombreDocente} ${docente.DocenteApePat} ${docente.DocenteApeMat}`;

            // 2. Obtener materias impartidas por periodo (QUERY FINAL Y CORREGIDO)
            const queryMaterias = `
                SELECT 
                    P.NombrePeriodo, 
                    M.Clave, 
                    M.NombreMateria, 
                    G.NumAlumnos,
                    G.PeriodoID AS GrupoPeriodoID, /* ✅ Usamos alias para evitar ambigüedad */
                    LEFT(P.NombrePeriodo, 3) as PeriodoCorto,
                    RIGHT(P.NombrePeriodo, 4) as Anio
                FROM Grupo G
                INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
                INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
                INNER JOIN PeriodoEscolar P ON G.PeriodoID = P.PeriodoID
                WHERE G.DocenteID = @idDocente
                ORDER BY P.FechaIniciPer DESC, M.NombreMateria; /* ✅ Columna correcta */
            `;
            const resultMaterias = await pool.request()
                .input('idDocente', sql.Int, idDocente)
                .query(queryMaterias);

            const materiasAgrupadas = {};
            let totalAlumnosGeneral = 0;

            resultMaterias.recordset.forEach(materia => {
                const periodoKey = `${materia.PeriodoCorto}-${materia.Anio}`;
                if (!materiasAgrupadas[periodoKey]) {
                    materiasAgrupadas[periodoKey] = {
                        periodoCompleto: materia.NombrePeriodo,
                        materias: [],
                        totalAlumnosPeriodo: 0
                    };
                }
                materiasAgrupadas[periodoKey].materias.push(materia);
                materiasAgrupadas[periodoKey].totalAlumnosPeriodo += materia.NumAlumnos;
                totalAlumnosGeneral += materia.NumAlumnos;
            });

            // =========================================================
            // GENERACIÓN DEL PDF
            // =========================================================

            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

            const page = pdfDoc.addPage();
            const { width, height } = page.getSize();
            const margin = 50;
            let currentY = height - margin;

            // Función para dibujar texto
            const drawText = (text, x, y, options = {}) => {
                page.drawText(String(text), {
                    x: x,
                    y: y,
                    font: options.font || font,
                    size: options.size || 10,
                    color: options.color || rgb(0, 0, 0),
                    lineHeight: options.lineHeight,
                    opacity: options.opacity,
                    rotate: options.rotate,
                    maxWidth: options.maxWidth,
                    wordBreaks: options.wordBreaks,
                    textAlign: options.textAlign
                });
            };

            // --- ENCABEZADO ---
            // (Se asume que los archivos de imágenes existen en la ruta indicada)
            const imgPathLogoSEP = path.join(__dirname,'..', '..', 'frontend', 'Recursos-img', 'logoSEP.png');
            const imgPathLogoTecNM_Culiacan = path.join(__dirname,'..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
            const imgPathEscudo = path.join(__dirname,'..', '..', 'frontend', 'Recursos-img', 'bandera.jpg');

            const logoSepBytes = fs.readFileSync(imgPathLogoSEP);
            const logoTecNMCuliacanBytes = fs.readFileSync(imgPathLogoTecNM_Culiacan);
            const escudoBytes = fs.readFileSync(imgPathEscudo);
            
            const logoSep = await pdfDoc.embedPng(logoSepBytes);
            const logoTecNMCuliacan = await pdfDoc.embedPng(logoTecNMCuliacanBytes);
            const escudo = await pdfDoc.embedJpg(escudoBytes);


            page.drawImage(logoSep, { x: 50, y: height - 100, width: 40, height: 40 });

            page.drawImage(logoTecNMCuliacan, { x: width / 2 - 30, y: height - 90, width: 60, height: 30 }); // Usado para TecNM central
            page.drawImage(escudo, { x: width - 110, y: height - 100, width: 60, height: 60 }); // Usado para Escudo derecho
            
            drawText('Instituto Tecnológico de Culiacán', width - margin - 150, currentY - 60, { size: 9, font: fontItalic, maxWidth: 140 });
            drawText('Depto. de Servicios Escolares', width - margin - 150, currentY - 75, { size: 9, font: fontBold, maxWidth: 140 });
            drawText('Asunto: Constancia.', width - margin - 150, currentY - 85, { size: 9, font: fontBold, maxWidth: 140 });

            currentY -= 150; // Espacio después del encabezado

            // --- CUERPO DEL DOCUMENTO ---
            drawText('COMISIÓN DE EVALUACIÓN DEL TECNM', margin, currentY, { font: fontBold, size: 10 });
            currentY -= 12;
            drawText('PROGRAMA DE ESTÍMULOS AL DESEMPEÑO DEL PERSONAL DOCENTE', margin, currentY, { font: fontBold, size: 10 });
            currentY -= 12;
            drawText('DE LOS INSTITUTOS TECNOLÓGICOS FEDERALES Y CENTROS', margin, currentY, { font: fontBold, size: 10 });
            currentY -= 12;
            drawText('PRESENTE.-', margin, currentY, { font: fontBold, size: 10 });
            currentY -= 30;

            const textoIntro = `La que suscribe, hace constar que según registros que existen en el archivo escolar, la C. ${docente.NombreDocente.toUpperCase()} ${docente.DocenteApePat.toUpperCase()} ${docente.DocenteApeMat.toUpperCase()}, expediente 8950 impartió las siguientes materias durante los Periodos Enero-Junio y Agosto-Diciembre del año 2024:`;
            page.drawText(textoIntro, {
                x: margin,
                y: currentY,
                font: font,
                size: 9,
                maxWidth: width - (2 * margin),
                lineHeight: 12,
                color: rgb(0, 0, 0)
            });
            currentY -= 50; // Espacio después del texto

            // --- TABLA DE MATERIAS ---
            const tableX = margin;
            const tableWidth = width - (2 * margin);
            const colPeriodoWidth = 70;
            const colNivelWidth = 70;
            const colClaveWidth = 70;
            const colNombreWidth = 250;
            const colAlumnosWidth = 60; // Ajustar para que sume tableWidth

            // Encabezados de la tabla
            const drawTableCell = (text, x, y, colW, bold = false, size = 8, align = 'left', bgColor = null) => {
                if (bgColor) {
                    page.drawRectangle({
                        x: x, y: y - size - 2, width: colW, height: size + 4,
                        color: bgColor, opacity: 0.2
                    });
                }
                
                // Determinar la fuente real para medición (si es bold o regular)
                const currentFont = bold ? fontBold : font;
                let textX = x + 2;

                // 1. Obtener ancho CORRECTO
                const textWidth = currentFont.widthOfTextAtSize(text, size); 

                // 2. Calcular posición
                if (align === 'center') {
                    textX = x + (colW / 2) - (textWidth / 2);
                }
                if (align === 'right') {
                    textX = x + colW - textWidth - 2; // -2 para el padding derecho
                }

                // 3. Dibujar
                drawText(text, textX, y, { font: currentFont, size: size });
            };

            const headerY = currentY;
            drawTableCell('PERIODO', tableX, headerY, colPeriodoWidth, true, 8);
            drawTableCell('NIVEL', tableX + colPeriodoWidth, headerY, colNivelWidth, true, 8);
            drawTableCell('CLAVE DE LA', tableX + colPeriodoWidth + colNivelWidth, headerY + 8, colClaveWidth, true, 8);
            drawTableCell('MATERIA', tableX + colPeriodoWidth + colNivelWidth, headerY - 2, colClaveWidth, true, 8);
            drawTableCell('NOMBRE DE LA MATERIA', tableX + colPeriodoWidth + colNivelWidth + colClaveWidth, headerY, colNombreWidth, true, 8);
            drawTableCell('ALUMNOS', tableX + colPeriodoWidth + colNivelWidth + colClaveWidth + colNombreWidth, headerY + 8, colAlumnosWidth, true, 8);
            drawTableCell('ATENDIDOS', tableX + colPeriodoWidth + colNivelWidth + colClaveWidth + colNombreWidth, headerY - 2, colAlumnosWidth, true, 8);
            
            currentY -= 15; // Espacio después de los encabezados

            let currentTotalAlumnos = 0;
            for (const periodoKey in materiasAgrupadas) {
                const periodoData = materiasAgrupadas[periodoKey];

                // Fila de Período
                drawTableCell(`${periodoData.periodoCompleto}`, tableX, currentY, colPeriodoWidth, false, 8);
                drawTableCell('LICENCIATURA', tableX + colPeriodoWidth, currentY, colNivelWidth, false, 8);
                currentY -= 10;
                
                periodoData.materias.forEach(materia => {
                    // ✅ Usamos materia.Clave (no ClaveMateria)
                    drawTableCell(materia.Clave, tableX + colPeriodoWidth + colNivelWidth, currentY, colClaveWidth, false, 8); 
                    drawTableCell(materia.NombreMateria, tableX + colPeriodoWidth + colNivelWidth + colClaveWidth, currentY, colNombreWidth, false, 8);
                    
                    // ✅ Usamos colClaveWidth para centrar correctamente
                    drawTableCell(String(materia.NumAlumnos), tableX + colPeriodoWidth + colNivelWidth + colClaveWidth + colNombreWidth, currentY, colAlumnosWidth, false, 8, 'center'); 
                    
                    currentY -= 10;
                });
                currentY -= 5; // Espacio entre periodos
            }

            // Fila Total
            drawTableCell('Total', tableX + colPeriodoWidth + colNivelWidth + colClaveWidth + colNombreWidth - 40, currentY, 40, true, 8, 'right');
            drawTableCell(String(totalAlumnosGeneral), tableX + colPeriodoWidth + colNivelWidth + colClaveWidth + colNombreWidth, currentY, colAlumnosWidth, true, 8, 'center');
            currentY -= 20;

            // Texto final
            const fechaActual = moment().locale('es').format('DD [de] MMMM [de] YYYY');
            const textoFinal = `Se extiende la presente, en la ciudad de Culiacán, Sinaloa, a los ${moment().format('D [días del mes de] MMMM [de] YYYY')}, para los fines que más convengan al interesado.`;
            page.drawText(textoFinal, {
                x: margin,
                y: currentY,
                font: font,
                size: 9,
                maxWidth: width - (2 * margin),
                lineHeight: 12,
                color: rgb(0, 0, 0)
            });
            currentY -= 40;

            drawText('ATENTAMENTE', margin, currentY, { font: fontBold, size: 10 });
            currentY -= 10;
            drawText('“Excelencia en Tecnología®”', margin, currentY, { font: fontItalic, size: 9 });
            currentY -= 40;
            
            // --- FIRMAS ---
            const firmaXDocente = margin + 20;
            const firmaXJefe = width / 2 + 50; 

            drawText('_______________________________________', firmaXDocente, currentY, { size: 9 });
            drawText(nombreCompletoDocente.toUpperCase(), firmaXDocente + 10, currentY - 12, { font: fontBold, size: 9 });
            drawText('INTERESADO', firmaXDocente + 40, currentY - 24, { size: 8 });

            drawText('_______________________________________', firmaXJefe, currentY, { size: 9 });
            drawText(docente.NombreJefe ? docente.NombreJefe.toUpperCase() : 'J. DE SERVICIOS ESCOLARES', firmaXJefe + 10, currentY - 12, { font: fontBold, size: 9 });
            drawText('JEFA DEL DEPTO. DE SERVICIOS ESCOLARES', firmaXJefe + 10, currentY - 24, { size: 8 });
            currentY -= 50;

            // --- FOOTER DE IMAGEN ---
            // const footerImgPath = path.join(__dirname, '..', 'frontend', 'Recursos-img', 'footer_constancia.png');
            // const footerImgBytes = fs.readFileSync(footerImgPath);
            // const footerImg = await pdfDoc.embedPng(footerImgBytes);

            // page.drawImage(footerImg, {
            //     x: margin,
            //     y: 30, 
            //     width: width - (2 * margin),
            //     height: 50,
            //     opacity: 0.8
            // });

            // Finalizar y enviar PDF
            const pdfBytesFinal = await pdfDoc.save();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename=ConstanciaServiciosEscolares_${idDocente}.pdf`);
            res.send(Buffer.from(pdfBytesFinal));

        } catch (error) {
            // Usamos error.message para ver si el problema sigue siendo SQL
            console.error("❌ ERROR CRÍTICO FINAL:", error.message);
            res.status(500).send("Error interno: " + error.message);
        }
    });
};