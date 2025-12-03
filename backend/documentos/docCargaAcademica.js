// Archivo: backend/documentos/docCargaAcademica.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

async function llenarCargaAcademica(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Carga Académica (Forzando EXACTAMENTE 3 Hojas)...");

    // CONFIGURACIÓN DE AÑOS
    const ANIO_EVALUAR = "2024";
    const ANIO_ACTUAL = "2025";

    // 1. OBTENER DATOS GENERALES
    const qDocente = `
        SELECT D.NombreDocente, D.DocenteApePat, D.DocenteApeMat, D.RFCDocente, 
               D.CedulaDocente, D.ClavePresupuestal, D.FechaIngreso, Dep.NombreDepartamento
        FROM Docente D
        INNER JOIN Departamento Dep ON D.DepartamentoID = Dep.DepartamentoID
        WHERE D.DocenteID = @id
    `;
    const resDocente = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(qDocente);
    const doc = resDocente.recordset[0];
    const nombreCompleto = `${doc.NombreDocente} ${doc.DocenteApePat} ${doc.DocenteApeMat || ''}`.toUpperCase();

    // 2. OBTENER TODAS LAS ACTIVIDADES (BD)
    
    // A. CLASES
    const qClases = `
        SELECT P.NombrePeriodo, M.NombreMateria, G.GrupoID, G.Carrera, G.Modalidad, G.Nivel,
               H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct, H.AulaAct
        FROM Grupo G
        INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
        INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
        INNER JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = GM.GrupoMateriaID AND H.TipoActividad = 'GrupoMateria')
        WHERE G.DocenteID = @id
        AND (P.NombrePeriodo LIKE '%' + @a1 + '%' OR P.NombrePeriodo LIKE '%' + @a2 + '%')
    `;
    const resClases = await pool.request().input('id', sql.Int, usuarioData.DocenteID).input('a1', sql.VarChar, ANIO_EVALUAR).input('a2', sql.VarChar, ANIO_ACTUAL).query(qClases);
    
    // B. APOYO
    const qApoyo = `
        SELECT P.NombrePeriodo, A.ActApoyoNombre as Nombre, H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct 
        FROM ApoyoADocencia A
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = A.ActApoyoID AND H.TipoActividad = 'ApoyoADocencia')
        WHERE A.DocenteID = @id
        AND (P.NombrePeriodo LIKE '%' + @a1 + '%' OR P.NombrePeriodo LIKE '%' + @a2 + '%')
    `;
    const resApoyo = await pool.request().input('id', sql.Int, usuarioData.DocenteID).input('a1', sql.VarChar, ANIO_EVALUAR).input('a2', sql.VarChar, ANIO_ACTUAL).query(qApoyo);

    // C. ADMINISTRATIVAS
    const qAdmin = `
        SELECT P.NombrePeriodo, A.ActAdmPuesto as Nombre, H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct 
        FROM ActividadAdministrativa A
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = A.ActAdmID AND H.TipoActividad = 'ActividadAdministrativa')
        WHERE A.DocenteID = @id
        AND (P.NombrePeriodo LIKE '%' + @a1 + '%' OR P.NombrePeriodo LIKE '%' + @a2 + '%')
    `;
    const resAdmin = await pool.request().input('id', sql.Int, usuarioData.DocenteID).input('a1', sql.VarChar, ANIO_EVALUAR).input('a2', sql.VarChar, ANIO_ACTUAL).query(qAdmin);

    // --- 3. LÓGICA DE RANURAS (SLOTS) ---
    // Definimos los 3 espacios obligatorios.
    const slots = {
        '2024_1': { nombre: `ENERO-JUNIO ${ANIO_EVALUAR}`, clases:[], apoyo:[], admin:[] },
        '2024_2': { nombre: `AGOSTO-DICIEMBRE ${ANIO_EVALUAR}`, clases:[], apoyo:[], admin:[] },
        '2025_1': { nombre: `ENERO-JUNIO ${ANIO_ACTUAL}`, clases:[], apoyo:[], admin:[] }
    };

    // Función para identificar a qué slot pertenece un registro de la BD
    const identificarSlot = (nombrePeriodo) => {
        const n = nombrePeriodo.toUpperCase();
        if (n.includes('VERANO')) return null; // Ignorar veranos

        if (n.includes(ANIO_EVALUAR)) {
            if (n.includes('ENE') || n.includes('JUN') || n.includes('ENERO')) return '2024_1';
            if (n.includes('AGO') || n.includes('DIC') || n.includes('DICIEMBRE')) return '2024_2';
        }
        if (n.includes(ANIO_ACTUAL)) {
            if (n.includes('ENE') || n.includes('JUN') || n.includes('ENERO')) return '2025_1';
        }
        return null;
    };

    // Llenar los slots con datos
    const llenarSlot = (lista, tipo) => {
        lista.forEach(item => {
            const slotKey = identificarSlot(item.NombrePeriodo);
            if (slotKey) {
                slots[slotKey][tipo].push(item);
                // Actualizamos el nombre real del periodo con el que viene de la BD (para que se vea bonito)
                slots[slotKey].nombre = item.NombrePeriodo; 
            }
        });
    };

    llenarSlot(resClases.recordset, 'clases');
    llenarSlot(resApoyo.recordset, 'apoyo');
    llenarSlot(resAdmin.recordset, 'admin');

    // Convertimos los slots a un array fijo de 3 elementos en orden
    const listaFinal = [slots['2024_1'], slots['2024_2'], slots['2025_1']];


    // ============================================================
    // 4. GENERACIÓN DEL PDF
    // ============================================================
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Iteramos EXACTAMENTE 3 veces
    for (const periodo of listaFinal) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();

        // --- PROCESAMIENTO DE HORARIOS ---
        const procesarHorario = (filas) => {
            const mapa = {};
            filas.forEach(f => {
                const key = f.NombreMateria || f.Nombre;
                if (!mapa[key]) mapa[key] = { nombre: key, grupo: f.GrupoID||'', carrera: f.Carrera||'', nivel: f.Nivel||'', horarios: {1:'',2:'',3:'',4:'',5:'',6:''}, totalHoras: 0 };
                
                if (f.DiaSemAct) {
                    const inicio = f.HoraInicioAct.toISOString().split('T')[1].substring(0,5);
                    const fin = f.HoraFinAct.toISOString().split('T')[1].substring(0,5);
                    const aula = f.AulaAct ? `/${f.AulaAct}` : '';
                    const strHora = `${inicio}-${fin}${aula}`;
                    
                    if(mapa[key].horarios[f.DiaSemAct]) mapa[key].horarios[f.DiaSemAct] += `\n${strHora}`;
                    else mapa[key].horarios[f.DiaSemAct] = strHora;

                    const h1 = parseInt(inicio.split(':')[0]);
                    const h2 = parseInt(fin.split(':')[0]);
                    mapa[key].totalHoras += (h2 - h1);
                }
            });
            return Object.values(mapa);
        };

        const listaC = procesarHorario(periodo.clases);
        const listaA = procesarHorario(periodo.apoyo);
        const listaAdm = procesarHorario(periodo.admin);
        const tC = listaC.reduce((s, i) => s + i.totalHoras, 0);
        const tA = listaA.reduce((s, i) => s + i.totalHoras, 0);
        const tAdm = listaAdm.reduce((s, i) => s + i.totalHoras, 0);
        const granTotal = tC + tA + tAdm;

        // --- DIBUJO ---
        try {
            const pathSep = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'SEP.png');
            const pathTec = path.join(__dirname, '..', '..', 'frontend', 'Recursos-img', 'LOGO_TECNM.png');
            if (fs.existsSync(pathSep)) {
                const img = await pdfDoc.embedPng(fs.readFileSync(pathSep));
                page.drawImage(img, { x: 30, y: height - 60, width: 120, height: 40 });
            }
            if (fs.existsSync(pathTec)) {
                const img = await pdfDoc.embedPng(fs.readFileSync(pathTec));
                page.drawImage(img, { x: width - 80, y: height - 70, width: 50, height: 50 });
            }
        } catch (e) {}

        page.drawText("INSTITUTO TECNOLÓGICO DE CULIACÁN", { x: 180, y: height - 40, size: 12, font: fontBold });
        page.drawText("SUBDIRECCIÓN ACADÉMICA", { x: 220, y: height - 55, size: 10, font: fontBold });
        page.drawText("HORARIO DE ACTIVIDADES", { x: 230, y: height - 70, size: 10, font: fontBold });

        let yPos = height - 90;
        page.drawRectangle({ x: 30, y: yPos - 70, width: width - 60, height: 70, borderWidth: 1, borderColor: rgb(0,0,0), opacity: 0, borderOpacity: 1 });
        const drawLbl = (l, v, x, y) => { page.drawText(l, { x, y, size: 6, font: fontBold }); page.drawText(v||'', { x, y: y-8, size: 8, font: fontRegular }); };
        
        drawLbl("NOMBRE:", nombreCompleto, 35, yPos - 15);
        drawLbl("RFC:", doc.RFCDocente, 350, yPos - 15);
        // PERIODO DE ESTA PÁGINA
        drawLbl("PERIODO ESCOLAR:", periodo.nombre, 480, yPos - 15);
        drawLbl("DEPTO:", doc.NombreDepartamento, 350, yPos - 35);
        drawLbl("PLAZA:", doc.ClavePresupuestal, 35, yPos - 35);
        
        yPos -= 80;

        const colWidths = [130, 30, 25, 60, 35, 35, 35, 35, 35, 35, 35]; 
        const startX = 30;
        let colX = [startX]; for(let i=0; i<10; i++) colX.push(colX[i]+colWidths[i]);
        
        const drawRow = (d, h=false) => {
            const f = h?fontBold:fontRegular;
            for(let i=0; i<11; i++) {
                page.drawRectangle({ x:colX[i], y:yPos-20, width:colWidths[i], height:20, borderWidth:0.5, borderColor:rgb(0,0,0) });
                if(d[i]) {
                    const l = d[i].toString().split('\n');
                    let ty = yPos - 8 + (l.length>1?l.length*2:0);
                    l.forEach(line=>{
                        const tx = (i===0)? colX[i]+2 : colX[i]+(colWidths[i]-f.widthOfTextAtSize(line, h?7:6))/2;
                        page.drawText(line, {x:tx, y:ty, size:h?7:6, font:f});
                        ty-=7;
                    });
                }
            }
            yPos-=20;
        };

        page.drawText("I. CARGA ACADÉMICA", { x: startX, y: yPos+2, size: 8, font: fontBold });
        drawRow(["ASIGNATURA", "GPO", "NIV", "CARRERA", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"], true);
        listaC.forEach(c => drawRow([c.nombre.substring(0,35), c.grupo, c.nivel, c.carrera.substring(0,10), c.horarios[1], c.horarios[2], c.horarios[3], c.horarios[4], c.horarios[5], c.horarios[6], c.totalHoras]));
        drawRow(["SUBTOTAL DOCENCIA", "", "", "", "", "", "", "", "", "", tC.toString()], true);
        drawRow(["PREPARACIÓN Y EVALUACIÓN", "", "", "", "", "", "", "", "", "", tC.toString()], false);
        yPos-=10;

        page.drawText("II. APOYO A LA DOCENCIA", { x: startX, y: yPos+2, size: 8, font: fontBold });
        drawRow(["ACTIVIDAD", "", "", "", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"], true);
        listaA.forEach(a => drawRow([a.nombre, "", "", "", a.horarios[1], a.horarios[2], a.horarios[3], a.horarios[4], a.horarios[5], a.horarios[6], a.totalHoras]));
        drawRow(["SUBTOTAL APOYO", "", "", "", "", "", "", "", "", "", tA.toString()], true);
        yPos-=10;

        page.drawText("III. ADMINISTRATIVAS", { x: startX, y: yPos+2, size: 8, font: fontBold });
        drawRow(["ACTIVIDAD", "", "", "", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"], true);
        listaAdm.forEach(a => drawRow([a.nombre, "", "", "", a.horarios[1], a.horarios[2], a.horarios[3], a.horarios[4], a.horarios[5], a.horarios[6], a.totalHoras]));
        drawRow(["SUBTOTAL ADMIN", "", "", "", "", "", "", "", "", "", tAdm.toString()], true);

        yPos-=5;
        // Total (tC se suma dos veces: docencia + preparación)
        page.drawRectangle({ x: startX, y: yPos - 20, width: width - 60, height: 20, color: rgb(0.9, 0.9, 0.9) });
        page.drawText("TOTAL SEMANAL:", { x: width-150, y: yPos-13, size: 9, font: fontBold });
        page.drawText((granTotal + tC).toString(), { x: width-60, y: yPos-13, size: 10, font: fontBold }); 
        
        yPos-=30;

        // FIRMAS (SOLO 2)
        yPos = 100;
        const fy = yPos + 10;
        const lw = 180;
        
        const xJefe = 60;
        page.drawLine({ start:{x:xJefe, y:fy}, end:{x:xJefe+lw, y:fy}, thickness:1 });
        const qJ = await pool.request().input('id',usuarioData.DepartamentoID).query("SELECT NombreTitular FROM JefaDepartamento WHERE DepartamentoID=@id");
        const nomJ = qJ.recordset.length ? qJ.recordset[0].NombreTitular.toUpperCase() : "JEFE DEPTO";
        const wJ = fontRegular.widthOfTextAtSize(nomJ, 7);
        page.drawText(nomJ, { x: xJefe+(lw-wJ)/2, y: fy-10, size: 7, font: fontRegular });
        page.drawText("JEFE DEPARTAMENTO ACADÉMICO", { x: xJefe+(lw-fontBold.widthOfTextAtSize("JEFE DEPARTAMENTO ACADÉMICO",7))/2, y: fy-20, size: 7, font: fontBold });

        const xSub = 370;
        page.drawLine({ start:{x:xSub, y:fy}, end:{x:xSub+lw, y:fy}, thickness:1 });
        const nomS = "BERTHA LUCÍA PATRÓN ARELLANO";
        const wS = fontRegular.widthOfTextAtSize(nomS, 7);
        page.drawText(nomS, { x: xSub+(lw-wS)/2, y: fy-10, size: 7, font: fontRegular });
        page.drawText("SUBDIRECTORA ACADÉMICA", { x: xSub+(lw-fontBold.widthOfTextAtSize("SUBDIRECTORA ACADÉMICA",7))/2, y: fy-20, size: 7, font: fontBold });
    }

    return pdfDoc;
}

module.exports = { llenarCargaAcademica };