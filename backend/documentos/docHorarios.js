const { sql, poolPromise } = require('../db'); 
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib'); 
const fs = require('fs');
const path = require('path');

module.exports = function(app) {

    app.get('/api/descargar/horarios/:idDocente', async (req, res) => {
        const { idDocente } = req.params;
        console.log(`--> Generando Horario para Docente ID: ${idDocente}`);
        
        try {
            const pool = await poolPromise;

            // =========================================================
            // 1. OBTENER DATOS
            // =========================================================

            // A. DOCENTE
            const queryInfo = `
                SELECT 
                    D.NombreDocente, D.DocenteApePat, D.DocenteApeMat, D.RFCDocente,
                    D.ClavePresupuestal, D.FechaIngreso, 
                    Depto.NombreDepartamento,
                    P.NombrePeriodo,
                    (J.NombreTitular + ' ' + J.ApePatTitular + ' ' + ISNULL(J.ApeMatTitular,'')) as NombreJefe
                FROM Docente D
                LEFT JOIN Departamento Depto ON D.DepartamentoID = Depto.DepartamentoID
                CROSS JOIN PeriodoEscolar P 
                LEFT JOIN JefaDepartamento J ON D.DepartamentoID = J.DepartamentoID
                WHERE D.DocenteID = @id AND P.StatusPer = 'Activo'
            `;
            
            const resInfo = await pool.request().input('id', sql.Int, idDocente).query(queryInfo);
            if (resInfo.recordset.length === 0) return res.status(404).send('No se encontraron datos del docente.');
            const d = resInfo.recordset[0];

            // B. MATERIAS (QUERY CORREGIDO CON JOIN CORRECTO)
            const queryMaterias = `
                SELECT 
                    M.NombreMateria, G.Code as Grupo, G.NumAlumnos, G.AulaGrupo, G.Carrera, G.GrupoID,
                    H.DiaSemAct, H.HoraInicioAct, H.HoraFinAct
                FROM Grupo G
                INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID -- JOIN CORRECTO
                INNER JOIN Materia M ON GM.MateriaID = M.MateriaID   -- JOIN CORRECTO
                LEFT JOIN HorarioActividad H ON GM.GrupoMateriaID = H.ActividadID AND H.TipoActividad = 'GrupoMateria'
                WHERE G.DocenteID = @id
                ORDER BY M.NombreMateria
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

            // =========================================================
            // 2. PROCESAMIENTO
            // =========================================================
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

            // =========================================================
            // 3. GENERAR PDF
            // =========================================================
            const templatePath = path.join(__dirname, '..', 'plantillas', 'carga_academica.pdf');
            if (!fs.existsSync(templatePath)) return res.status(500).send('Falta plantilla carga_academica.pdf');

            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const page = pdfDoc.getPages()[0];
            
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const fontSize = 7; 

            const draw = (t, x, y, bold=false) => { 
                if(t) page.drawText(String(t).toUpperCase(), { x, y, size: fontSize, font: bold?fontBold:font, color: rgb(0,0,0) }); 
            };

            // ==========================================================
            // 📍 COORDENADAS CALIBRADAS (BAJAMOS LOS TEXTOS)
            // ==========================================================
            
            const nombreC = `${d.NombreDocente} ${d.DocenteApePat} ${d.DocenteApeMat}`;
            
            // -- ENCABEZADO (Ajuste Y -15 a -20 puntos aprox) --
            draw(nombreC, 85, 517, true);        // Nombre (Bajado de 485)
            draw(d.NombreDepartamento, 187, 470); // Depto (Bajado de 463)
            
            // Datos Derecha
            draw(d.NombrePeriodo, 700, 525);      // Periodo (Bajado de 508)
            draw(d.ClavePresupuestal, 530, 480);  // Plaza (Bajado de 495)
            draw(d.RFCDocente, 530, 463);         // RFC (Bajado de 465)
            
            if(d.FechaIngreso) {
                draw(new Date(d.FechaIngreso).toLocaleDateString('es-MX'), 660, 463); // Fecha (Bajado)
            }

            // -- TABLA MATERIAS (Bajamos el inicio para no pegar con títulos) --
            let y = 435;      // <--- Bajado de 428 a 405
            const rowH = 8;  

            clases.forEach(m => {
                // Columnas X (Ligeros ajustes)
                draw(m.nombre.substring(0,35), 20, y);  
                draw(m.grupo,                  160, y); 
                draw(String(m.est),            195, y); 
                draw(m.aula,                   210, y); 
                if(m.carrera) draw(m.carrera.substring(0,15), 290, y);
                
                // Horas
                draw(m.lunes,     405, y); 
                draw(m.martes,    455, y); 
                draw(m.miercoles, 515, y); 
                draw(m.jueves,    575, y); 
                draw(m.viernes,   635, y); 
                draw(m.sabado,    695, y);
                
                draw(String(m.total), 760, y, true);
                y -= rowH;
            });

            // -- TABLA APOYO --
            let yA = 320; // <--- Bajado de 285 a 260
            apoyos.forEach(m => {
                draw(m.nombre.substring(0,40), 30, yA); 
                draw(m.lunes, 405, yA); draw(m.martes, 455, yA); draw(m.miercoles, 515, yA); 
                draw(m.jueves, 575, yA); draw(m.viernes, 635, yA); draw(m.sabado, 695, yA);
                draw(String(m.total), 760, yA, true);
                yA -= rowH;
            });

            // -- FIRMAS --
            draw(nombreC, 70, 70);     // Firma Docente (Bajado a 60)
            if(d.NombreJefe) draw(d.NombreJefe, 620, 70); // Firma Jefe

            const pdfFinal = await pdfDoc.save();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename=Horario.pdf'); 
            res.send(Buffer.from(pdfFinal));

        } catch (error) {
            console.error("❌ Error Horarios:", error);
            res.status(500).send("Error generando horario: " + error.message);
        }
    });
};