// Archivo: backend/documentos/docCVU.js

async function llenarCVU(form, data, nombreAdminFirma) {


    // --- SUPER HELPER DE LLENADO ---
    const llenar = (id, valor, maxLength = 0) => {
        let textoFinal = String(valor || '').trim();
        if (textoFinal === 'null' || textoFinal === 'undefined') textoFinal = '';
        if (maxLength > 0 && textoFinal.length > maxLength) textoFinal = textoFinal.substring(0, maxLength);

        try { 
            let campo = null;
            const variantes = [id, `${id}_1`, `${id}1`, `${id}_copy`];
            for (const nombre of variantes) {
                try { campo = form.getTextField(nombre); if(campo) break; } catch(e){}
            }
            if (campo) campo.setText(textoFinal);
        } catch(e) { console.error(`❌ Error al llenar '${id}':`, e); }
    };

    // 1. PREPARACIÓN DE DATOS
    const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
    
    const anioEvaluado = (new Date().getFullYear() - 1).toString(); 
    const idConCeros = data.DocenteID.toString().padStart(3, '0');
    const anioActual = new Date().getFullYear();
    const folio = `DDA-${idConCeros}-06-${anioActual}`;

    const opciones = { day: 'numeric', month: 'long', year: 'numeric' };
    const fechaTexto = new Date().toLocaleDateString('es-MX', opciones); 

    // 2. LLENADO
    llenar('nombre', nombreCompleto);
    llenar('registro', data.Registro || 'EN TRÁMITE'); 
    llenar('año_actual', anioEvaluado);
    llenar('num_documento', folio);
    
    // Solo la fecha limpia, sin texto extra
    llenar('fecha_emision', fechaTexto); 
    
    llenar('firma', nombreAdminFirma);

    return true;
}

module.exports = { llenarCVU };