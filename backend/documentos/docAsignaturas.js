const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { sql } = require('../db');

async function llenarAsignaturas(pdfBytes, idDocente, pool) {
    // 1. CARGAR EL PDF BASE (Que nos manda server.js)
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];

    // 2. CONFIGURAR FUENTES
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 7;
    const draw = (t, x, y, bold=false) => { 
        if(t) page.drawText(String(t).toUpperCase(), { x, y, size: fontSize, font: bold?fontBold:font, color: rgb(0,0,0) }); 
    };

    // 3. CONSULTAS SQL (Tu lógica original)
    // A. INFO DOCENTE
    const queryInfo = `
        SELECT D.NombreDocente, D.DocenteApePat, D.DocenteApeMat, D.RFCDocente,
            D.ClavePresupuestal, D.FechaIngreso, Depto.NombreDepartamento,
            P.NombrePeriodo,
            (J.NombreTitular + ' ' + J.ApePatTitular + ' ' + ISNULL(J.ApeMatTitular,'')) as NombreJefe
        FROM Docente D
        LEFT JOIN Departamento Depto ON D.DepartamentoID = Depto.DepartamentoID
        CROSS JOIN PeriodoEscolar P 
        LEFT JOIN JefaDepartamento J ON D.DepartamentoID = J.DepartamentoID
        WHERE D.DocenteID = @id AND P.StatusPer = 'Activo'
    `;
    const resInfo = await pool.request().input('id', sql.Int, idDocente).query(queryInfo);
    if (resInfo.recordset.length === 0) throw new Error('No se encontraron datos del docente.');
    const d = resInfo.recordset[0];

    // B. MATERIAS
    const queryMaterias = `
        SELECT M.NombreMateria, G.Code as Grupo, G.NumAlumnos, G.AulaGrupo, G.Carrera, G.GrupoID,
            H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct
        FROM Grupo G
        INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
        INNER JOIN Materia M ON GM.MateriaID = M.MateriaID
        LEFT JOIN HorarioActividad H ON GM.GrupoMateriaID = H.ActividadID AND H.TipoActividad = 'GrupoMateria'
        WHERE G.DocenteID = @id ORDER BY M.NombreMateria
    `;
    const resMaterias = await pool.request().input('id', sql.Int, idDocente).query(queryMaterias);

    // C. APOYO
    const queryApoyo = `
        SELECT A.ActApoyoNombre, H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct
        FROM ApoyoADocencia A
        LEFT JOIN HorarioActividad H ON A.ActApoyoID = H.ActividadID AND H.TipoActividad = 'ApoyoADocencia'
        WHERE A.DocenteID = @id
    `;
    const resApoyo = await pool.request().input('id', sql.Int, idDocente).query(queryApoyo);

    // 4. PROCESAMIENTO DE HORARIOS (Tu lógica original)
    const fmtH = (h) => {
        if(!h) return '';
        if(h instanceof Date) return h.toISOString().substr(11, 5); 
        return String(h).substring(0, 5);
    };

    const procesarHorario = (dataset, idF, nameF) => {
        let m = {};
        dataset.forEach(row => {
            const key = row[idF]||row[nameF];
            if(!m[key]) m[key] = { 
                nombre: row[nameF], grupo: row.Grupo||'', est: row.NumAlumnos||'', aula: row.AulaGrupo||'', carrera: row.Carrera||'', 
                lunes:'', martes:'', miercoles:'', jueves:'', viernes:'', sabado:'', total:0 
            };
            if(row.DiaSemAct) {
                const ini=fmtH(row.HoraInicioAct), fin=fmtH(row.HoraFinAct), str=`${ini}-${fin}`;
                const h1 = parseInt(ini.split(':')[0]) || 0;
                const h2 = parseInt(fin.split(':')[0]) || 0;
                m[key].total += (h2 - h1);
                if(row.DiaSemAct===1) m[key].lunes=str; if(row.DiaSemAct===2) m[key].martes=str; if(row.DiaSemAct===3) m[key].miercoles=str;
                if(row.DiaSemAct===4) m[key].jueves=str; if(row.DiaSemAct===5) m[key].viernes=str; if(row.DiaSemAct===6) m[key].sabado=str;
            }
        });
        return Object.values(m);
    };

    const clases = procesarHorario(resMaterias.recordset, 'GrupoID', 'NombreMateria');
    const apoyos = procesarHorario(resApoyo.recordset, 'ActApoyoNombre', 'ActApoyoNombre');

    // 5. DIBUJAR EN PDF
    const nombreC = `${d.NombreDocente} ${d.DocenteApePat} ${d.DocenteApeMat}`;
    
    // Encabezado
    draw(nombreC, 85, 517, true);
    draw(d.NombreDepartamento, 187, 470);
    draw(d.NombrePeriodo, 700, 525);
    draw(d.ClavePresupuestal, 530, 480);
    draw(d.RFCDocente, 530, 463);
    if(d.FechaIngreso) draw(new Date(d.FechaIngreso).toLocaleDateString('es-MX'), 660, 463);

    // Tabla Materias
    let y = 435; const rowH = 8;
    clases.forEach(m => {
        draw(m.nombre.substring(0,35), 20, y);
        draw(m.grupo, 160, y);
        draw(String(m.est), 195, y);
        draw(m.aula, 210, y);
        if(m.carrera) draw(m.carrera.substring(0,15), 290, y);
        draw(m.lunes, 405, y); draw(m.martes, 455, y); draw(m.miercoles, 515, y); 
        draw(m.jueves, 575, y); draw(m.viernes, 635, y); draw(m.sabado, 695, y);
        draw(String(m.total), 760, y, true);
        y -= rowH;
    });

    // Tabla Apoyo
    let yA = 321;
    apoyos.forEach(m => {
        draw(m.nombre.substring(0,40), 30, yA); 
        draw(m.lunes, 405, yA); draw(m.martes, 455, yA); draw(m.miercoles, 515, yA); 
        draw(m.jueves, 575, yA); draw(m.viernes, 635, yA); draw(m.sabado, 695, yA);
        draw(String(m.total), 760, yA, true);
        yA -= rowH;
    });

    // Firmas Texto (Nombres)
    draw(nombreC, 70, 70);
    if(d.NombreJefe) draw(d.NombreJefe, 620, 70);

    // Retornamos el objeto PDF para que server.js lo firme
    return pdfDoc;
}

module.exports = { llenarAsignaturas };