// Archivo: backend/documentos/docEstrategias.js
const { sql } = require('../db');
const { PDFDocument } = require('pdf-lib');

function obtenerFechaTexto() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()}/${meses[d.getMonth()]}/${d.getFullYear()}`;
}

async function llenarEstrategias(fileBytes, data) {
    console.log("📄 Generando Estrategias (Aplanado Correcto)...");

    try {
        const { poolPromise } = require('../db'); 
        const pool = await poolPromise;

        // 1. CONSULTA DE MATERIAS
        const queryMaterias = `
           SELECT M.NombreMateria, M.Estrategia, M.Prog 
           FROM Grupo G 
           JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID
           JOIN Materia M ON GM.MateriaID = M.MateriaID
           JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
           WHERE G.DocenteID = @idDocente AND P.NombrePeriodo LIKE '%2024%'
        `;
        
        const resMaterias = await pool.request()
            .input('idDocente', sql.Int, data.DocenteID)
            .query(queryMaterias);
            
        const filasCrudas = resMaterias.recordset;

        // Filtro de duplicados
        const materiasUnicas = [];
        const yaProcesadas = new Set();
        filasCrudas.forEach(fila => {
            const huella = fila.NombreMateria.trim().toUpperCase();
            if (!yaProcesadas.has(huella)) {
                materiasUnicas.push(fila);
                yaProcesadas.add(huella);
            }
        });

        // 2. GENERACIÓN DEL PDF MAESTRO
        const pdfMaestro = await PDFDocument.create();
        const fechaTxt = obtenerFechaTexto();
        const nombreCompleto = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat || ''}`.toUpperCase();

        // CASO A: SI NO HAY MATERIAS (HOJA EN BLANCO LIMPIA)
        if (materiasUnicas.length === 0) {
            console.log("⚠️ Sin materias. Generando hoja vacía limpia.");
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();
            
            // Llenamos solo encabezados para que no se vea todo vacío
            try {
                const fFecha = formTemp.getTextField('Fecha'); if(fFecha) fFecha.setText(fechaTxt);
                const fNombre = formTemp.getTextField('NombreDocente'); if(fNombre) fNombre.setText(nombreCompleto);
                
                // Limpiamos los campos de tabla explícitamente con texto vacío
                const camposTabla = ['Asignatura1', 'Estrategia1', 'Programa1'];
                camposTabla.forEach(c => { const f = formTemp.getTextField(c); if(f) f.setText(''); });

            } catch(e) {}

            formTemp.flatten(); // <--- CLAVE: Aplanar aquí para quitar los cuadros azules
            const [pagina] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(pagina);
            return pdfMaestro;
        }

        // CASO B: CON MATERIAS (UNA PÁGINA POR MATERIA)
        for (const materia of materiasUnicas) {
            // Cargar plantilla fresca en cada vuelta
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();

            const llenar = (id, val) => {
                try { 
                    const c = formTemp.getTextField(id); 
                    if(c) c.setText(String(val).trim()); 
                } catch(e){}
            };

            // Llenar campos
            llenar('Fecha', fechaTxt);
            llenar('NombreDocente', nombreCompleto);
            llenar('Asignatura1', materia.NombreMateria);
            llenar('Estrategia1', materia.Estrategia || 'Aprendizaje Basado en Proyectos');
            llenar('Programa1', materia.Prog);
            
            // EL SECRETO: Aplanar ANTES de copiar
            formTemp.flatten(); 

            // Ahora copiamos la página ya "planchada" (sin campos editables)
            const [paginaCopiada] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(paginaCopiada);
        }

        return pdfMaestro;

    } catch (error) {
        console.error("❌ Error en docEstrategias:", error);
        throw error;
    }
}

module.exports = { llenarEstrategias };