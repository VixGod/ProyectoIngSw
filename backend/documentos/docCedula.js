const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function llenarCedula(usuarioData) {
    console.log("📄 Generando Validación de Cédula...");

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Carta
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. LOGOS
    try {
        const pathSep = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png');
        const pathTec = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
        if (fs.existsSync(pathSep)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathSep));
            page.drawImage(img, { x: 30, y: height - 80, width: 150, height: 50 });
        }
        if (fs.existsSync(pathTec)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTec));
            page.drawImage(img, { x: width - 100, y: height - 90, width: 60, height: 60 });
        }
    } catch (e) {}

    let yPos = height - 150;

    // 2. TÍTULO
    const titulo = "VALIDACIÓN DE DOCUMENTO PROBATORIO";
    const wTit = fontBold.widthOfTextAtSize(titulo, 14);
    page.drawText(titulo, { x: (width - wTit)/2, y: yPos, size: 14, font: fontBold, color: rgb(0, 0.2, 0.4) });
    
    yPos -= 40;

    // 3. DATOS DEL DOCENTE
    const nombre = `${usuarioData.NombreDocente} ${usuarioData.DocenteApePat} ${usuarioData.DocenteApeMat || ''}`.toUpperCase();
    const cedula = usuarioData.CedulaDocente || "PENDIENTE";
    
    const texto = `El (La) que suscribe, ${nombre}, por medio de la presente hace constar que el documento anexo correspondiente a la CÉDULA PROFESIONAL con número ${cedula}, es auténtico y corresponde fielmente al original expedido por la Dirección General de Profesiones de la Secretaría de Educación Pública.`;

    // --- CORRECCIÓN AQUÍ: Usamos 'line' en todo el bloque ---
    const palabras = texto.split(' ');
    let line = ''; // Antes decía 'let linea', ahora es 'let line'
    for (const p of palabras) {
        if (fontRegular.widthOfTextAtSize(line + p, 12) > 450) {
            page.drawText(line, { x: 80, y: yPos, size: 12, font: fontRegular });
            yPos -= 18;
            line = '';
        }
        line += p + ' ';
    }
    page.drawText(line, { x: 80, y: yPos, size: 12, font: fontRegular });
    // -------------------------------------------------------

    // 4. ESPACIO PARA PEGAR LA CÉDULA
    yPos -= 40;
    page.drawRectangle({
        x: 80, y: yPos - 250, width: 450, height: 250,
        borderWidth: 1, borderColor: rgb(0.8, 0.8, 0.8)
    });
    page.drawText("(ESPACIO PARA ANEXAR COPIA DE CÉDULA O IMPRESIÓN DEL PDF DE LA SEP)", { 
        x: 110, y: yPos - 120, size: 10, font: fontBold, color: rgb(0.6, 0.6, 0.6) 
    });

    // 5. LEYENDA OBLIGATORIA
    yPos -= 300;
    const leyenda = "ES COPIA FIEL DEL ORIGINAL";
    const wLey = fontBold.widthOfTextAtSize(leyenda, 16);
    page.drawText(leyenda, { x: (width - wLey)/2, y: yPos, size: 16, font: fontBold });

    // 6. FIRMA DIGITAL
    yPos -= 60;
    const centro = width / 2;
    page.drawLine({ start: { x: centro - 100, y: yPos }, end: { x: centro + 100, y: yPos }, thickness: 1 });
    
    const wNom = fontBold.widthOfTextAtSize(nombre, 10);
    page.drawText(nombre, { x: centro - (wNom/2), y: yPos - 15, size: 10, font: fontBold });

    if (usuarioData.FirmaDigital) {
        try {
            const firmaImg = await pdfDoc.embedPng(usuarioData.FirmaDigital);
            const dims = firmaImg.scaleToFit(120, 60);
            page.drawImage(firmaImg, { x: centro - (dims.width/2), y: yPos + 5, width: dims.width, height: dims.height });
        } catch(e) {}
    }

    return pdfDoc;
}

module.exports = { llenarCedula };