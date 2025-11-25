// Archivo: backend/documentos/docLaboral.js

// Helper para formatear fechas (local para este módulo)
function formatearFecha(fecha) {
    if (!fecha) return "Fecha no registrada";
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Función principal que exportamos
async function llenarLaboral(form, data, nombreAdminFirma) {
    console.log("📄 Generando Constancia Laboral desde módulo externo...");

    // Helper interno para llenar campos (incluso si tienen nombres variados como _1, _copy)
    const llenar = (id, valor) => {
        const valorStr = String(valor || '').trim();
        try { const c = form.getTextField(id); if(c) c.setText(valorStr); } catch(e){}
        
        // Intentar variantes comunes por si el PDF tiene nombres raros
        const variantes = [`${id}_2`, `${id} 2`, `${id}_copy`, `${id}1`, `${id}_1`];
        variantes.forEach(v => {
            try { const c = form.getTextField(v); if(c) c.setText(valorStr); } catch(e){}
        });
    };

    // 1. Preparar Datos
    const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();
    
    // Lógica de Plazas y Horas
    let plazaCompleta = data.TipoPlaza || '';
    let horas = '';
    let tipoTiempo = plazaCompleta;

    const matchHoras = plazaCompleta.match(/(\d+\s*(HRS|hrs))/i);
    if (matchHoras) {
        horas = matchHoras[0]; 
        tipoTiempo = plazaCompleta.replace(matchHoras[0], '').replace(/[()]/g, '').trim(); 
    }

    // Lógica de Estatus (Base vs Ilimitado)
    let estatusTexto = '(95) ILIMITADO';
    if (data.DocenteStatus && data.DocenteStatus.toLowerCase().includes('activo')) {
        estatusTexto = '(10) BASE';
    }

    // 2. Llenar el PDF
    llenar('nombre', nombreCompleto);
    llenar('afiliacion', data.RFCDocente);
    llenar('fecha-inicio', formatearFecha(data.FechaIngreso));
    llenar('fecha-categoria', '01 de Enero de 2024'); // Puedes hacerlo dinámico si tienes el dato
    
    llenar('tipo-maestro', data.CategoriaActual); 
    llenar('tiempo', tipoTiempo); 
    llenar('tiempo-clases', horas); 
    
    // Llenar estatus en todas sus posibles variantes
    llenar('estatus', estatusTexto);      
    llenar('estatus 1', estatusTexto);    
    llenar('estatus_1', estatusTexto);    
    
    llenar('clave', data.ClavePresupuestal);
    llenar('efectos', formatearFecha(data.EfectosDesde));
    
    // Firma del Administrativo (Nombre en texto)
    llenar('firma', nombreAdminFirma);

    return true; // Éxito
}

module.exports = { llenarLaboral };