// Archivo: backend/documentos/docExclusividad.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    // Fecha con zona horaria correcta (Culiacán)
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Mazatlan"}));
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

async function llenarExclusividad(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Carta de Exclusividad (Completa con Logos)...");

    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // Carta
        const { width, height } = page.getSize();
        
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // =====================================================
        // 1. ENCABEZADO (LOGOS)
        // =====================================================
        try {
            // Rutas a las imágenes en frontend/Recursos-img
            const pathSep = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png');
            const pathTec = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');

            // Logo SEP (Izquierda)
            if (fs.existsSync(pathSep)) {
                const imgSep = await pdfDoc.embedPng(fs.readFileSync(pathSep));
                // Ajusta tamaño y posición según tu imagen real
                page.drawImage(imgSep, { x: 30, y: height - 80, width: 150, height: 50 });
            }
            // Logo TecNM (Derecha)
            if (fs.existsSync(pathTec)) {
                const imgTec = await pdfDoc.embedPng(fs.readFileSync(pathTec));
                page.drawImage(imgTec, { x: width - 100, y: height - 90, width: 60, height: 60 });
            }
        } catch (e) {
            console.warn("No se pudieron cargar los logos:", e.message);
        }

        // =====================================================
        // 2. FECHA Y TÍTULOS
        // =====================================================
        let yPos = height - 110; // Bajamos la posición para no encimar logos

        // Fecha (Alineada a la derecha)
        const fechaTxt = `(Culiacán Sinaloa a ${obtenerFechaTexto()})`;
        const wFecha = fontRegular.widthOfTextAtSize(fechaTxt, 10);
        page.drawText(fechaTxt, { x: width - 40 - wFecha, y: yPos, size: 10, font: fontRegular });

        yPos -= 40; // Espacio antes del título
        const t1 = "CARTA DE EXCLUSIVIDAD LABORAL";
        const t2 = "DOCENTES CON PLAZA DE TIEMPO COMPLETO*";
        
        page.drawText(t1, { x: (width - fontBold.widthOfTextAtSize(t1, 12))/2, y: yPos, size: 12, font: fontBold });
        yPos -= 15;
        page.drawText(t2, { x: (width - fontBold.widthOfTextAtSize(t2, 10))/2, y: yPos, size: 10, font: fontBold });

        // =====================================================
        // 3. DATOS DEL DOCENTE
        // =====================================================
        const nombre = `${usuarioData.NombreDocente} ${usuarioData.DocenteApePat} ${usuarioData.DocenteApeMat || ''}`.toUpperCase();
        const rfc = usuarioData.RFCDocente || "SIN RFC";
        const clave = usuarioData.ClavePresupuestal || "SIN CLAVE";
        
        // =====================================================
        // 4. CUERPO DEL TEXTO (TEXTO COMPLETO ORIGINAL)
        // =====================================================
        yPos -= 40;
        const margen = 50;
        const anchoTexto = width - (margen * 2);
        const fontSize = 9; // Tamaño 9 para que quepa todo
        const lineHeight = 14;

        // --- Función Helper para Justificar Texto con Negritas ---
        const drawJustified = (items) => {
            let currentX = margen;
            let line = [];
            let lineWidth = 0;

            const flushLine = (forceLeft = false) => {
                if (forceLeft) {
                    let x = margen;
                    line.forEach(item => {
                        page.drawText(item.text, { x, y: yPos, size: fontSize, font: item.font });
                        x += item.width;
                    });
                } else {
                    const spaces = line.filter(i => i.isSpace).length;
                    const textW = line.reduce((s, i) => s + i.width, 0);
                    const extraSpace = (spaces > 0 && textW < anchoTexto) ? (anchoTexto - textW) / spaces : 0;
                    let x = margen;
                    line.forEach(item => {
                        page.drawText(item.text, { x, y: yPos, size: fontSize, font: item.font });
                        x += item.width + (item.isSpace ? extraSpace : 0);
                    });
                }
                yPos -= lineHeight;
                line = [];
                lineWidth = 0;
            };

            items.forEach(part => {
                // Dividir por espacios manteniendo los espacios como elementos
                const words = part.text.split(/(\s+)/); 
                const font = part.bold ? fontBold : fontRegular;
                
                words.forEach(word => {
                    if (!word) return;
                    const w = font.widthOfTextAtSize(word, fontSize);
                    const isSpace = /^\s+$/.test(word);
                    
                    if (!isSpace && lineWidth + w > anchoTexto) {
                        flushLine();
                    }
                    if (lineWidth === 0 && isSpace) return; // Evitar espacio al inicio de línea
                    
                    line.push({ text: word, width: w, font, isSpace });
                    lineWidth += w;
                });
            });
            if (line.length > 0) flushLine(true); 
            yPos -= 10; // Espacio entre párrafos
        };
        // ---------------------------------------------------------

        // Párrafo 1: Datos y Declaración de 12 horas
        drawJustified([
            { text: "El (La) que suscribe ", bold: false },
            { text: nombre, bold: true },
            { text: ", con filiación: ", bold: false },
            { text: rfc, bold: true },
            { text: ", Docente de tiempo completo, con clave presupuestal: ", bold: false },
            { text: clave, bold: true },
            { text: ", por medio de este documento manifiesto MI COMPROMISO con el Tecnológico Nacional de México, campus INSTITUTO TECNOLÓGICO DE CULIACÁN declaro que en caso de haber laborado en otra(s) institución(es) pública(s) o federal(es), la jornada no excedió las 12 horas-semana-mes durante el período a evaluar del estímulo, y en caso de estar laborando actualmente en otra(s) institución(es), la jornada no excederá las 12 horas-semana-mes y los horarios establecidos para el desempeño de las mismas, por lo que autorizo que se revise con el departamento de recursos humanos, la compatibilidad de horarios de mi institución de adscripción.", bold: false }
        ]);

        // Párrafo 2: Disposición y Productos
        drawJustified([
            { text: "Asimismo, manifiesto mi disposición para realizar las actividades propias de la Educación Superior Tecnológica enfocadas a satisfacer las necesidades de la dedicación, la calidad en el desempeño y permanencia en las actividades de la docencia, que la autoridad correspondiente de mi institución me encomiende y podré realizar estudios de posgrado siempre y cuando estas actividades sean compatibles con la carga horaria reglamentaria asignada, en el entendido de que en todos los productos derivados de mis actividades como profesor de tiempo completo de la institución, tales como: patentes, modelos de utilidad, derechos de autor, publicaciones en revistas, congresos y libros, mencionaré mi adscripción al Tecnológico Nacional de México, excepto con autorización por escrito por el TecNM.", bold: false }
        ]);

        // Párrafo 3: Conflicto de Intereses
        drawJustified([
            { text: "Adicionalmente me comprometo a no incurrir en conflicto de intereses.", bold: false }
        ]);

        // Párrafo 4: Sanciones
        drawJustified([
            { text: "En caso de que se me compruebe la NO EXCLUSIVIDAD LABORAL, me haré acreedor a la aplicación de las sanciones correspondientes de la normatividad vigente y perderé de manera permanente el derecho a participar en el Programa de Estímulos al Desempeño del Personal Docente.", bold: false }
        ]);

        // =====================================================
        // 5. FIRMA
        // =====================================================
        yPos -= 30;
        const centro = width / 2;
        page.drawText("ATENTAMENTE", { x: centro - (fontBold.widthOfTextAtSize("ATENTAMENTE", 10)/2), y: yPos, size: 10, font: fontBold });
        
        yPos -= 80; // Espacio para firma
        page.drawLine({ start: { x: centro - 120, y: yPos }, end: { x: centro + 120, y: yPos }, thickness: 1 });
        
        const wNom = fontBold.widthOfTextAtSize(nombre, 10);
        page.drawText(nombre, { x: centro - (wNom/2), y: yPos - 15, size: 10, font: fontBold });
        page.drawText("FIRMA DEL DOCENTE", { x: centro - (fontRegular.widthOfTextAtSize("FIRMA DEL DOCENTE", 9)/2), y: yPos - 28, size: 9, font: fontRegular });

        // Auto-Firma (Si el docente la tiene en su perfil)
        if (usuarioData.FirmaDigital) {
            try {
                const img = await pdfDoc.embedPng(usuarioData.FirmaDigital);
                const dims = img.scaleToFit(120, 50);
                // Ajustar posición para que quede sobre la línea
                page.drawImage(img, { x: centro - (dims.width/2), y: yPos + 2, width: dims.width, height: dims.height });
            } catch(e) {
                console.error("Error estampando firma:", e);
            }
        }

        // =====================================================
        // 6. PIE DE PÁGINA (Nota Legal)
        // =====================================================
        const footerText = "1-Artículo 05 de los Lineamientos para la Operación del Programa de Estímulos al Desempeño del Personal Docente para los Institutos Tecnológicos Federales y Centros";
        page.drawText(footerText, { x: margen, y: 40, size: 7, font: fontRegular, color: rgb(0.4,0.4,0.4) });
        page.drawText(`${new Date().getFullYear()}`, { x: margen, y: 30, size: 7, font: fontRegular, color: rgb(0.4,0.4,0.4) });

        return pdfDoc;

    } catch (error) {
        console.error("Error crítico generando Exclusividad:", error);
        throw error;
    }
}

module.exports = { llenarExclusividad };