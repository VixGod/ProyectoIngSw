const { sql, poolPromise } = require('../db'); 
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib'); 
const fs = require('fs');
const path = require('path');

module.exports = function(app) {
    
    app.get('/api/descargar/exencion/:examenId', async (req, res) => {
        const { examenId } = req.params;

        try {
            const pool = await poolPromise;

            // 1. OBTENER DATOS
            const query = `
                SELECT 
                    E.AlumnoNombre, E.AlumnoNoControl, E.AlumnoCarrera, E.AlumnoClave,
                    E.OpcionTitulacion, E.TituloProyecto, E.FechaExamen, E.LugarCiudad,
                    I.NombreInstitucion,
                    (P.NombreDocente + ' ' + P.DocenteApePat + ' ' + ISNULL(P.DocenteApeMat,'')) as NombrePresidente,
                    P.CedulaDocente as CedulaPresidente,
                    (S.NombreDocente + ' ' + S.DocenteApePat + ' ' + ISNULL(S.DocenteApeMat,'')) as NombreSecretario,
                    S.CedulaDocente as CedulaSecretario,
                    (V.NombreDocente + ' ' + V.DocenteApePat + ' ' + ISNULL(V.DocenteApeMat,'')) as NombreVocal,
                    V.CedulaDocente as CedulaVocal
                FROM ExamenProfesional E
                INNER JOIN Docente P ON E.PresidenteID = P.DocenteID
                INNER JOIN Institucion I ON P.InstitucionID = I.InstitucionID
                INNER JOIN Docente S ON E.SecretarioID = S.DocenteID
                INNER JOIN Docente V ON E.VocalID = V.DocenteID
                WHERE E.ExamenID = @idInput
            `;

            const result = await pool.request().input('idInput', sql.Int, examenId).query(query);
            if (result.recordset.length === 0) return res.status(404).send('Examen no encontrado.');
            const d = result.recordset[0];

            // 2. FECHAS
            const fechaObj = new Date(d.FechaExamen);
            const userTimezoneOffset = fechaObj.getTimezoneOffset() * 60000;
            const fecha = new Date(fechaObj.getTime() + userTimezoneOffset);
            const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            const diaTexto = `${fecha.getDate()} de ${meses[fecha.getMonth()]} del año ${fecha.getFullYear()}`;

            // 3. CONFIGURACIÓN DEL PDF (TAMAÑO OFICIO)
            const pdfDoc = await PDFDocument.create();
            // Tamaño Oficio (Legal) 8.5 x 14 pulgadas => 612 x 1008 puntos
            const page = pdfDoc.addPage([612, 1008]); 
            const { width, height } = page.getSize();
            
            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            // --- 4. INSERTAR LOGO ---
            const logoPath = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'logo_tecnm.png');
            
            if (fs.existsSync(logoPath)) {
                const logoBytes = fs.readFileSync(logoPath);
                let logoImage;
                if (logoPath.endsWith('.png')) {
                    logoImage = await pdfDoc.embedPng(logoBytes);
                } else {
                    logoImage = await pdfDoc.embedJpg(logoBytes);
                }
                
                const logoDims = logoImage.scale(0.22); 
                page.drawImage(logoImage, {
                    x: 60,
                    y: height - 120, 
                    width: logoDims.width,
                    height: logoDims.height,
                });
            }

            // --- 5. ENCABEZADO DERECHO ---
            const headerY = height - 80;
            page.drawText('INSTITUTO TECNOLÓGICO', { x: 350, y: headerY, size: 14, font: fontBold });
            page.drawText('DE CULIACÁN', { x: 420, y: headerY - 18, size: 14, font: fontBold });
            page.drawText('002', { x: 530, y: headerY - 36, size: 12, font: fontBold });

            // --- 6. TÍTULO ---
            const titulo = 'CARTA DE EXENCIÓN DE EXAMEN PROFESIONAL';
            const tituloWidth = fontBold.widthOfTextAtSize(titulo, 12);
            page.drawText(titulo, { x: (width - tituloWidth) / 2, y: height - 180, size: 12, font: fontBold });

            // --- 7. CUERPO DEL TEXTO (JUSTIFICADO) ---
            
            const drawJustifiedParagraph = (text, startY, fontSize = 11, font = fontReg, lineHeight = 18) => {
                const margin = 60;
                const maxWidth = width - (margin * 2);
                const words = text.split(' ');
                let line = [];
                let currentY = startY;

                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const testLine = [...line, word].join(' ');
                    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

                    if (testWidth > maxWidth) {
                        if (line.length > 1) {
                            let totalWordWidth = 0;
                            line.forEach(w => totalWordWidth += font.widthOfTextAtSize(w, fontSize));
                            const extraSpace = (maxWidth - totalWordWidth) / (line.length - 1);

                            let currentX = margin;
                            line.forEach((w) => {
                                page.drawText(w, { x: currentX, y: currentY, size: fontSize, font: font });
                                currentX += font.widthOfTextAtSize(w, fontSize) + extraSpace;
                            });
                        } else {
                            page.drawText(line[0], { x: margin, y: currentY, size: fontSize, font: font });
                        }
                        
                        line = [word];
                        currentY -= lineHeight;
                    } else {
                        line.push(word);
                    }
                }
                if (line.length > 0) {
                    page.drawText(line.join(' '), { x: margin, y: currentY, size: fontSize, font: font });
                    currentY -= lineHeight;
                }
                return currentY;
            };

            let y = height - 230;
            const lineHeight = 18;
            const fontSize = 11;

            const parrafo1 = `De acuerdo con el instructivo vigente de Titulación, que no tiene como requisito la sustentación del Examen Profesional para efectos de obtención de Título, en las opciones VIII, IX y Titulación Integral, el jurado HACE CONSTAR que el (la) C. ${d.AlumnoNombre.toUpperCase()} número de control ${d.AlumnoNoControl} egresado (a) del ${d.NombreInstitucion}, clave ${d.AlumnoClave}, que cursó la carrera de ${d.AlumnoCarrera}.`;
            y = drawJustifiedParagraph(parrafo1, y, fontSize, fontReg, lineHeight);
            y -= lineHeight;

            page.drawText(`Cumplió satisfactoriamente con lo estipulado en la opción:`, { x: 60, y, size: fontSize, font: fontReg }); y -= lineHeight * 1.5;
            
            const opcionText = d.OpcionTitulacion;
            const opcionLines = opcionText.length > 70 ? [opcionText.substring(0, 70), opcionText.substring(70)] : [opcionText];
            opcionLines.forEach(l => {
                page.drawText(l, { x: 80, y, size: 11, font: fontBold }); y -= lineHeight;
            });
            
            y -= 5;
            const proyectoText = `"${d.TituloProyecto}"`;
            if (proyectoText.length > 70) {
                page.drawText(proyectoText.substring(0, 70) + '-', { x: 80, y, size: 11, font: fontBold }); y -= lineHeight;
                page.drawText(proyectoText.substring(70), { x: 80, y, size: 11, font: fontBold }); y -= lineHeight * 1.5;
            } else {
                page.drawText(proyectoText, { x: 80, y, size: 11, font: fontBold }); y -= lineHeight * 1.5;
            }

            y -= 10;
            const parrafo2 = `El (la) Presidente (a) del Jurado le hizo saber al sustentante el código de Ética Profesional y le tomó la Protesta de Ley, una vez escrita y leída la firmaron las personas que en el acto protocolario intervinieron, para los efectos legales a que haya lugar, se asienta la presente en la ciudad de ${d.LugarCiudad}, el día ${diaTexto}.`;
            y = drawJustifiedParagraph(parrafo2, y, fontSize, fontReg, lineHeight);


            // --- 8. FIRMAS ---
            
            const yPresidente = height - 600;
            const yAbajo = height - 800;

            // ============================================================
            // === 8.1. PRESIDENTE (Centro) ===
            // ============================================================
            const labelPres = 'PRESIDENTE (A)';
            const wPres = fontBold.widthOfTextAtSize(labelPres, 10);
            page.drawText(labelPres, { x: (width - wPres) / 2, y: yPresidente, size: 10, font: fontBold });
            
            const lineaPY = yPresidente - 60;
            page.drawLine({ start: { x: 200, y: lineaPY }, end: { x: 412, y: lineaPY }, thickness: 1 });

            // Firma Presidente (fima.png)
            const firmaPath = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'fima.png');
            console.log("Buscando Firma Presidente en:", firmaPath);
            if (fs.existsSync(firmaPath)) {
                const firmaBytes = fs.readFileSync(firmaPath);
                let firmaImage;
                if (firmaPath.endsWith('.png')) firmaImage = await pdfDoc.embedPng(firmaBytes);
                else firmaImage = await pdfDoc.embedJpg(firmaBytes);
                
                const scaleFactor = 150 / firmaImage.width;
                const firmaDims = firmaImage.scale(scaleFactor);
                const firmaX = 306 - (firmaDims.width / 2);
                const firmaY = lineaPY + 5; 
                page.drawImage(firmaImage, { x: firmaX, y: firmaY, width: firmaDims.width, height: firmaDims.height });
            } else {
                console.warn("⚠️ ALERTA: No se encontró 'fima.png'");
            }

            const nomP = d.NombrePresidente;
            const wNomP = fontReg.widthOfTextAtSize(nomP, 10);
            page.drawText(nomP, { x: (width - wNomP) / 2, y: yPresidente - 75, size: 10, font: fontReg });
            
            const cedP = `Cédula Prof. ${d.CedulaPresidente}`;
            const wCedP = fontReg.widthOfTextAtSize(cedP, 9);
            page.drawText(cedP, { x: (width - wCedP) / 2, y: yPresidente - 88, size: 9, font: fontReg });


            // ============================================================
            // === 8.2. SECRETARIO (Izquierda) ===
            // ============================================================
            page.drawText('SECRETARIO (A)', { x: 100, y: yAbajo, size: 10, font: fontBold });
            const lineaSY = yAbajo - 60;
            page.drawLine({ start: { x: 60, y: lineaSY }, end: { x: 260, y: lineaSY }, thickness: 1 });

            // Firma Secretario (fima_secretario.png)
            const firmaSecPath = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'fima_secretario.png');
            console.log("Buscando Firma Secretario en:", firmaSecPath);
            
            if (fs.existsSync(firmaSecPath)) {
                const firmaSecBytes = fs.readFileSync(firmaSecPath);
                let firmaSecImage;
                if (firmaSecPath.toLowerCase().endsWith('.png')) firmaSecImage = await pdfDoc.embedPng(firmaSecBytes);
                else firmaSecImage = await pdfDoc.embedJpg(firmaSecBytes);
                
                if (firmaSecImage) {
                    const scaleFactor = 150 / firmaSecImage.width;
                    const firmaSecDims = firmaSecImage.scale(scaleFactor);
                    const firmaSecX = 160 - (firmaSecDims.width / 2);
                    const firmaSecY = lineaSY + 5; 
                    page.drawImage(firmaSecImage, { x: firmaSecX, y: firmaSecY, width: firmaSecDims.width, height: firmaSecDims.height });
                }
            } else {
                console.warn("⚠️ ALERTA: No se encontró 'fima_secretario.png'");
            }
            
            const nomS = d.NombreSecretario;
            const wNomS = fontReg.widthOfTextAtSize(nomS, 10);
            page.drawText(nomS, { x: 160 - (wNomS/2), y: yAbajo - 75, size: 10, font: fontReg });
            const cedS = `Cédula Prof. ${d.CedulaSecretario}`;
            const wCedS = fontReg.widthOfTextAtSize(cedS, 9);
            page.drawText(cedS, { x: 160 - (wCedS/2), y: yAbajo - 88, size: 9, font: fontReg });

            // ============================================================
            // === 8.3. VOCAL (Derecha) ===
            // ============================================================
            page.drawText('VOCAL', { x: 450, y: yAbajo, size: 10, font: fontBold });
            const lineaVY = yAbajo - 60;
            page.drawLine({ start: { x: 352, y: lineaVY }, end: { x: 552, y: lineaVY }, thickness: 1 });
            
            // --- NUEVO: Firma Vocal (fima_vocal.png) ---
            const firmaVocalPath = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'fima_vocal.png');
            console.log("Buscando Firma Vocal en:", firmaVocalPath);
            
            if (fs.existsSync(firmaVocalPath)) {
                const firmaVocalBytes = fs.readFileSync(firmaVocalPath);
                let firmaVocalImage;
                if (firmaVocalPath.toLowerCase().endsWith('.png')) {
                    firmaVocalImage = await pdfDoc.embedPng(firmaVocalBytes);
                } else {
                    firmaVocalImage = await pdfDoc.embedJpg(firmaVocalBytes);
                }
                
                if (firmaVocalImage) {
                    const scaleFactor = 150 / firmaVocalImage.width;
                    const firmaVocalDims = firmaVocalImage.scale(scaleFactor);
                    // Centrar respecto a la línea (352 a 552 -> Centro 452)
                    const firmaVocalX = 452 - (firmaVocalDims.width / 2);
                    const firmaVocalY = lineaVY + 5; 
                    page.drawImage(firmaVocalImage, { x: firmaVocalX, y: firmaVocalY, width: firmaVocalDims.width, height: firmaVocalDims.height });
                }
            } else {
                console.warn("⚠️ ALERTA: No se encontró 'fima_vocal.png'");
            }

            const nomV = d.NombreVocal;
            const wNomV = fontReg.widthOfTextAtSize(nomV, 10);
            page.drawText(nomV, { x: 452 - (wNomV/2), y: yAbajo - 75, size: 10, font: fontReg });
            const cedV = `Cédula Prof. ${d.CedulaVocal}`;
            const wCedV = fontReg.widthOfTextAtSize(cedV, 9);
            page.drawText(cedV, { x: 452 - (wCedV/2), y: yAbajo - 88, size: 9, font: fontReg });


            // 9. FINALIZAR
            const pdfBytes = await pdfDoc.save();
            res.setHeader('Content-Disposition', `inline; filename=Exencion_${d.AlumnoNoControl}.pdf`);
            res.setHeader('Content-Type', 'application/pdf');
            res.send(Buffer.from(pdfBytes));

        } catch (error) {
            console.error("❌ ERROR PDF:", error);
            res.status(500).send('Error interno: ' + error.message);
        }
    });
};