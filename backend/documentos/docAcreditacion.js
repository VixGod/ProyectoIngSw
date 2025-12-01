// Archivo: backend/documentos/docAcreditacion.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// Helper para fecha actual
function obtenerFechaEmision() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    return `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
}

async function llenarAcreditacion(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Certificado CONAIC (Ajuste de Márgenes)...");

    // 1. OBTENER PROGRAMA
    const query = `
        SELECT TOP 1 M.Prog 
        FROM Grupo G
        INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
        INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
        WHERE G.DocenteID = @id
    `;
    const result = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(query);
    let programa = "INGENIERÍA EN SISTEMAS COMPUTACIONALES"; 
    if (result.recordset.length > 0) programa = result.recordset[0].Prog.toUpperCase();

    // 2. CREAR PDF HORIZONTAL
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([792, 612]); // Letter Landscape
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ============================================================
    // 3. LOGOS
    // ============================================================
    try {
        const pathConaic = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'conaic.png');
        const pathCopaes = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'copaes.png');
        const pathTec = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');

        // Izquierda
        if (fs.existsSync(pathConaic)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathConaic));
            page.drawImage(img, { x: 60, y: height - 110, width: 100, height: 50 });
        } else if (fs.existsSync(pathTec)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTec));
            page.drawImage(img, { x: 60, y: height - 110, width: 60, height: 60 });
        }

        // Derecha
        if (fs.existsSync(pathCopaes)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathCopaes));
            page.drawImage(img, { x: width - 160, y: height - 110, width: 100, height: 50 });
        }
    } catch (e) {}

    // ============================================================
    // 4. TEXTOS (Márgenes ajustados hacia arriba)
    // ============================================================
    let yPos = height - 50; // Subimos el inicio
    const centroX = width / 2;

    const centrar = (txt, size, font=fontBold, color=rgb(0,0,0), yOverride=null) => {
        const w = font.widthOfTextAtSize(txt, size);
        page.drawText(txt, { 
            x: (width - w) / 2, 
            y: yOverride || yPos, 
            size, font, color 
        });
        if (!yOverride) yPos -= (size + 4); // Reducimos el espaciado automático
    };

    // Encabezados
    centrar("Consejo Nacional de Acreditación", 14, fontBold, rgb(0, 0.2, 0.4));
    centrar("en Informática y Computación, A.C.", 14, fontBold, rgb(0, 0.2, 0.4));
    yPos -= 8;
    
    centrar("CONSEJO PARA LA ACREDITACIÓN", 9, fontRegular, rgb(0.4, 0.4, 0.4));
    centrar("DE LA EDUCACIÓN SUPERIOR A.C.", 9, fontRegular, rgb(0.4, 0.4, 0.4));
    yPos -= 20;

    // Cuerpo
    const textoIntro = "El Consejo Nacional de Acreditación en Informática y Computación, A.C. con reconocimiento";
    const textoIntro2 = "formal vigente, como organización acreditadora de programas del tipo superior, por el COPAES A.C.";
    
    centrar(textoIntro, 10, fontRegular);
    centrar(textoIntro2, 10, fontRegular);
    yPos -= 20;

    // PALABRA GIGANTE
    centrar("ACREDITA", 32, fontBold, rgb(0.1, 0.1, 0.6));
    yPos -= 15;

    centrar("al PROGRAMA:", 11, fontRegular);
    yPos -= 10;

    // PROGRAMA
    centrar(programa, 16, fontBold); 
    yPos -= 10;

    centrar("Del Instituto Tecnológico de Culiacán", 12, fontBold);
    centrar("Dependencia Tecnológico Nacional de México", 11, fontRegular);
    yPos -= 25;

    // VIGENCIA
    const anioActual = new Date().getFullYear();
    const vigencia = `Del ${new Date().getDate()} de ${obtenerFechaEmision().split(' ')[2]} de ${anioActual} al ${new Date().getDate()} de ${obtenerFechaEmision().split(' ')[2]} de ${anioActual + 5}`;
    
    centrar(vigencia, 11, fontBold);
    yPos -= 15;

    centrar("Por cumplir con los requisitos de calidad educativa", 11, fontRegular);
    centrar("Establecidos por el CONAIC", 11, fontRegular);
    yPos -= 25;

    // FECHA
    centrar(`Ciudad de México, a ${obtenerFechaEmision()}`, 10, fontRegular);

    // ============================================================
    // 5. FIRMA (Subida para que no choque)
    // ============================================================
    yPos -= 40; 
    
    // Línea de firma
    page.drawLine({ start: { x: centroX - 120, y: yPos }, end: { x: centroX + 120, y: yPos }, thickness: 1 });
    yPos -= 15;
    
    centrar("Dr. Francisco Javier Álvarez Rodríguez", 11, fontBold);
    centrar("Presidente", 10, fontRegular);

    // ============================================================
    // 6. PIE DE PÁGINA (Dentro del marco)
    // ============================================================
    const yFooter = 45; // Posición fija segura
    
    page.drawText("N° 1700975", { x: 50, y: yFooter, size: 8, font: fontBold });
    const txtConacyt = "CONACYT - RENIECYT";
    page.drawText(txtConacyt, { x: width - 50 - fontBold.widthOfTextAtSize(txtConacyt, 8), y: yFooter, size: 8, font: fontBold });

    // MARCO DECORATIVO AZUL
    page.drawRectangle({
        x: 30, y: 30,
        width: width - 60,
        height: height - 60,
        borderWidth: 3,
        borderColor: rgb(0.1, 0.1, 0.4),
        opacity: 0
    });

    // Marco interno fino (opcional, para dar estilo diploma)
    page.drawRectangle({
        x: 35, y: 35,
        width: width - 70,
        height: height - 70,
        borderWidth: 1,
        borderColor: rgb(0.7, 0.7, 0.7),
        opacity: 0
    });

    return pdfDoc;
}

module.exports = { llenarAcreditacion };