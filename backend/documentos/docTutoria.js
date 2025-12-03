// Archivo: backend/documentos/docTutoria.js
const { sql } = require('../db'); // Asegúrate de importar sql

async function llenarTutoria(form, data, pool) {
    console.log("📄 Generando Constancia de Tutoría...");

    // Helper de llenado
    const llenar = (id, valor) => {
        let textoFinal = String(valor || '').trim();
        try { 
            // Intenta llenar el campo exacto o variantes comunes
            const variantes = [id, `${id}_1`, `${id}1`, id.toLowerCase()];
            for (const v of variantes) {
                const campo = form.getTextField(v);
                if (campo) { campo.setText(textoFinal); break; }
            }
        } catch(e) {}
    };

    // 1. DATOS GENERALES
    const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat || ''}`.toUpperCase();
    llenar('nombre_docente', nombreCompleto);
    llenar('nombre', nombreCompleto);

    // 2. CONSULTA SQL CORREGIDA (Aquí estaba el error)
    // Usamos @idDocente en el query y 'idDocente' en el input
    const qTutor = await pool.request()
        .input('idDocente', sql.Int, data.DocenteID) // <--- CORRECCIÓN AQUÍ
        .query(`
            SELECT P.NombrePeriodo, T.CantTutorados, T.CarreraTut
            FROM Tutorados T 
            JOIN PeriodoEscolar P ON T.PeriodoID = P.PeriodoID 
            WHERE T.DocenteID = @idDocente AND P.NombrePeriodo LIKE '%2024%'
        `);

    let sumaTotal = 0;
    
    // Llenar tabla de periodos (Asumiendo que el PDF tiene campos Periodo1, Cantidad1, etc.)
    qTutor.recordset.forEach((fila, i) => {
        const num = i + 1;
        llenar(`Periodo${num}`, fila.NombrePeriodo);
        llenar(`Cantidad${num}`, `${fila.CantTutorados} tutorados`); 
        llenar(`Carrera${num}`, fila.CarreraTut); 
        sumaTotal += fila.CantTutorados;
    });
    
    llenar('Total', `${sumaTotal} tutorados`);

    // 3. FIRMAS (Jefes)
    try {
        const qDesarrollo = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM DesarrolloAcademico");
        if (qDesarrollo.recordset.length > 0) {
            const j = qDesarrollo.recordset[0];
            llenar('jefe_desarrollo', `${j.NombreTitular} ${j.ApePatTitular} ${j.ApeMatTitular}`.toUpperCase());
        }

        const qSub = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM Subdireccion");
        if (qSub.recordset.length > 0) {
            const s = qSub.recordset[0];
            llenar('subdireccion', `${s.NombreTitular} ${s.ApePatTitular} ${s.ApeMatTitular}`.toUpperCase());
        }
    } catch(e) { console.log("Error consultando firmas:", e); }

    return true;
}

module.exports = { llenarTutoria };