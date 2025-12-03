// Archivo: backend/documentos/docCreditos.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

// --- HELPER: Obtener fecha texto largo (Ej: 01 días del mes de diciembre...) ---
function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const dia = hoy.getDate();
    const diaTexto = dia < 10 ? `0${dia}` : dia; // Agregar cero si es menor a 10
    return `${diaTexto} días del mes de ${meses[hoy.getMonth()]} del año ${anio < 2030 ? 'dos mil veinticinco' : anio}`;
}

// --- HELPER: Obtener fecha corta (1/diciembre/2025) ---
function obtenerFechaCorta() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const hoy = new Date();
    return `${hoy.getDate()}/${meses[hoy.getMonth()]}/${hoy.getFullYear()}`;
}

async function llenarCreditos(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Constancia de Créditos (Formato Estricto)...");

    const TARGET_YEAR = 2024;

    // 1. CREAR DOCUMENTO
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Carta Vertical
    const { width, height } = page.getSize();

    // 2. FUENTES
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 11;

    // 3. OBTENER DATOS
    const queryActividad = `
        SELECT TOP 1 A.ActAdmPuesto, A.NumDict, A.NumAlum, A.NumAcred, Ar.NombreArea, P.NombrePeriodo,
        (Resp.NombreTitular + ' ' + Resp.ApePatTitular + ' ' + ISNULL(Resp.ApeMatTitular, '')) as NombreResponsable
        FROM ActividadAdministrativa A
        INNER JOIN Area Ar ON A.AreaID = Ar.AreaID
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        INNER JOIN ResponsableArea Resp ON Ar.AreaID = Resp.AreaID
        WHERE A.DocenteID = @idDocente 
        AND P.NombrePeriodo LIKE '%' + @anio + '%'
        ORDER BY P.FechaFinPer DESC
    `;
    
    const result = await pool.request()
        .input('idDocente', sql.Int, usuarioData.DocenteID)
        .input('anio', sql.VarChar, TARGET_YEAR.toString())
        .query(queryActividad);
    
    // Si no hay actividad en 2024, mostramos aviso en el PDF
    const act = result.recordset.length > 0 ? result.recordset[0] : {
        ActAdmPuesto: "SIN ACTIVIDAD EN 2024",
        NumDict: "---", NumAlum: 0, NumAcred: 0, 
        NombreArea: "ÁREA NO ASIGNADA", NombrePeriodo: `AÑO ${TARGET_YEAR}`, 
        NombreResponsable: "RESPONSABLE DE ÁREA"
    };

    // 4. LOGOS (Intenta cargar los oficiales, si no, usa el genérico)
    try {
        // Rutas ideales (las de la imagen buena)
        const pathSep = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png'); 
        const pathBandera = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'bandera.jpg');
        
        // Rutas de respaldo (las que seguro tienes)
        const pathTecNM = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');

        // Logo Izquierdo (SEP)
        if (fs.existsSync(pathSep)) {
            const img = await pdfDoc.embedPng(fs.readFileSync(pathSep));
            page.drawImage(img, { x: 40, y: height - 90, width: 180, height: 50 });
        } else if (fs.existsSync(pathTecNM)) {
            // Fallback si no tienes el de la SEP
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTecNM));
            page.drawImage(img, { x: 40, y: height - 100, width: 60, height: 60 });
        }

        // Logo Derecho (Bandera/Tec)
        if (fs.existsSync(pathBandera)) {
            const img = await pdfDoc.embedJpg(fs.readFileSync(pathBandera));
            page.drawImage(img, { x: width - 100, y: height - 90, width: 60, height: 40 });
        } else if (fs.existsSync(pathTecNM)) {
             // Fallback
            const img = await pdfDoc.embedPng(fs.readFileSync(pathTecNM));
            page.drawImage(img, { x: width - 100, y: height - 100, width: 60, height: 60 });
        }

    } catch (e) { console.log("Logos no disponibles:", e.message); }

    // Subtítulo del Instituto (Debajo del logo derecho)
    const txtInst = "Instituto Tecnológico de Culiacán";
    const wInst = fontBold.widthOfTextAtSize(txtInst, 8);
    page.drawText(txtInst, { x: width - 50 - wInst, y: height - 110, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });


    // 5. ENCABEZADO DE OFICIO (Alineado a la derecha)
    let yPos = height - 160;
    const alignRight = (text, size=10, font=fontBold) => width - 60 - font.widthOfTextAtSize(text, size);

    const fechaCorta = obtenerFechaCorta(); 
    // Truco: Convertir "1/diciembre/2025" a "Culiacán, Sinaloa, 1/diciembre/2025"
    const partesFecha = fechaCorta.split('/'); // [1, diciembre, 2025]
    const textoCiudad = `Culiacán, Sinaloa, ${partesFecha[0]}/${partesFecha[1]}/${partesFecha[2]}`;
    
    page.drawText(textoCiudad, { x: alignRight(textoCiudad, 10, fontRegular), y: yPos, size: 10, font: fontRegular });
    yPos -= 12;

    const textoOficio = `OFICIO No.: CE-030/${new Date().getFullYear()}`;
    page.drawText(textoOficio, { x: alignRight(textoOficio), y: yPos, size: 10, font: fontBold });
    yPos -= 12;

    const textoAsunto = `ASUNTO: Constancia.`;
    page.drawText(textoAsunto, { x: alignRight(textoAsunto), y: yPos, size: 10, font: fontBold });


    // 6. DESTINATARIO (Bloque Izquierdo)
    yPos -= 50;
    const margenIzq = 60;
    page.drawText('COMISIÓN DE EVALUACIÓN DEL', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PROGRAMA DE ESTÍMULOS AL DESEMPEÑO DEL PERSONAL DOCENTE', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PARA LOS INSTITUTOS TECNOLÓGICOS FEDERALES Y CENTROS.', { x: margenIzq, y: yPos, size: 10, font: fontRegular }); yPos -= 12;
    page.drawText('PRESENTE.', { x: margenIzq, y: yPos, size: 10, font: fontRegular });


    // 7. CUERPO DEL TEXTO (Justificado Manualmente)
    // Definimos los fragmentos: [Texto, esNegrita?]
    // Esto arma el párrafo: "Por medio del presente... la C. NORMA REBECA... cumplió..."
    
    const nombreCompleto = `${usuarioData.NombreDocente} ${usuarioData.DocenteApePat} ${usuarioData.DocenteApeMat || ''}`.toUpperCase();
    
    const fragmentos = [
        { text: "Por medio del presente se hace constar que la C. ", bold: false },
        { text: nombreCompleto, bold: true },
        { text: " , cumplió", bold: false },
        { text: "satisfactoriamente en la participación de las actividades realizadas como ", bold: false },
        { text: act.ActAdmPuesto.toUpperCase(), bold: true },
        { text: " en el", bold: false },
        { text: ` ${act.NombrePeriodo.toLowerCase()}`, bold: true },
        { text: " con numero de dictamen # ", bold: false },
        { text: act.NumDict, bold: true },
        { text: " , para la obtención de", bold: false },
        { text: "créditos complementarios a cargo del ", bold: false },
        { text: act.NombreArea.toLowerCase(), bold: true },
        { text: " , atendiendo un total de ", bold: false },
        { text: `${act.NumAlum} alumnos`, bold: true },
        { text: "que, a su vez, ", bold: false },
        { text: `${act.NumAcred} obtuvieron`, bold: true },
        { text: " el crédito complementario los cuales entregaron sus actividades en", bold: false },
        { text: "tiempo y forma.", bold: false }
    ];

    yPos -= 40;
    const maxAncho = 490; // Ancho disponible para texto
    let lineaActual = [];
    let anchoLineaActual = 0;

    // Función para pintar una línea justificada
    const pintarLinea = (items, esUltima) => {
        let x = margenIzq;
        
        // Si es la última línea, no justificamos (espaciado normal)
        if (esUltima) {
            items.forEach(item => {
                const f = item.bold ? fontBold : fontRegular;
                page.drawText(item.word, { x: x, y: yPos, size: 11, font: f });
                x += f.widthOfTextAtSize(item.word + " ", 11);
            });
        } else {
            // Calcular espacio extra para justificar
            let anchoTexto = 0;
            items.forEach(i => {
                const f = i.bold ? fontBold : fontRegular;
                anchoTexto += f.widthOfTextAtSize(i.word, 11);
            });
            
            const espacios = items.length - 1;
            const espacioSobrante = maxAncho - anchoTexto;
            const espacioPorHueco = espacios > 0 ? espacioSobrante / espacios : 0;

            items.forEach((item, idx) => {
                const f = item.bold ? fontBold : fontRegular;
                page.drawText(item.word, { x: x, y: yPos, size: 11, font: f });
                const anchoPalabra = f.widthOfTextAtSize(item.word, 11);
                
                if (idx < items.length - 1) {
                    x += anchoPalabra + espacioPorHueco;
                }
            });
        }
        yPos -= 18; // Salto de línea
    };

    // Algoritmo de acomodo de palabras
    for (let i = 0; i < fragmentos.length; i++) {
        const frag = fragmentos[i];
        const palabras = frag.text.split(' ');
        
        for (let j = 0; j < palabras.length; j++) {
            const palabra = palabras[j];
            if(!palabra) continue; // saltar espacios vacíos

            const font = frag.bold ? fontBold : fontRegular;
            const anchoPalabra = font.widthOfTextAtSize(palabra, 11);
            // Espacio normal (para calcular si cabe)
            const anchoEspacio = font.widthOfTextAtSize(" ", 11); 

            if (anchoLineaActual + anchoPalabra > maxAncho) {
                // La línea está llena, la pintamos justificada
                pintarLinea(lineaActual, false);
                lineaActual = [];
                anchoLineaActual = 0;
            }

            lineaActual.push({ word: palabra, bold: frag.bold });
            anchoLineaActual += anchoPalabra + anchoEspacio;
        }
    }
    // Pintar la última línea (alineada a la izquierda)
    if (lineaActual.length > 0) pintarLinea(lineaActual, true);


    // 8. TEXTO DE CIERRE
    yPos -= 20;
    const textoCierre = `Se extiende la presente en la ciudad de Culiacán, Sinaloa, a los ${obtenerFechaTexto()}.`;
    // Pintamos esto como un párrafo simple alineado a la izq
    const palabrasCierre = textoCierre.split(' ');
    let xCierre = margenIzq;
    palabrasCierre.forEach(p => {
        const w = fontRegular.widthOfTextAtSize(p + " ", 11);
        if(xCierre + w > 550) { xCierre = margenIzq; yPos -= 18; }
        page.drawText(p + " ", { x: xCierre, y: yPos, size: 11, font: fontRegular });
        xCierre += w;
    });


    // 9. FIRMAS (Posición exacta de la imagen buena)
    yPos -= 80;
    
    page.drawText("A T E N T A M E N T E", { x: margenIzq, y: yPos, size: 8, font: fontBold });
    yPos -= 10;
    page.drawText("Excelencia en Educación Tecnológica®", { x: margenIzq, y: yPos, size: 7, font: fontRegular, color: rgb(0.5,0.5,0.5) });

    yPos -= 80; // Espacio para las firmas

    // -- Firma Izquierda --
    const centroIzq = 160;
    page.drawLine({ start: { x: 60, y: yPos }, end: { x: 260, y: yPos }, thickness: 0.5, color: rgb(0,0,0) });
    
    const nomJefe = act.NombreResponsable.toUpperCase();
    const puestoJefe = `JEFE DEL ${act.NombreArea.toUpperCase()}`;
    
    const wNomJ = fontBold.widthOfTextAtSize(nomJefe, 8);
    const wPuesJ = fontBold.widthOfTextAtSize(puestoJefe, 7);

    page.drawText(nomJefe, { x: centroIzq - (wNomJ / 2), y: yPos - 10, size: 8, font: fontBold });
    page.drawText(puestoJefe, { x: centroIzq - (wPuesJ / 2), y: yPos - 20, size: 7, font: fontBold });

    // -- Firma Derecha --
    const centroDer = 450;
    page.drawLine({ start: { x: 350, y: yPos }, end: { x: 550, y: yPos }, thickness: 0.5, color: rgb(0,0,0) });

    const nomSub = "BERTHA LUCÍA PATRÓN ARELLANO";
    const puestoSub1 = "RESPONSABLE DEL DESPACHO DE LA";
    const puestoSub2 = "SUBDIRECCIÓN ACADÉMICA";

    const wNomS = fontBold.widthOfTextAtSize(nomSub, 8);
    page.drawText(nomSub, { x: centroDer - (wNomS / 2), y: yPos - 10, size: 8, font: fontBold });
    
    const wSub1 = fontBold.widthOfTextAtSize(puestoSub1, 7);
    const wSub2 = fontBold.widthOfTextAtSize(puestoSub2, 7);
    
    page.drawText(puestoSub1, { x: centroDer - (wSub1 / 2), y: yPos - 20, size: 7, font: fontBold });
    page.drawText(puestoSub2, { x: centroDer - (wSub2 / 2), y: yPos - 28, size: 7, font: fontBold });

    return pdfDoc;
}

module.exports = { llenarCreditos };