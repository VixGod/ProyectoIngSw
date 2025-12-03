// Archivo: backend/documentos/docExencion.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// --- HELPER: Fecha texto largo ---
function obtenerFechaTexto(fechaInput) {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const fecha = fechaInput ? new Date(fechaInput) : new Date();
    const userTimezoneOffset = fecha.getTimezoneOffset() * 60000;
    const fechaAjustada = new Date(fecha.getTime() + userTimezoneOffset);
    return `${fechaAjustada.getDate()} de ${meses[fechaAjustada.getMonth()]} del año ${fechaAjustada.getFullYear()}`;
}

async function llenarExencion(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Exención de Examen (Auto-firma Inteligente)...");

    // 1. OBTENER DATOS (Agregamos los IDs para saber quién es quién)
    const query = `
        SELECT TOP 1
            E.AlumnoNombre, E.AlumnoNoControl, E.AlumnoCarrera, E.AlumnoClave,
            E.OpcionTitulacion, E.TituloProyecto, E.FechaExamen, E.LugarCiudad,
            E.PresidenteID, E.SecretarioID, E.VocalID, -- IMPORTANTE: IDs para comparar
            (P.NombreDocente + ' ' + P.DocenteApePat + ' ' + ISNULL(P.DocenteApeMat,'')) as NombrePresidente, 
            P.CedulaDocente as CedulaPresidente,
            (S.NombreDocente + ' ' + S.DocenteApePat + ' ' + ISNULL(S.DocenteApeMat,'')) as NombreSecretario, 
            S.CedulaDocente as CedulaSecretario,
            (V.NombreDocente + ' ' + V.DocenteApePat + ' ' + ISNULL(V.DocenteApeMat,'')) as NombreVocal, 
            V.CedulaDocente as CedulaVocal
        FROM ExamenProfesional E
        INNER JOIN Docente P ON E.PresidenteID = P.DocenteID
        INNER JOIN Docente S ON E.SecretarioID = S.DocenteID
        INNER JOIN Docente V ON E.VocalID = V.DocenteID
        WHERE (E.PresidenteID = @id OR E.SecretarioID = @id OR E.VocalID = @id)
        AND DATEPART(YEAR, E.FechaExamen) = 2024
        ORDER BY E.FechaExamen DESC
    `;

    const result = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(query);
    
    if (result.recordset.length === 0) {
        const pdfError = await PDFDocument.create();
        const p = pdfError.addPage();
        p.drawText("No se encontraron registros de Exámenes en 2024.", { x: 50, y: 700 });
        return pdfError;
    }

    const d = result.recordset[0];

    // 2. CONFIGURACIÓN PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Carta
    const { width, height } = page.getSize();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ============================================================
    // 3. ENCABEZADO (LOGOS)
    // ============================================================
    try {
        const pathLogo = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
        if (fs.existsSync(pathLogo)) {
            const logo = await pdfDoc.embedPng(fs.readFileSync(pathLogo));
            page.drawImage(logo, { x: 50, y: height - 120, width: 70, height: 70 });
        }
    } catch (e) {}

    const headerY = height - 80;
    const txtInst1 = "INSTITUTO TECNOLÓGICO";
    const txtInst2 = "DE CULIACÁN";
    const txtNum = "002";

    page.drawText(txtInst1, { x: width - 60 - fontBold.widthOfTextAtSize(txtInst1, 11), y: headerY, size: 11, font: fontBold });
    page.drawText(txtInst2, { x: width - 60 - fontBold.widthOfTextAtSize(txtInst2, 11), y: headerY - 14, size: 11, font: fontBold });
    page.drawText(txtNum, { x: width - 60 - fontBold.widthOfTextAtSize(txtNum, 9), y: headerY - 28, size: 9, font: fontBold });

    const titulo = "CARTA DE EXENCIÓN DE EXAMEN PROFESIONAL";
    page.drawText(titulo, { x: (width - fontBold.widthOfTextAtSize(titulo, 11)) / 2, y: height - 170, size: 11, font: fontBold });

    // ============================================================
    // 4. CUERPO DEL TEXTO
    // ============================================================
    let yPos = height - 220;
    const margenIzq = 60;
    const maxAncho = 492; 
    const fontSize = 10;
    const lineHeight = 14;

    // Helper de Justificación (Simplificado)
    const pintarParrafo = (texto) => {
        const palabras = texto.split(' ');
        let linea = '';
        palabras.forEach(palabra => {
            if (fontRegular.widthOfTextAtSize(linea + palabra, fontSize) > maxAncho) {
                page.drawText(linea, { x: margenIzq, y: yPos, size: fontSize, font: fontRegular });
                yPos -= lineHeight;
                linea = '';
            }
            linea += palabra + ' ';
        });
        page.drawText(linea, { x: margenIzq, y: yPos, size: fontSize, font: fontRegular });
        yPos -= lineHeight;
    };

    // Construimos el texto dinámicamente
    const textoCompleto = `De acuerdo con el instructivo vigente de Titulación, que no tiene como requisito la sustentación del Examen Profesional para efectos de obtención de Título, en las opciones VIII, IX y Titulación Integral, el jurado HACE CONSTAR que el (la) C. ${d.AlumnoNombre.toUpperCase()} número de control ${d.AlumnoNoControl} egresado (a) del Tecnológico de Culiacán, clave ${d.AlumnoClave}, que cursó la carrera de ${d.AlumnoCarrera}. Cumplió satisfactoriamente con lo estipulado en la opción: ${d.OpcionTitulacion}. Título del proyecto: "${d.TituloProyecto}".`;
    
    pintarParrafo(textoCompleto);
    yPos -= 20;

    const fechaTxt = obtenerFechaTexto(d.FechaExamen);
    const cierre = `El (la) Presidente (a) del Jurado le hizo saber al sustentante el código de Ética Profesional y le tomó la Protesta de Ley, una vez escrita y leída la firmaron las personas que en el acto protocolario intervinieron, para los efectos legales a que haya lugar, se asienta la presente en la ciudad de Culiacán, Sinaloa, el día ${fechaTxt}.`;
    pintarParrafo(cierre);

    // ============================================================
    // 5. FIRMAS INTELIGENTES
    // ============================================================
    const yFirmaArriba = yPos - 60;  
    const yFirmaAbajo = yFirmaArriba - 100; 
    const centroX = width / 2;

    // Función para estampar firma si coincide el ID
    const estamparSiCorresponde = async (rolID, x, y) => {
        // Solo firmamos si el ID del rol coincide con el usuario logueado Y tiene firma
        if (rolID === usuarioData.DocenteID && usuarioData.FirmaDigital) {
            try {
                const img = await pdfDoc.embedPng(usuarioData.FirmaDigital);
                const dims = img.scaleToFit(120, 50);
                page.drawImage(img, { x: x - (dims.width/2), y: y + 2, width: dims.width, height: dims.height });
            } catch(e) { console.log("Error firma", e); }
        }
    };

    // --- PRESIDENTE ---
    page.drawText("PRESIDENTE (A)", { x: centroX - (fontBold.widthOfTextAtSize("PRESIDENTE (A)", 8)/2), y: yFirmaArriba + 5, size: 8, font: fontBold });
    page.drawLine({ start: { x: centroX - 80, y: yFirmaArriba }, end: { x: centroX + 80, y: yFirmaArriba }, thickness: 1 });
    page.drawText(d.NombrePresidente.toUpperCase(), { x: centroX - (fontRegular.widthOfTextAtSize(d.NombrePresidente.toUpperCase(), 9)/2), y: yFirmaArriba - 12, size: 9, font: fontRegular });
    page.drawText(`Cédula Prof. ${d.CedulaPresidente}`, { x: centroX - (fontRegular.widthOfTextAtSize(`Cédula Prof. ${d.CedulaPresidente}`, 8)/2), y: yFirmaArriba - 22, size: 8, font: fontRegular });
    
    // Intenta firmar Presidente
    await estamparSiCorresponde(d.PresidenteID, centroX, yFirmaArriba);

    // --- SECRETARIO ---
    const xSec = 160;
    page.drawText("SECRETARIO (A)", { x: xSec - (fontBold.widthOfTextAtSize("SECRETARIO (A)", 8)/2), y: yFirmaAbajo + 5, size: 8, font: fontBold });
    page.drawLine({ start: { x: xSec - 80, y: yFirmaAbajo }, end: { x: xSec + 80, y: yFirmaAbajo }, thickness: 1 });
    page.drawText(d.NombreSecretario.toUpperCase(), { x: xSec - (fontRegular.widthOfTextAtSize(d.NombreSecretario.toUpperCase(), 9)/2), y: yFirmaAbajo - 12, size: 9, font: fontRegular });
    page.drawText(`Cédula Prof. ${d.CedulaSecretario}`, { x: xSec - (fontRegular.widthOfTextAtSize(`Cédula Prof. ${d.CedulaSecretario}`, 8)/2), y: yFirmaAbajo - 22, size: 8, font: fontRegular });

    // Intenta firmar Secretario
    await estamparSiCorresponde(d.SecretarioID, xSec, yFirmaAbajo);

    // --- VOCAL ---
    const xVoc = width - 160;
    page.drawText("VOCAL", { x: xVoc - (fontBold.widthOfTextAtSize("VOCAL", 8)/2), y: yFirmaAbajo + 5, size: 8, font: fontBold });
    page.drawLine({ start: { x: xVoc - 80, y: yFirmaAbajo }, end: { x: xVoc + 80, y: yFirmaAbajo }, thickness: 1 });
    page.drawText(d.NombreVocal.toUpperCase(), { x: xVoc - (fontRegular.widthOfTextAtSize(d.NombreVocal.toUpperCase(), 9)/2), y: yFirmaAbajo - 12, size: 9, font: fontRegular });
    page.drawText(`Cédula Prof. ${d.CedulaVocal}`, { x: xVoc - (fontRegular.widthOfTextAtSize(`Cédula Prof. ${d.CedulaVocal}`, 8)/2), y: yFirmaAbajo - 22, size: 8, font: fontRegular });

    // Intenta firmar Vocal
    await estamparSiCorresponde(d.VocalID, xVoc, yFirmaAbajo);

    return pdfDoc;
}

module.exports = { llenarExencion };