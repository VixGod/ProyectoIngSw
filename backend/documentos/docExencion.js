// Archivo: backend/documentos/docExencion.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// --- HELPER: Fecha texto largo (21 de junio del año 2024) ---
function obtenerFechaTexto(fechaInput) {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const fecha = fechaInput ? new Date(fechaInput) : new Date();
    
    // Ajuste de zona horaria para evitar desfase de día
    const userTimezoneOffset = fecha.getTimezoneOffset() * 60000;
    const fechaAjustada = new Date(fecha.getTime() + userTimezoneOffset);

    const dia = fechaAjustada.getDate();
    return `${dia} de ${meses[fechaAjustada.getMonth()]} del año ${fechaAjustada.getFullYear()}`;
}

// --- HELPER: Obtener fecha corta para el oficio ---
function obtenerFechaCorta() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    return `${hoy.getDate()}/${meses[hoy.getMonth()]}/${hoy.getFullYear()}`;
}

async function llenarExencion(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Exención de Examen (Diseño Oficial - Corregido)...");

    // 1. OBTENER DATOS (Sin pedir FirmaDigital a la tabla Docente)
    const query = `
        SELECT TOP 1
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
        WHERE E.PresidenteID = @id OR E.SecretarioID = @id OR E.VocalID = @id
        ORDER BY E.FechaExamen DESC
    `;

    const result = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(query);
    
    if (result.recordset.length === 0) {
        const pdfError = await PDFDocument.create();
        const p = pdfError.addPage();
        p.drawText("No se encontraron registros de Exámenes.", { x: 50, y: 700 });
        return pdfError;
    }

    const d = result.recordset[0];

    // 2. CONFIGURACIÓN PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ============================================================
    // 3. ENCABEZADO
    // ============================================================
    
    // Logo Izquierdo (Engranaje Azul)
    try {
        const pathLogo = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
        if (fs.existsSync(pathLogo)) {
            const logoBytes = fs.readFileSync(pathLogo);
            const logo = await pdfDoc.embedPng(logoBytes);
            page.drawImage(logo, { x: 50, y: height - 120, width: 70, height: 70 });
        }
    } catch (e) { console.log("Logo no encontrado"); }

    // Texto Derecho
    const headerY = height - 80;
    const txtInst1 = "INSTITUTO TECNOLÓGICO";
    const txtInst2 = "DE CULIACÁN";
    const txtNum = "002";

    page.drawText(txtInst1, { 
        x: width - 60 - fontBold.widthOfTextAtSize(txtInst1, 11), 
        y: headerY, size: 11, font: fontBold 
    });
    page.drawText(txtInst2, { 
        x: width - 60 - fontBold.widthOfTextAtSize(txtInst2, 11), 
        y: headerY - 14, size: 11, font: fontBold 
    });
    page.drawText(txtNum, { 
        x: width - 60 - fontBold.widthOfTextAtSize(txtNum, 9), 
        y: headerY - 28, size: 9, font: fontBold 
    });

    // Título Centrado
    const titulo = "CARTA DE EXENCIÓN DE EXAMEN PROFESIONAL";
    const wTitulo = fontBold.widthOfTextAtSize(titulo, 11);
    page.drawText(titulo, { x: (width - wTitulo) / 2, y: height - 170, size: 11, font: fontBold });


    // ============================================================
    // 4. CUERPO DEL TEXTO
    // ============================================================
    let yPos = height - 220;
    const margenIzq = 60;
    const maxAncho = 492; 
    const fontSize = 10;
    const lineHeight = 14;

    // --- PÁRRAFO 1 ---
    const parrafo1 = [
        { text: "De acuerdo con el instructivo vigente de Titulación, que no tiene como requisito la sustentación del Examen Profesional para efectos de obtención de Título, en las opciones VIII, IX y Titulación Integral, el jurado HACE CONSTAR que el (la) C. ", bold: false },
        { text: d.AlumnoNombre.toUpperCase(), bold: true },
        { text: " número de control ", bold: false },
        { text: d.AlumnoNoControl, bold: false },
        { text: " egresado (a) del ", bold: false },
        { text: "Tecnológico de Culiacán", bold: false },
        { text: ", clave ", bold: false },
        { text: d.AlumnoClave, bold: false },
        { text: ", que cursó la carrera de ", bold: false },
        { text: d.AlumnoCarrera, bold: false },
        { text: "..", bold: false } 
    ];

    // Helper de Justificación
    const pintarParrafo = (items, startY) => {
        let currentY = startY;
        let linea = [];
        let anchoL = 0;

        const flush = (arr, justificar) => {
            let x = margenIzq;
            if (!justificar) {
                arr.forEach(i => {
                    const f = i.bold ? fontBold : fontRegular;
                    page.drawText(i.word, { x, y: currentY, size: fontSize, font: f });
                    x += f.widthOfTextAtSize(i.word + " ", fontSize);
                });
            } else {
                let wTxt = 0; arr.forEach(i => wTxt += (i.bold?fontBold:fontRegular).widthOfTextAtSize(i.word, fontSize));
                const espacios = arr.length - 1;
                const gap = espacios > 0 ? (maxAncho - wTxt) / espacios : 0;
                arr.forEach((i, idx) => {
                    const f = i.bold ? fontBold : fontRegular;
                    page.drawText(i.word, { x, y: currentY, size: fontSize, font: f });
                    x += f.widthOfTextAtSize(i.word, fontSize) + (idx < espacios ? gap : 0);
                });
            }
            currentY -= lineHeight;
        };

        items.forEach(frag => {
            frag.text.split(' ').forEach(w => {
                if(!w) return;
                const f = frag.bold ? fontBold : fontRegular;
                const wWord = f.widthOfTextAtSize(w, fontSize);
                const wSpace = f.widthOfTextAtSize(" ", fontSize);
                if (anchoL + wWord > maxAncho) { flush(linea, true); linea = []; anchoL = 0; }
                linea.push({ word: w, bold: frag.bold });
                anchoL += wWord + wSpace;
            });
        });
        if (linea.length) flush(linea, false);
        return currentY;
    };

    yPos = pintarParrafo(parrafo1, yPos);
    yPos -= 15;

    // --- OPCIÓN Y PROYECTO ---
    page.drawText("Cumplió satisfactoriamente con lo estipulado en la opción:", { x: margenIzq, y: yPos, size: fontSize, font: fontRegular });
    yPos -= 20;

    const opcionTxt = d.OpcionTitulacion;
    page.drawText(opcionTxt, { x: margenIzq + 20, y: yPos, size: fontSize, font: fontBold });
    yPos -= 20;

    const proyectoTxt = `"${d.TituloProyecto}"`;
    if (fontBold.widthOfTextAtSize(proyectoTxt, fontSize) > (maxAncho - 20)) {
        const mitad = Math.floor(proyectoTxt.length / 2);
        page.drawText(proyectoTxt.substring(0, mitad) + "-", { x: margenIzq + 20, y: yPos, size: fontSize, font: fontBold });
        yPos -= 14;
        page.drawText(proyectoTxt.substring(mitad), { x: margenIzq + 20, y: yPos, size: fontSize, font: fontBold });
    } else {
        page.drawText(proyectoTxt, { x: margenIzq + 20, y: yPos, size: fontSize, font: fontBold });
    }
    yPos -= 30;

    // --- PÁRRAFO FINAL ---
    const fechaTxt = obtenerFechaTexto(d.FechaExamen);
    const parrafoFinal = [
        { text: "El (la) Presidente (a) del Jurado le hizo saber al sustentante el código de Ética Profesional y le tomó la Protesta de Ley, una vez escrita y leída la firmaron las personas que en el acto protocolario intervinieron, para los efectos legales a que haya lugar, se asienta la presente en la ciudad de Culiacán, Sinaloa, el día ", bold: false },
        { text: fechaTxt + ".", bold: false }
    ];
    yPos = pintarParrafo(parrafoFinal, yPos);


    // ============================================================
    // 5. FIRMAS (Sin intentar cargar imágenes inexistentes)
    // ============================================================
    
    const yFirmaArriba = yPos - 80;  
    const yFirmaAbajo = yFirmaArriba - 120; 
    const centroX = width / 2;

    // --- PRESIDENTE (Centro) ---
    const lblPres = "PRESIDENTE (A)";
    page.drawText(lblPres, { 
        x: centroX - (fontBold.widthOfTextAtSize(lblPres, 8) / 2), 
        y: yFirmaArriba + 5, size: 8, font: fontBold 
    });

    page.drawLine({ start: { x: centroX - 80, y: yFirmaArriba }, end: { x: centroX + 80, y: yFirmaArriba }, thickness: 1 });

    const nomP = d.NombrePresidente;
    const cedP = `Cédula Prof. ${d.CedulaPresidente}`;
    page.drawText(nomP, { x: centroX - (fontRegular.widthOfTextAtSize(nomP, 9)/2), y: yFirmaArriba - 12, size: 9, font: fontRegular });
    page.drawText(cedP, { x: centroX - (fontRegular.widthOfTextAtSize(cedP, 8)/2), y: yFirmaArriba - 22, size: 8, font: fontRegular });


    // --- SECRETARIO (Izquierda) ---
    const xSec = 160;
    const lblSec = "SECRETARIO (A)";
    page.drawText(lblSec, { x: xSec - (fontBold.widthOfTextAtSize(lblSec, 8)/2), y: yFirmaAbajo + 5, size: 8, font: fontBold });

    page.drawLine({ start: { x: xSec - 80, y: yFirmaAbajo }, end: { x: xSec + 80, y: yFirmaAbajo }, thickness: 1 });

    const nomS = d.NombreSecretario;
    const cedS = `Cédula Prof. ${d.CedulaSecretario}`;
    page.drawText(nomS, { x: xSec - (fontRegular.widthOfTextAtSize(nomS, 9)/2), y: yFirmaAbajo - 12, size: 9, font: fontRegular });
    page.drawText(cedS, { x: xSec - (fontRegular.widthOfTextAtSize(cedS, 8)/2), y: yFirmaAbajo - 22, size: 8, font: fontRegular });


    // --- VOCAL (Derecha) ---
    const xVoc = width - 160;
    const lblVoc = "VOCAL";
    page.drawText(lblVoc, { x: xVoc - (fontBold.widthOfTextAtSize(lblVoc, 8)/2), y: yFirmaAbajo + 5, size: 8, font: fontBold });

    page.drawLine({ start: { x: xVoc - 80, y: yFirmaAbajo }, end: { x: xVoc + 80, y: yFirmaAbajo }, thickness: 1 });

    const nomV = d.NombreVocal;
    const cedV = `Cédula Prof. ${d.CedulaVocal}`;
    page.drawText(nomV, { x: xVoc - (fontRegular.widthOfTextAtSize(nomV, 9)/2), y: yFirmaAbajo - 12, size: 9, font: fontRegular });
    page.drawText(cedV, { x: xVoc - (fontRegular.widthOfTextAtSize(cedV, 8)/2), y: yFirmaAbajo - 22, size: 8, font: fontRegular });

    return pdfDoc;
}

module.exports = { llenarExencion };