// Archivo: backend/documentos/docTutoria.js

async function llenarTutoria(form, data, pool) {
    console.log("📄 Generando Constancia de Tutoría (Estilo CVU)...");

    // --- 1. HELPER DE LLENADO (Idéntico al de CVU) ---
    // Este es el que funciona bien. Busca el nombre exacto y variantes como id1, id_1, etc.
    const llenar = (id, valor, maxLength = 0) => {
        let textoFinal = String(valor || '').trim();
        if (textoFinal === 'null' || textoFinal === 'undefined') textoFinal = '';
        if (maxLength > 0 && textoFinal.length > maxLength) textoFinal = textoFinal.substring(0, maxLength);

        try { 
            let campo = null;
            // Lista de variantes que buscará en el PDF
            // Si tu campo se llama 'firma1', esto lo encontrará.
            const variantes = [id, `${id}_1`, `${id}1`, `${id}_copy`, id.toLowerCase(), id.toUpperCase()];
            
            for (const nombre of variantes) {
                try { campo = form.getTextField(nombre); if(campo) break; } catch(e){}
            }
            if (campo) {
                campo.setText(textoFinal);
            } else {
                console.log(`⚠️ Aviso: No se encontró el campo '${id}' en el PDF.`);
            }
        } catch(e) { console.error(`❌ Error al llenar '${id}':`, e); }
    };

    // --- 2. DATOS DEL DOCENTE ---
    const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
    llenar('nombre_docente', nombreCompleto);
    // Por si el PDF usa "nombre" a secas
    llenar('nombre', nombreCompleto);

    // --- 3. DEPARTAMENTO ---
    const qDepto = await pool.request().input('id', data.DocenteID).query(`
        SELECT Dep.NombreDepartamento FROM Docente D 
        INNER JOIN Departamento Dep ON D.DepartamentoID = Dep.DepartamentoID 
        WHERE D.DocenteID = @id
    `);
    const nombreDepto = qDepto.recordset.length > 0 ? qDepto.recordset[0].NombreDepartamento : 'Sistemas y Computación';
    llenar('departamento_docente', nombreDepto);

    // --- 4. TABLA DE PERIODOS (Lógica original necesaria para la tabla) ---
    const qTutor = await pool.request().input('id', data.DocenteID).query(`
        SELECT P.NombrePeriodo, T.CantTutorados, T.CarreraTut
        FROM Tutorados T INNER JOIN PeriodoEscolar P ON T.PeriodoID = P.PeriodoID
        WHERE T.DocenteID = @id
    `);

    let sumaTotal = 0;
    qTutor.recordset.forEach((fila, i) => {
        const num = i + 1;
        llenar(`Periodo${num}`, fila.NombrePeriodo);
        llenar(`Cantidad${num}`, `${fila.CantTutorados} tutorados`); 
        llenar(`Carrera${num}`, fila.CarreraTut, 45); 
        sumaTotal += fila.CantTutorados;
    });
    llenar('Total', `${sumaTotal} tutorados`);

    // --- 5. FIRMAS (Aquí aplicamos la lógica de CVU para dos personas) ---

    // A. FIRMA 1 (Izquierda): Jefa de Desarrollo Académico
    const qDesarrollo = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM DesarrolloAcademico");
    if (qDesarrollo.recordset.length > 0) {
        const jefe = qDesarrollo.recordset[0];
        const nombreJefe = `${jefe.NombreTitular} ${jefe.ApePatTitular} ${jefe.ApeMatTitular}`.toUpperCase();
        
        // Usamos el helper confiable para llenar 'firma1'
        console.log(`✍️ Escribiendo Firma 1: ${nombreJefe}`);
        llenar('firma1', nombreJefe);
        // También intentamos variantes por seguridad
        llenar('jefe_desarrollo', nombreJefe);
    }

    // B. FIRMA 2 (Derecha): Subdirectora Académica
    const qSub = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM Subdireccion");
    if (qSub.recordset.length > 0) {
        const sub = qSub.recordset[0];
        const nombreSub = `${sub.NombreTitular} ${sub.ApePatTitular} ${sub.ApeMatTitular}`.toUpperCase();
        
        // Usamos el helper confiable para llenar 'firma-2'
        console.log(`✍️ Escribiendo Firma 2: ${nombreSub}`);
        llenar('firma-2', nombreSub);
        // También intentamos variantes por seguridad
        llenar('subdireccion', nombreSub);
    }

    return true;
}

module.exports = { llenarTutoria };