// Archivo: backend/documentos/docRecurso.js
const { sql, poolPromise } = require('../db');

// Función para fecha corta (ej: 29/11/2025)
function obtenerFechaActual() {
    const d = new Date();
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

async function llenarRecurso(form, data) {
    // Helper para llenar campos sin error si alguno falta
    const llenar = (id, valor) => {
        try { const c = form.getTextField(id); if(c) c.setText(String(valor||'').trim()); } catch(e){}
    };

    try {
        const pool = await poolPromise;

        // 1. DATOS GENERALES
        const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
        console.log("Generando Recurso Digital para:", nombreCompleto);

        llenar('NombreDocente', nombreCompleto);
        llenar('Fecha', obtenerFechaActual());
        // NO llenamos 'Folio' porque no existe en el PDF.

        // 2. SEMESTRE Y AÑO (Automático desde BD)
        // Busca el periodo activo (ej: "Enero-Junio 2025") y lo separa
        const qPeriodo = await pool.request().query("SELECT TOP 1 NombrePeriodo FROM PeriodoEscolar WHERE StatusPer = 'Activo'");
        
        let textoSemestre = "Enero-Junio";
        let textoAnio = new Date().getFullYear().toString();

        if (qPeriodo.recordset.length > 0) {
            const p = qPeriodo.recordset[0].NombrePeriodo; 
            const partes = p.split(' ');
            if (partes.length > 1) {
                textoAnio = partes[partes.length - 1]; // Toma el último pedazo como año
                textoSemestre = partes.slice(0, -1).join(' '); // El resto es el semestre
            }
        }
        
        llenar('Semestre', textoSemestre);
        llenar('Anio', textoAnio);

        // 3. ASIGNATURA Y PROGRAMA
        // Toma la PRIMERA materia que encuentre (porque el documento es singular)
        const qMateria = await pool.request()
            .input('id', sql.Int, data.DocenteID)
            .query(`
                SELECT TOP 1 M.NombreMateria, M.Prog 
                FROM Grupo G 
                INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID 
                INNER JOIN Materia M ON GM.MateriaID = M.MateriaID 
                WHERE G.DocenteID = @id
            `);

        if (qMateria.recordset.length > 0) {
            const mat = qMateria.recordset[0];
            llenar('Asignatura', mat.NombreMateria);
            llenar('Programa', mat.Prog);
        } else {
            llenar('Asignatura', 'SIN CARGA ACADÉMICA');
            llenar('Programa', 'SIN PROGRAMA');
        }

        // 4. FIRMAS (Jefa, Presidente, Subdirector)
        // Jefa de Depto
        const qJefa = await pool.request().input('d', data.DepartamentoID).query("SELECT * FROM JefaDepartamento WHERE DepartamentoID = @d");
        if(qJefa.recordset.length) {
            const j = qJefa.recordset[0];
            llenar('NombreJefe', `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase());
        }

        // Presidente Academia
        const qPres = await pool.request().input('d', data.DepartamentoID).query("SELECT * FROM PresidenteAcademia WHERE DepartamentoID = @d");
        if(qPres.recordset.length) {
            const p = qPres.recordset[0];
            llenar('NombrePresidente', `${p.PresidenteNombre} ${p.PresidenteApePat} ${p.PresidenteApeMat}`.toUpperCase());
        }

        // Subdirección
        const qSub = await pool.request().query("SELECT * FROM Subdireccion");
        if(qSub.recordset.length) {
            const s = qSub.recordset[0];
            llenar('NombreSubdirector', `${s.NombreTitular} ${s.ApePatTitular} ${s.ApeMatTitular}`.toUpperCase());
        }

        return true;

    } catch (error) {
        console.error("❌ Error en Recurso Digital:", error);
        return false;
    }
}

module.exports = { llenarRecurso };