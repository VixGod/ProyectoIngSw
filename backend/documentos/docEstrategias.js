// Archivo: backend/documentos/docEstrategias.js
const { sql, poolPromise } = require('../db');
const { PDFDocument } = require('pdf-lib');

// MODIFICADO: Formato "10 de junio de 2025" (Estilo CVU)
function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

async function llenarEstrategias(fileBytes, data) {
    console.log("📄 Generando Constancias de Estrategias (Formato Fecha CVU)...");

    try {
        const pool = await poolPromise;

        // 1. OBTENER DATOS CRUDOS DE LA BD
        const queryMaterias = `
            SELECT M.NombreMateria, M.Estrategia, M.Prog 
            FROM Grupo G 
            INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID 
            INNER JOIN Materia M ON GM.MateriaID = M.MateriaID 
            WHERE G.DocenteID = @id
        `;
        
        const resMaterias = await pool.request().input('id', sql.Int, data.DocenteID).query(queryMaterias);
        const filasCrudas = resMaterias.recordset;

        if (filasCrudas.length === 0) {
            console.log("⚠️ El docente no tiene materias asignadas.");
            const pdfDoc = await PDFDocument.load(fileBytes);
            return pdfDoc; 
        }

        // --- FILTRADO INTELIGENTE (ELIMINAR DUPLICADOS REALES) ---
        const materiasUnicas = [];
        const yaProcesadas = new Set();

        filasCrudas.forEach(fila => {
            const huella = fila.NombreMateria.trim().toUpperCase();
            if (!yaProcesadas.has(huella)) {
                materiasUnicas.push(fila); 
                yaProcesadas.add(huella);  
            }
        });

        console.log(`📊 Grupos encontrados: ${filasCrudas.length} | Materias Únicas: ${materiasUnicas.length}`);

        // 2. CREAR DOCUMENTO MAESTRO
        const pdfMaestro = await PDFDocument.create();

        // 3. OBTENER DATOS
        const fechaTxt = obtenerFechaTexto(); // Usamos la nueva función
        const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
        
        let nombreJefe = "", nombrePres = "", nombreSub = "";
        
        const qJefa = await pool.request().input('d', data.DepartamentoID).query("SELECT TOP 1 * FROM JefaDepartamento WHERE DepartamentoID = @d");
        if(qJefa.recordset.length) { const j = qJefa.recordset[0]; nombreJefe = `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase(); }

        const qPres = await pool.request().input('d', data.DepartamentoID).query("SELECT TOP 1 * FROM PresidenteAcademia WHERE DepartamentoID = @d");
        if(qPres.recordset.length) { const p = qPres.recordset[0]; nombrePres = `${p.PresidenteNombre} ${p.PresidenteApePat} ${p.PresidenteApeMat}`.toUpperCase(); }

        const qSub = await pool.request().query("SELECT TOP 1 * FROM Subdireccion");
        if(qSub.recordset.length) { const s = qSub.recordset[0]; nombreSub = `${s.NombreTitular} ${s.ApePatTitular} ${s.ApeMatTitular}`.toUpperCase(); }

        // 4. GENERAR PÁGINAS
        for (const materia of materiasUnicas) {
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();

            const llenar = (id, val) => {
                try { const c = formTemp.getTextField(id); if(c) c.setText(String(val).trim()); } catch(e){}
            };

            // Aquí llenamos la fecha con el nuevo formato
            llenar('Fecha', fechaTxt);
            
            llenar('NombreDocente', nombreCompleto);
            llenar('NombreJefe', nombreJefe);
            llenar('NombrePresidente', nombrePres);
            llenar('NombreSubdirector', nombreSub);

            llenar('Asignatura1', materia.NombreMateria);
            llenar('Estrategia1', materia.Estrategia || 'Aprendizaje Basado en Proyectos');
            llenar('Programa1', materia.Prog);

            formTemp.flatten();

            const [paginaCopiada] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(paginaCopiada);
        }

        return pdfMaestro;

    } catch (error) {
        console.error("❌ Error en estrategias:", error);
        return null;
    }
}

module.exports = { llenarEstrategias };