// Archivo: backend/documentos/docRecurso.js
const { sql } = require('../db');
const { PDFDocument } = require('pdf-lib');

function obtenerFechaCorta() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

async function llenarRecurso(fileBytes, data) {
    console.log("📄 Generando Recurso Digital (Aplanado Correcto)...");

    try {
        const { poolPromise } = require('../db');
        const pool = await poolPromise;
        const pdfMaestro = await PDFDocument.create();

        // 1. CONSULTA
        const queryMaterias = `
            SELECT M.NombreMateria, M.Estrategia, M.Prog 
            FROM Grupo G 
            JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
            JOIN Materia M ON GM.MateriaID = M.MateriaID
            JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
            WHERE G.DocenteID = @idDocente AND P.NombrePeriodo LIKE '%2024%'
        `;
        
        const result = await pool.request().input('idDocente', sql.Int, data.DocenteID).query(queryMaterias);
        const materias = result.recordset;
        
        const materiasUnicas = [];
        const seen = new Set();
        materias.forEach(m => {
            if(!seen.has(m.NombreMateria)) {
                materiasUnicas.push(m);
                seen.add(m.NombreMateria);
            }
        });

        const nombreDocente = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat || ''}`.toUpperCase();
        const fecha = obtenerFechaCorta();

        // CASO A: SIN MATERIAS (Limpiar cuadros)
        if (materiasUnicas.length === 0) {
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();
            
            try {
                const fNom = formTemp.getTextField('NombreDocente'); if(fNom) fNom.setText(nombreDocente);
                const fFec = formTemp.getTextField('Fecha'); if(fFec) fFec.setText(fecha);
                // Vaciar campos de contenido
                ['Asignatura', 'Programa', 'Semestre', 'Anio'].forEach(id => {
                    try { const f = formTemp.getTextField(id); if(f) f.setText(''); } catch(e){}
                });
            } catch(e){}

            formTemp.flatten(); // <--- APLANAR
            const [copia] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(copia);
            return pdfMaestro;
        }

        // CASO B: CON MATERIAS
        for (const materia of materiasUnicas) {
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();

            const llenar = (id, val) => {
                try { 
                    const opts = [id, id.toLowerCase(), id.toUpperCase()];
                    for(const o of opts) {
                        const f = formTemp.getTextField(o);
                        if(f) { f.setText(String(val)); break; }
                    }
                } catch(e){}
            };

            llenar('NombreDocente', nombreDocente);
            llenar('Fecha', fecha);
            llenar('Asignatura', materia.NombreMateria);
            llenar('Programa', materia.Prog);
            llenar('Semestre', 'Agosto-Diciembre'); 
            llenar('Anio', '2024');

            formTemp.flatten(); // <--- EL TRUCO ESTÁ AQUÍ
            const [copia] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(copia);
        }

        return pdfMaestro;

    } catch (error) {
        console.error("❌ Error en docRecurso:", error);
        throw error;
    }
}

module.exports = { llenarRecurso };