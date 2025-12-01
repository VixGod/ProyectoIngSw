// Archivo: backend/documentos/docServicios.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// --- HELPER: Fecha texto largo ---
function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const dia = hoy.getDate();
    const anioTexto = anio === 2025 ? "dos mil veinticinco" : anio; 
    return `${dia < 10 ? '0'+dia : dia} días del mes de ${meses[hoy.getMonth()]} de ${anioTexto}`;
}

async function llenarServicios(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Servicios Escolares (Año Completo Forzado)...");

    // 1. OBTENER DATOS (Filtrando por el año en curso o el que desees)
    // Se fuerza la búsqueda de todo el año 2025
    const targetYear = 2025; 

    const queryMaterias = `
        SELECT 
            P.NombrePeriodo,
            ISNULL(G.Nivel, 'LICENCIATURA') as Nivel,
            M.Clave,
            M.NombreMateria,
            G.NumAlumnos
        FROM Grupo G
        INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
        INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
        INNER JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
        WHERE G.DocenteID = @id
        -- Filtramos por texto del año para asegurar que traiga ambos periodos si existen
        AND P.NombrePeriodo LIKE '%' + @anio + '%'
        ORDER BY P.FechaIniciPer ASC, M.NombreMateria ASC
    `;

    const result = await pool.request()
        .input('id', sql.Int, usuarioData.DocenteID)
        .input('anio', sql.VarChar, targetYear.toString())
        .query(queryMaterias);
        
    const materiasEncontradas = result.recordset;

    // --- LÓGICA DE FORZADO DE PERIODOS ---
    // Creamos la estructura vacía para los dos periodos obligatorios
    const estructuraAnio = [
        { nombre: `Enero-Junio ${targetYear}`, corto: `ENE-JUN ${targetYear}`, datos: [] },
        { nombre: `Agosto-Diciembre ${targetYear}`, corto: `AGO-DIC ${targetYear}`, datos: [] }
    ];

    let totalAlumnos = 0;

    // Llenamos los cubos con lo que encontramos en la BD
    materiasEncontradas.forEach(m => {
        totalAlumnos += m.NumAlumnos;
        // Clasificamos según el nombre del periodo que viene de la BD
        if (m.NombrePeriodo.toUpperCase().includes("ENERO-JUNIO")) {
            estructuraAnio[0].datos.push(m);
        } else if (m.NombrePeriodo.toUpperCase().includes("AGOSTO-DICIEMBRE")) {
            estructuraAnio[1].datos.push(m);
        }
    });

    // 2. CONFIGURACIÓN PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Carta
    const { width, height } = page.getSize();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ============================================================
    // 3. ENCABEZADO
    // ============================================================
    try {
        const pathSep = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png');
        const pathTecNM = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
        
        if (fs.existsSync(pathSep)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathSep));
            page.drawImage(img, { x: 40, y: height - 80, width: 150, height: 40 });
        } else if (fs.existsSync(pathTecNM)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTecNM));
            page.drawImage(img, { x: 40, y: height - 100, width: 60, height: 60 });
        }

        if (fs.existsSync(pathTecNM)) { 
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTecNM));
            page.drawImage(img, { x: width - 90, y: height - 90, width: 50, height: 50 });
        }
    } catch (e) {}

    let yPos = height - 110;
    const alignRight = (txt, f=fontRegular, s=10) => width - 50 - f.widthOfTextAtSize(txt, s);
    
    page.drawText("Instituto Tecnológico de Culiacán", { x: alignRight("Instituto Tecnológico de Culiacán", fontBold, 9), y: yPos, size: 9, font: fontBold });
    yPos -= 12;
    page.drawText("Depto. de Servicios Escolares", { x: alignRight("Depto. de Servicios Escolares", fontBold, 9), y: yPos, size: 9, font: fontBold });
    yPos -= 10;
    page.drawText("Asunto: Constancia.", { x: alignRight("Asunto: Constancia.", fontRegular, 9), y: yPos, size: 9, font: fontRegular });

    yPos -= 50;
    const margenIzq = 50;
    
    page.drawText("COMISIÓN DE EVALUACIÓN DEL TECNM", { x: margenIzq, y: yPos, size: 10, font: fontBold }); yPos -= 12;
    page.drawText("PROGRAMA DE ESTIMULOS AL DESEMPEÑO DEL PERSONAL DOCENTE", { x: margenIzq, y: yPos, size: 10, font: fontBold }); yPos -= 12;
    page.drawText("DE LOS INSTITUTOS TECNOLÓGICOS FEDERALES Y CENTROS", { x: margenIzq, y: yPos, size: 10, font: fontBold }); yPos -= 12;
    page.drawText("PRESENTE.-", { x: margenIzq, y: yPos, size: 10, font: fontBold });

    yPos -= 30;
    const nombreDocente = `${usuarioData.NombreDocente} ${usuarioData.DocenteApePat} ${usuarioData.DocenteApeMat || ''}`.toUpperCase();
    const expediente = usuarioData.DocenteID.toString().padStart(4, '0');

    // Texto fijo solicitando ambos periodos
    const textoCuerpo = `La que suscribe, hace constar que según registros que existen en el archivo escolar, la C. MGTI. ${nombreDocente}, expediente ${expediente} impartió las siguientes materias durante los Periodos Enero-Junio y Agosto-Diciembre del año ${targetYear}:`;

    // Wrap texto
    const words = textoCuerpo.split(' ');
    let line = '';
    for (const w of words) {
        if (fontRegular.widthOfTextAtSize(line + w, 10) > 520) {
            page.drawText(line, { x: margenIzq, y: yPos, size: 10, font: fontRegular });
            yPos -= 14;
            line = '';
        }
        line += w + ' ';
    }
    page.drawText(line, { x: margenIzq, y: yPos, size: 10, font: fontRegular });
    yPos -= 25;

    // ============================================================
    // 4. TABLA GRID (Forzando ambos periodos)
    // ============================================================
    
    const startX = 40;
    const colWidths = [90, 80, 70, 220, 70]; 
    const colX = [startX, startX + colWidths[0], startX + colWidths[0] + colWidths[1], startX + colWidths[0] + colWidths[1] + colWidths[2], startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]];
    const rowHeight = 20;

    const drawRow = (y, texts, isHeader=false) => {
        const font = isHeader ? fontBold : fontRegular;
        const size = 8;
        for (let i = 0; i < 5; i++) {
            page.drawRectangle({
                x: colX[i], y: y - rowHeight + 5, width: colWidths[i], height: rowHeight,
                borderWidth: 0.5, borderColor: rgb(0,0,0), opacity: 0, borderOpacity: 1
            });
            if (texts[i]) {
                const txt = texts[i].toString();
                const txtW = font.widthOfTextAtSize(txt, size);
                // Alineación: Nombre materia (col 3) izq, resto centro
                const textX = (i === 3) ? colX[i] + 5 : colX[i] + (colWidths[i] - txtW) / 2;
                page.drawText(txt, { x: textX, y: y, size: size, font: font });
            }
        }
    };

    // Header
    const headers = ["PERIODO", "NIVEL", "CLAVE DE LA", "NOMBRE DE LA MATERIA", "ALUMNOS"];
    drawRow(yPos, headers, true);
    page.drawText("MATERIA", { x: colX[2] + 15, y: yPos - 8, size: 8, font: fontBold });
    page.drawText("ATENDIDOS", { x: colX[4] + 10, y: yPos - 8, size: 8, font: fontBold });
    yPos -= rowHeight;

    // --- BUCLE PARA LOS 2 PERIODOS (FORZADO) ---
    
    estructuraAnio.forEach((periodoObj) => {
        
        // 1. Verificar si hay datos
        if (periodoObj.datos.length > 0) {
            // SI HAY DATOS: Los pintamos normal
            let firstRow = true;
            periodoObj.datos.forEach(m => {
                // Control salto de página
                if (yPos < 100) { pdfDoc.addPage([612, 792]); yPos = 700; drawRow(yPos, headers, true); yPos -= rowHeight; }

                const txtPeriodo = firstRow ? periodoObj.corto : '"';
                const txtNivel = (firstRow || m.Nivel !== "LICENCIATURA") ? m.Nivel : '"';
                
                drawRow(yPos, [txtPeriodo, txtNivel, m.Clave, m.NombreMateria.substring(0, 45), m.NumAlumnos]);
                yPos -= rowHeight;
                firstRow = false;
            });
        } else {
            // NO HAY DATOS: Pintamos una fila vacía o con guiones para que se vea el periodo
            if (yPos < 100) { pdfDoc.addPage([612, 792]); yPos = 700; drawRow(yPos, headers, true); yPos -= rowHeight; }
            
            drawRow(yPos, [periodoObj.corto, "---", "---", "SIN CARGA ACADÉMICA REGISTRADA", "0"]);
            yPos -= rowHeight;
        }
    });

    // --- TOTAL ---
    page.drawRectangle({
        x: startX, y: yPos - rowHeight + 5, width: colWidths[0]+colWidths[1]+colWidths[2]+colWidths[3], height: rowHeight,
        borderWidth: 0.5, borderColor: rgb(0,0,0)
    });
    const txtTotal = "Total";
    page.drawText(txtTotal, { x: (startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]) - fontBold.widthOfTextAtSize(txtTotal, 9) - 10, y: yPos, size: 9, font: fontBold });

    page.drawRectangle({
        x: colX[4], y: yPos - rowHeight + 5, width: colWidths[4], height: rowHeight,
        borderWidth: 0.5, borderColor: rgb(0,0,0)
    });
    const txtNumTotal = totalAlumnos.toString();
    page.drawText(txtNumTotal, { x: colX[4] + (colWidths[4] - fontBold.widthOfTextAtSize(txtNumTotal, 9))/2, y: yPos, size: 9, font: fontBold });


    // ============================================================
    // 5. PIE Y FIRMA
    // ============================================================
    yPos -= 50;
    const textoPie = `Se extiende la presente, en la ciudad de Culiacán, Sinaloa, a los ${obtenerFechaTexto()}, para los fines que más convengan al interesado.`;
    
    // Wrap pie
    const pieWords = textoPie.split(' ');
    line = '';
    for (const w of pieWords) {
        if (fontRegular.widthOfTextAtSize(line + w, 10) > 500) {
            page.drawText(line, { x: margenIzq, y: yPos, size: 10, font: fontRegular });
            yPos -= 14;
            line = '';
        }
        line += w + ' ';
    }
    page.drawText(line, { x: margenIzq, y: yPos, size: 10, font: fontRegular });

    yPos -= 60;
    page.drawText("ATENTAMENTE", { x: margenIzq, y: yPos, size: 8, font: fontBold });
    yPos -= 10;
    page.drawText("Excelencia en Educación Tecnológica®", { x: margenIzq, y: yPos, size: 7, font: fontRegular });
    
    yPos -= 80;
    const centroPagina = width / 2;
    page.drawLine({ start: { x: 150, y: yPos }, end: { x: 450, y: yPos }, thickness: 1 });
    
    // Buscar nombre Jefa
    const qJefa = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM ServiciosEscolares");
    let nombreJefa = "DINORAH MEZA GARCIA";
    if (qJefa.recordset.length > 0) { const j = qJefa.recordset[0]; nombreJefa = `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase(); }

    const wNom = fontBold.widthOfTextAtSize(nombreJefa, 9);
    page.drawText(nombreJefa, { x: centroPagina - (wNom/2), y: yPos - 12, size: 9, font: fontBold });
    
    const puesto = "JEFA DEL DEPTO. DE SERVICIOS ESCOLARES";
    const wPuesto = fontBold.widthOfTextAtSize(puesto, 8);
    page.drawText(puesto, { x: centroPagina - (wPuesto/2), y: yPos - 22, size: 8, font: fontBold });

    // Footer
    try {
        const pathPie = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'footer_logos.png');
        if (fs.existsSync(pathPie)) {
            const footerBytes = fs.readFileSync(pathPie);
            const footerImg = await pdfDoc.embedPng(footerBytes);
            page.drawImage(footerImg, { x: (width - 500)/2, y: 30, width: 500, height: 40 });
        }
        page.drawText('Juan de Dios Bátiz 310 Pte. Col. Guadalupe C.P. 80220', { x: 200, y: 75, size: 6, font: fontRegular });
        page.drawText('Culiacán, Sinaloa. Tel. 667-454-0100', { x: 200, y: 68, size: 6, font: fontRegular });
        page.drawText('tecnm.mx | www.culiacan.tecnm.mx', { x: 200, y: 61, size: 6, font: fontRegular });
    } catch (e) {}

    return pdfDoc;
}

module.exports = { llenarServicios };