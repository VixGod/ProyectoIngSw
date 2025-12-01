const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// --- HELPER: Obtener fecha texto largo ---
function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    const anio = hoy.getFullYear();
    // Array simple para días (puedes ampliarlo o usar librería)
    const dias = ["cero","un","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve","treinta","treinta y uno"];
    return `${dias[hoy.getDate()] || hoy.getDate()} días del mes de ${meses[hoy.getMonth()]} del año ${anio < 2030 ? 'dos mil veinticinco' : anio}`;
}

// --- HELPER: Obtener fecha corta ---
function obtenerFechaCorta() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    return `${hoy.getDate()}/${meses[hoy.getMonth()]}/${hoy.getFullYear()}`;
}

async function llenarCreditos(pdfBytesIgnorado, usuarioData, pool) {
    // 1. CREAR DOCUMENTO DESDE CERO (Carta Vertical)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Tamaño Carta (Letter)
    const { width, height } = page.getSize();

    // 2. CARGAR FUENTES (Regular y Negrita para destacar datos)
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 11;

    // 3. OBTENER DATOS DE SQL
    const queryActividad = `
        SELECT TOP 1 A.ActAdmPuesto, A.NumDict, A.NumAlum, A.NumAcred, Ar.NombreArea, P.NombrePeriodo,
        (Resp.NombreTitular + ' ' + Resp.ApePatTitular + ' ' + ISNULL(Resp.ApeMatTitular, '')) as NombreResponsable,
        Resp.RFCTitular
        FROM ActividadAdministrativa A
        INNER JOIN Area Ar ON A.AreaID = Ar.AreaID
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        INNER JOIN ResponsableArea Resp ON Ar.AreaID = Resp.AreaID
        WHERE A.DocenteID = @idDocente ORDER BY P.FechaFinPer DESC
    `;
    const result = await pool.request().input('idDocente', sql.Int, usuarioData.DocenteID).query(queryActividad);
    
    if (result.recordset.length === 0) throw new Error("No hay actividades registradas.");
    const act = result.recordset[0];

    // ==========================================
    // 4. DIBUJAR ENCABEZADO (LOGOS)
    // ==========================================
    // Ajusta los nombres de tus imágenes según las tengas en tu carpeta
    try {
        const pathLogoIzq = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png');
        const pathLogoDer = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'bandera.jpg'); 
        
        if (fs.existsSync(pathLogoIzq)) {
            const logoIzqBytes = fs.readFileSync(pathLogoIzq);
            const logoIzq = await pdfDoc.embedPng(logoIzqBytes); // O embedJpg si son JPG
            page.drawImage(logoIzq, { x: 40, y: height - 80, width: 150, height: 40 });
        }
        if (fs.existsSync(pathLogoDer)) {
            const logoDerBytes = fs.readFileSync(pathLogoDer);
            const logoDer = await pdfDoc.embedJpg(logoDerBytes);
            page.drawImage(logoDer, { x: width - 100, y: height - 80, width: 60, height: 40 });
        }
    } catch (e) { console.log("Logos no encontrados, saltando..."); }

    // Texto Instituto (Abajo de logos a la derecha)
    page.drawText('Instituto Tecnológico de Culiacán', { x: width - 220, y: height - 110, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });

    // ==========================================
    // 5. DATOS SUPERIORES (FECHA Y OFICIO)
    // ==========================================
    let yPos = height - 160;
    const alignRight = (text) => width - 50 - fontBold.widthOfTextAtSize(text, 10);

    const textoCiudad = `Culiacán, Sinaloa, ${obtenerFechaCorta()}`;
    const textoOficio = `OFICIO No.: ${act.NombreArea.substring(0,2).toUpperCase()}-030/${new Date().getFullYear()}`;
    const textoAsunto = `ASUNTO: Constancia.`;

    page.drawText(textoCiudad, { x: alignRight(textoCiudad), y: yPos, size: 10, font: fontRegular });
    yPos -= 12;
    page.drawText(textoOficio, { x: alignRight(textoOficio), y: yPos, size: 10, font: fontBold });
    yPos -= 12;
    page.drawText(textoAsunto, { x: alignRight(textoAsunto), y: yPos, size: 10, font: fontBold });

    // ==========================================
    // 6. DESTINATARIO
    // ==========================================
    yPos -= 50;
    const margenIzq = 50;
    page.drawText('COMISIÓN DE EVALUACIÓN DEL', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PROGRAMA DE ESTÍMULOS AL DESEMPEÑO DEL PERSONAL DOCENTE', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PARA LOS INSTITUTOS TECNOLÓGICOS FEDERALES Y CENTROS.', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PRESENTE.', { x: margenIzq, y: yPos, size: 10, font: fontRegular });

    // ==========================================
    // 7. CUERPO DEL DOCUMENTO (MIXTO BOLD/REGULAR)
    // ==========================================
    yPos -= 40;
    const lineHeight = 16;
    const maxWidth = width - 100; // Margen derecho 50
    let currentX = margenIzq;

    // Función auxiliar para escribir corrido y bajar de línea si no cabe
    function escribir(texto, esNegrita = false) {
        const font = esNegrita ? fontBold : fontRegular;
        const palabras = texto.split(' ');
        
        palabras.forEach(palabra => {
            const w = font.widthOfTextAtSize(palabra + ' ', fontSize);
            if (currentX + w > width - 50) { // Salto de línea
                currentX = margenIzq;
                yPos -= lineHeight;
            }
            page.drawText(palabra + ' ', { x: currentX, y: yPos, size: fontSize, font: font });
            currentX += w;
        });
    }

    // Datos dinámicos preparados
    const nombreCompleto = `${usuarioData.NombreDocente} ${usuarioData.DocenteApePat} ${usuarioData.DocenteApeMat || ''}`.toUpperCase();
    
    // REDACCIÓN DEL PÁRRAFO
    escribir('Por medio del presente se hace constar que la C. ');
    escribir(nombreCompleto, true); // NEGRITA
    escribir(', cumplió satisfactoriamente en la participación de las actividades realizadas como ');
    escribir(act.ActAdmPuesto.toUpperCase(), true); // NEGRITA
    escribir(' en el ');
    escribir(act.NombrePeriodo.toLowerCase(), true); // NEGRITA
    escribir(' con numero de dictamen # ');
    escribir(act.NumDict, true); // NEGRITA
    escribir(', para la obtención de créditos complementarios a cargo del ');
    escribir(act.NombreArea.toLowerCase(), true); // NEGRITA
    escribir(', atendiendo un total de ');
    escribir(act.NumAlum.toString(), true); // NEGRITA
    escribir(' alumnos que, a su vez, ');
    escribir(act.NumAcred.toString(), true); // NEGRITA
    escribir(' obtuvieron el crédito complementario los cuales entregaron sus actividades en tiempo y forma.');

    // ==========================================
    // 8. TEXTO DE EXTENSIÓN (FECHA PIE)
    // ==========================================
    yPos -= 50;
    currentX = margenIzq;
    escribir(`Se extiende la presente en la ciudad de Culiacán, Sinaloa, a los ${obtenerFechaTexto()}.`);

    // ==========================================
    // 9. FIRMAS
    // ==========================================
    yPos -= 100; // Espacio para ATENTAMENTE
    page.drawText('A T E N T A M E N T E', { x: margenIzq, y: yPos, size: 9, font: fontBold });
    yPos -= 12;
    page.drawText('Excelencia en Educación Tecnológica®', { x: margenIzq, y: yPos, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });

    yPos -= 80; // Espacio para firmar

    // --- FIRMA IZQUIERDA (JEFE DEL ÁREA) ---
    const centroIzq = 150;
    page.drawLine({ start: { x: 50, y: yPos }, end: { x: 250, y: yPos }, thickness: 1, color: rgb(0,0,0) });
    
    // Calcular centro del texto para alinearlo
    const nomJefe = act.NombreResponsable.toUpperCase();
    const puestoJefe = `JEFE DEL ${act.NombreArea.toUpperCase()}`;
    
    const wNomJ = fontBold.widthOfTextAtSize(nomJefe, 9);
    const wPuesJ = fontBold.widthOfTextAtSize(puestoJefe, 8);

    page.drawText(nomJefe, { x: centroIzq - (wNomJ / 2), y: yPos - 12, size: 9, font: fontBold });
    page.drawText(puestoJefe, { x: centroIzq - (wPuesJ / 2), y: yPos - 24, size: 8, font: fontBold });

    // --- FIRMA DERECHA (SUBDIRECCIÓN) ---
    const centroDer = 450;
    page.drawLine({ start: { x: 350, y: yPos }, end: { x: 550, y: yPos }, thickness: 1, color: rgb(0,0,0) });

    const nomSub = "BERTHA LUCÍA PATRÓN ARELLANO";
    const puestoSub1 = "RESPONSABLE DEL DESPACHO DE LA";
    const puestoSub2 = "SUBDIRECCIÓN ACADÉMICA";

    const wNomS = fontBold.widthOfTextAtSize(nomSub, 9);
    
    page.drawText(nomSub, { x: centroDer - (wNomS / 2), y: yPos - 12, size: 9, font: fontBold });
    
    // Centrar puestos
    page.drawText(puestoSub1, { x: centroDer - (fontBold.widthOfTextAtSize(puestoSub1, 8)/2), y: yPos - 24, size: 8, font: fontBold });
    page.drawText(puestoSub2, { x: centroDer - (fontBold.widthOfTextAtSize(puestoSub2, 8)/2), y: yPos - 34, size: 8, font: fontBold });


    // ==========================================
    // 10. PIE DE PÁGINA (LOGOS INFERIORES)
    // ==========================================
    try {
        const pathPie = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'footer_logos.png');
        if (fs.existsSync(pathPie)) {
            const footerBytes = fs.readFileSync(pathPie);
            const footerImg = await pdfDoc.embedPng(footerBytes);
            // Dibujar centrado abajo
            const footerW = 500;
            const footerH = 40;
            page.drawImage(footerImg, { x: (width - footerW)/2, y: 20, width: footerW, height: footerH });
        }
        
        // Dirección texto pequeño
        page.drawText('Juan de Dios Bátiz 310 Pte. Col. Guadalupe C.P. 80220', { x: 200, y: 65, size: 6, font: fontRegular });
        page.drawText('Culiacán, Sinaloa. Tel. 667-454-0100', { x: 200, y: 58, size: 6, font: fontRegular });
        page.drawText('tecnm.mx | www.culiacan.tecnm.mx', { x: 200, y: 51, size: 6, font: fontRegular });

    } catch (e) {}

    return pdfDoc;
}

module.exports = { llenarCreditos };