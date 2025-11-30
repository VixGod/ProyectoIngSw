// Archivo: backend/documentos/docEstrategias.js
const { sql, poolPromise } = require('../db');

function obtenerFechaActual() {
    const d = new Date();
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const anio = d.getFullYear();
    
    return `${dia}/${mes}/${anio}`; // Resultado: 30/11/2025
}

async function llenarEstrategias(form, data) {
    // Función auxiliar para llenar campos sin que truene si no existen
    const llenar = (id, valor) => {
        try { 
            const c = form.getTextField(id); 
            if(c) c.setText(String(valor || '').trim()); 
        } catch(e) {
            // Si el campo no existe (como el Folio), no pasa nada, continuamos.
        }
    };

    try {
        const pool = await poolPromise;

        // 1. DATOS GENERALES
        const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
        console.log("Llenando constancia para:", nombreCompleto);
        
        llenar('NombreDocente', nombreCompleto);
        llenar('Fecha', obtenerFechaActual());
        // El Folio lo quitamos porque me indicaste que no lo pusiste en el PDF.

        // 2. TABLA DE MATERIAS (CORRECCIÓN SQL AQUÍ)
        // Usamos INNER JOIN con la tabla intermedia 'GrupoMateria'
        const queryMaterias = `
            SELECT M.NombreMateria, M.Estrategia, M.Prog 
            FROM Grupo G 
            INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID 
            INNER JOIN Materia M ON GM.MateriaID = M.MateriaID 
            WHERE G.DocenteID = @id
        `;
        
        const resMaterias = await pool.request()
            .input('id', sql.Int, data.DocenteID)
            .query(queryMaterias);

        console.log(`Materias encontradas: ${resMaterias.recordset.length}`);

        // Llenar filas (Asignatura1, Estrategia1, Programa1, etc.)
        resMaterias.recordset.forEach((fila, i) => {
            const num = i + 1;
            llenar(`Asignatura${num}`, fila.NombreMateria);
            llenar(`Estrategia${num}`, fila.Estrategia || 'Aprendizaje Basado en Proyectos');
            llenar(`Programa${num}`, fila.Prog);
        });

        // 3. FIRMAS
        // Jefa de Departamento
        const qJefa = await pool.request().input('d', data.DepartamentoID).query("SELECT * FROM JefaDepartamento WHERE DepartamentoID = @d");
        if(qJefa.recordset.length) {
            const j = qJefa.recordset[0];
            llenar('NombreJefe', `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase());
        }

        // Presidente de Academia
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
        console.error("❌ Error generando estrategias:", error);
        return false;
    }
}

module.exports = { llenarEstrategias };