// Archivo: backend/documentos/docCVU.js

async function llenarCVU(form, data, nombreAdminFirma) {

    const llenar = (id, valor) => {
        const valorStr = String(valor || '').trim();
        try { const c = form.getTextField(id); if(c) c.setText(valorStr); } catch(e){}
        const variantes = [`${id}_1`, `${id}1`, `${id}_copy`];
        variantes.forEach(v => { try { const c = form.getTextField(v); if(c) c.setText(valorStr); } catch(e){} });
    };

    // 1. DATOS
    const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
    const anioEvaluado = (new Date().getFullYear() - 1).toString(); 
    const idConCeros = data.DocenteID.toString().padStart(3, '0');
    const anioActual = new Date().getFullYear();
    const folio = `DDA-${idConCeros}-06-${anioActual}`;

    // --- CORRECCIÓN DE FECHA (Solo la fecha pura) ---
    const opciones = { day: 'numeric', month: 'long', year: 'numeric' };
    // Usamos 'es-MX' para asegurar el formato "24 de noviembre de 2025"
    const fechaTexto = new Date().toLocaleDateString('es-MX', opciones); 
    
    // 2. LLENADOS
    llenar('nombre', nombreCompleto);
    llenar('registro', data.Registro || 'EN TRÁMITE'); 
    llenar('año_actual', anioEvaluado);
    llenar('num_documento', folio);
    
    // Aquí mandamos SOLO la fecha, sin "a los" ni texto extra
    llenar('fecha_emision', fechaTexto); 
    
    llenar('firma', nombreAdminFirma);

    return true;
}

module.exports = { llenarCVU };