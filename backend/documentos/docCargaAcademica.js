// Archivo: backend/documentos/docCargaAcademica.js (o _FINAL.js)
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');
const fs = require('fs');
const path = require('path');

async function llenarCargaAcademica(pdfBytesIgnorado, usuarioData, pool) {
    console.log("📄 Generando Carga Académica (Multipágina por Semestre)...");

    // 1. OBTENER DATOS GENERALES DEL DOCENTE
    const qDocente = `
        SELECT 
            D.NombreDocente, D.DocenteApePat, D.DocenteApeMat, D.RFCDocente, 
            D.CedulaDocente, D.ClavePresupuestal, D.FechaIngreso,
            Dep.NombreDepartamento
        FROM Docente D
        INNER JOIN Departamento Dep ON D.DepartamentoID = Dep.DepartamentoID
        WHERE D.DocenteID = @id
    `;
    const resDocente = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(qDocente);
    const doc = resDocente.recordset[0];
    const nombreCompleto = `${doc.NombreDocente} ${doc.DocenteApePat} ${doc.DocenteApeMat || ''}`.toUpperCase();

    // 2. OBTENER TODAS LAS ACTIVIDADES CON SU PERIODO
    // Agregamos P.NombrePeriodo y P.FechaIniciPer a todas las consultas para poder agrupar

    // A. CLASES
    const qClases = `
        SELECT 
            P.NombrePeriodo, P.FechaIniciPer,
            M.NombreMateria, G.GrupoID, G.Carrera, G.Modalidad, G.Nivel,
            H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct, H.AulaAct
        FROM Grupo G
        INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
        INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
        INNER JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = GM.GrupoMateriaID AND H.TipoActividad = 'GrupoMateria')
        WHERE G.DocenteID = @id
        ORDER BY P.FechaIniciPer ASC
    `;
    const resClases = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(qClases);
    
    // B. APOYO
    const qApoyo = `
        SELECT 
            P.NombrePeriodo, P.FechaIniciPer,
            A.ActApoyoNombre as Nombre, H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct 
        FROM ApoyoADocencia A
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = A.ActApoyoID AND H.TipoActividad = 'ApoyoADocencia')
        WHERE A.DocenteID = @id
        ORDER BY P.FechaIniciPer ASC
    `;
    const resApoyo = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(qApoyo);

    // C. ADMINISTRATIVAS
    const qAdmin = `
        SELECT 
            P.NombrePeriodo, P.FechaIniciPer,
            A.ActAdmPuesto as Nombre, H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct 
        FROM ActividadAdministrativa A
        INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
        LEFT JOIN HorarioActividad H ON (H.ActividadID = A.ActAdmID AND H.TipoActividad = 'ActividadAdministrativa')
        WHERE A.DocenteID = @id
        ORDER BY P.FechaIniciPer ASC
    `;
    const resAdmin = await pool.request().input('id', sql.Int, usuarioData.DocenteID).query(qAdmin);

    // --- AGRUPACIÓN POR PERIODO ---
    // Creamos un mapa donde la clave es el NombrePeriodo
    const periodosMap = {};

    const agregarAlMapa = (item, tipo) => {
        const key = item.NombrePeriodo;
        if (!periodosMap[key]) {
            periodosMap[key] = {
                nombre: key,
                fechaOrden: item.FechaIniciPer,
                clases: [],
                apoyo: [],
                admin: []
            };
        }
        periodosMap[key][tipo].push(item);
    };

    resClases.recordset.forEach(i => agregarAlMapa(i, 'clases'));
    resApoyo.recordset.forEach(i => agregarAlMapa(i, 'apoyo'));
    resAdmin.recordset.forEach(i => agregarAlMapa(i, 'admin'));

    // Convertimos a array y ordenamos por fecha
    const listaPeriodos = Object.values(periodosMap).sort((a, b) => a.fechaOrden - b.fechaOrden);

    if (listaPeriodos.length === 0) {
        // Si no hay nada, creamos un periodo dummy para que genere al menos una hoja vacía
        listaPeriodos.push({ nombre: "PERIODO ACTUAL", clases: [], apoyo: [], admin: [] });
    }

    // ============================================================
    // 3. GENERACIÓN DEL PDF (MULTIPÁGINA)
    // ============================================================
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Recorremos cada periodo y generamos su propia hoja
    for (const periodo of listaPeriodos) {
        const page = pdfDoc.addPage([612, 792]); // Carta Vertical
        const { width, height } = page.getSize();

        // --- PROCESAMIENTO DE HORARIOS PARA ESTE PERIODO ---
        const procesarHorario = (filas) => {
            const mapa = {};
            filas.forEach(f => {
                const key = f.NombreMateria || f.Nombre;
                if (!mapa[key]) {
                    mapa[key] = { 
                        nombre: key, 
                        grupo: f.GrupoID || '', 
                        carrera: f.Carrera || '', 
                        nivel: f.Nivel || '',
                        horarios: {1:'', 2:'', 3:'', 4:'', 5:'', 6:''}, 
                        totalHoras: 0
                    };
                }
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

        // --- DIBUJO DE LA PÁGINA ---
        
        // Header
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

        // Info Docente
        let yPos = height - 90;
        page.drawRectangle({ x: 30, y: yPos - 70, width: width - 60, height: 70, borderWidth: 1, borderColor: rgb(0,0,0), opacity: 0, borderOpacity: 1 });

        const drawLabelVal = (lbl, val, x, y) => {
            page.drawText(lbl, { x, y, size: 6, font: fontBold });
            page.drawText(val || '', { x, y: y - 8, size: 8, font: fontRegular });
        };

        drawLabelVal("NOMBRE COMPLETO:", nombreCompleto, 35, yPos - 15);
        drawLabelVal("RFC:", doc.RFCDocente, 350, yPos - 15);
        // AQUÍ USAMOS EL PERIODO DE ESTA ITERACIÓN
        drawLabelVal("PERIODO ESCOLAR:", periodo.nombre, 480, yPos - 15);

        drawLabelVal("CLAVE PRESUPUESTAL:", doc.ClavePresupuestal || "---", 35, yPos - 35);
        drawLabelVal("DEPARTAMENTO ACADÉMICO:", doc.NombreDepartamento, 350, yPos - 35);
        drawLabelVal("FECHA INGRESO:", doc.FechaIngreso ? doc.FechaIngreso.toISOString().split('T')[0] : "", 35, yPos - 55);
        drawLabelVal("CÉDULA:", doc.CedulaDocente, 200, yPos - 55);

        yPos -= 80;

        // Tabla Helper
        const colWidths = [130, 30, 25, 60, 35, 35, 35, 35, 35, 35, 35]; 
        const startX = 30;
        const colX = [startX];
        for(let i=0; i<colWidths.length; i++) colX.push(colX[i] + colWidths[i]);
        
        const drawRow = (data, isHeader=false) => {
            const f = isHeader ? fontBold : fontRegular;
            const s = isHeader ? 7 : 6;
            for(let i=0; i<colWidths.length; i++) {
                page.drawRectangle({
                    x: colX[i], y: yPos - 20, width: colWidths[i], height: 20,
                    borderWidth: 0.5, borderColor: rgb(0,0,0), opacity: 0, borderOpacity: 1
                });
                if(data[i]) {
                    const lines = data[i].toString().split('\n');
                    let txtY = yPos - 8;
                    if(lines.length > 1) txtY += (lines.length * 2);
                    lines.forEach(line => {
                        const txtW = f.widthOfTextAtSize(line, s);
                        const txtX = (i===0) ? colX[i] + 2 : colX[i] + (colWidths[i] - txtW)/2;
                        page.drawText(line, { x: txtX, y: txtY, size: s, font: f });
                        txtY -= 7;
                    });
                }
            }
            yPos -= 20;
        };

        // Sección 1
        page.drawText("I. CARGA ACADÉMICA", { x: startX, y: yPos + 2, size: 8, font: fontBold });
        const headers = ["ASIGNATURA", "GPO", "NIV", "CARRERA", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"];
        drawRow(headers, true);

        listaC.forEach(c => {
            drawRow([c.nombre.substring(0,35), c.grupo, c.nivel||'LI', c.carrera?c.carrera.substring(0,10):'ING.', c.horarios[1], c.horarios[2], c.horarios[3], c.horarios[4], c.horarios[5], c.horarios[6], c.totalHoras.toString()]);
        });
        drawRow(["SUBTOTAL HORAS FRENTE A GRUPO", "", "", "", "", "", "", "", "", "", tC.toString()], true);
        drawRow(["PREPARACIÓN, CONTROL Y EVALUACIÓN", "", "", "", "", "", "", "", "", "", tC.toString()], false);
        yPos -= 10;

        // Sección 2
        page.drawText("II. ACTIVIDADES DE APOYO A LA DOCENCIA", { x: startX, y: yPos + 2, size: 8, font: fontBold });
        drawRow(["ACTIVIDAD", "METAS", "", "", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"], true);
        listaA.forEach(a => {
            drawRow([a.nombre, "", "", "", a.horarios[1], a.horarios[2], a.horarios[3], a.horarios[4], a.horarios[5], a.horarios[6], a.totalHoras.toString()]);
        });
        drawRow(["SUBTOTAL APOYO A LA DOCENCIA", "", "", "", "", "", "", "", "", "", tA.toString()], true);
        yPos -= 10;

        // Sección 3
        page.drawText("III. ACTIVIDADES ADMINISTRATIVAS", { x: startX, y: yPos + 2, size: 8, font: fontBold });
        drawRow(["PUESTO / ACTIVIDAD", "UNIDAD", "", "", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "TOT"], true);
        listaAdm.forEach(a => {
            drawRow([a.nombre, "DEPTO", "", "", a.horarios[1], a.horarios[2], a.horarios[3], a.horarios[4], a.horarios[5], a.horarios[6], a.totalHoras.toString()]);
        });
        drawRow(["SUBTOTAL ADMINISTRATIVAS", "", "", "", "", "", "", "", "", "", tAdm.toString()], true);

        // Gran Total
        yPos -= 5;
        page.drawRectangle({ x: startX, y: yPos - 20, width: width - 60, height: 20, color: rgb(0.9, 0.9, 0.9) });
        page.drawText("TOTAL DE HORAS SEMANALES:", { x: width - 200, y: yPos - 13, size: 9, font: fontBold });
        page.drawText(granTotal.toString(), { x: width - 60, y: yPos - 13, size: 10, font: fontBold });
        
        // FIRMAS (Solo 2: Jefe y Subdirector)
        yPos = 100; 
        const firmaY = yPos + 10;
        const lineaW = 180;

        // Jefe Depto (Izq)
        const xJefe = 60;
        page.drawLine({ start: { x: xJefe, y: firmaY }, end: { x: xJefe+lineaW, y: firmaY }, thickness: 1 });
        
        const qJefe = await pool.request().input('id', usuarioData.DepartamentoID).query("SELECT NombreTitular, ApePatTitular, ApeMatTitular FROM JefaDepartamento WHERE DepartamentoID = @id");
        let nomJefe = "JEFE DEPARTAMENTO";
        if(qJefe.recordset.length) { const j = qJefe.recordset[0]; nomJefe = `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase(); }
        
        const wNomJ = fontRegular.widthOfTextAtSize(nomJefe, 7);
        page.drawText(nomJefe, { x: xJefe + (lineaW - wNomJ)/2, y: firmaY - 10, size: 7, font: fontRegular });
        const wPuestoJ = fontBold.widthOfTextAtSize("JEFE DEPARTAMENTO ACADÉMICO", 7);
        page.drawText("JEFE DEPARTAMENTO ACADÉMICO", { x: xJefe + (lineaW - wPuestoJ)/2, y: firmaY - 20, size: 7, font: fontBold });

        // Subdirector (Der)
        const xSub = 370;
        page.drawLine({ start: { x: xSub, y: firmaY }, end: { x: xSub+lineaW, y: firmaY }, thickness: 1 });
        const nomSub = "BERTHA LUCÍA PATRÓN ARELLANO";
        const wNomS = fontRegular.widthOfTextAtSize(nomSub, 7);
        page.drawText(nomSub, { x: xSub + (lineaW - wNomS)/2, y: firmaY - 10, size: 7, font: fontRegular });
        const wPuestoS = fontBold.widthOfTextAtSize("SUBDIRECTORA ACADÉMICA", 7);
        page.drawText("SUBDIRECTORA ACADÉMICA", { x: xSub + (lineaW - wPuestoS)/2, y: firmaY - 20, size: 7, font: fontBold });
    }

    return pdfDoc;
}

module.exports = { llenarCargaAcademica };