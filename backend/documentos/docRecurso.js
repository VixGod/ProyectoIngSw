// Archivo: backend/documentos/docRecurso.js
const { sql, poolPromise } = require('../db');
const { PDFDocument } = require('pdf-lib');

// MODIFICADO: Función única para fecha estilo CVU (13 de junio de 2025)
function obtenerFechaEstiloCVU() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// Mantenemos la corta por si se usa en la cabecera (13/junio/2025)
function obtenerFechaCorta() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()}/${meses[d.getMonth()]}/${d.getFullYear()}`;
}

async function llenarRecurso(fileBytes, data) {
    console.log("📄 Generando Recurso Digital (Formato Fecha CVU)...");

    try {
        const pool = await poolPromise;
        const pdfMaestro = await PDFDocument.create();

        // 1. PREPARAR DATOS
        const fechaArriba = obtenerFechaCorta(); 
        const fechaAbajo = obtenerFechaEstiloCVU(); // Ahora usa el formato "13 de junio de 2025"
        
        const nombreDocente = `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase();

        // Semestre
        const qPeriodo = await pool.request().query("SELECT TOP 1 NombrePeriodo FROM PeriodoEscolar WHERE StatusPer = 'Activo'");
        let textoSemestre = "Enero-Junio";
        let textoAnio = new Date().getFullYear().toString();
        if (qPeriodo.recordset.length > 0) {
            const p = qPeriodo.recordset[0].NombrePeriodo; 
            const partes = p.split(' ');
            if (partes.length > 1) {
                textoAnio = partes[partes.length - 1]; 
                textoSemestre = partes.slice(0, -1).join(' '); 
            }
        }

        // Firmas
        let nombreJefe="", nombrePres="", nombreSub="";
        const qJefa = await pool.request().input('d', data.DepartamentoID).query("SELECT TOP 1 * FROM JefaDepartamento WHERE DepartamentoID = @d");
        if(qJefa.recordset.length) nombreJefe = `${qJefa.recordset[0].NombreTitular} ${qJefa.recordset[0].ApePatTitular} ${qJefa.recordset[0].ApeMatTitular}`.toUpperCase();
        
        const qPres = await pool.request().input('d', data.DepartamentoID).query("SELECT TOP 1 * FROM PresidenteAcademia WHERE DepartamentoID = @d");
        if(qPres.recordset.length) nombrePres = `${qPres.recordset[0].PresidenteNombre} ${qPres.recordset[0].PresidenteApePat} ${qPres.recordset[0].PresidenteApeMat}`.toUpperCase();
        
        const qSub = await pool.request().query("SELECT TOP 1 * FROM Subdireccion");
        if(qSub.recordset.length) nombreSub = `${qSub.recordset[0].NombreTitular} ${qSub.recordset[0].ApePatTitular} ${qSub.recordset[0].ApeMatTitular}`.toUpperCase();

        // 2. BUSCAR MATERIAS
        const queryMaterias = `
            SELECT DISTINCT M.NombreMateria, M.Prog 
            FROM Grupo G 
            INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID 
            INNER JOIN Materia M ON GM.MateriaID = M.MateriaID 
            WHERE G.DocenteID = @id
        `;
        const filasCrudas = (await pool.request().input('id', sql.Int, data.DocenteID).query(queryMaterias)).recordset;
        
        const materiasUnicas = [];
        const ya = new Set();
        filasCrudas.forEach(f => {
            if(!ya.has(f.NombreMateria.trim().toUpperCase())) {
                materiasUnicas.push(f);
                ya.add(f.NombreMateria.trim().toUpperCase());
            }
        });

        if (materiasUnicas.length === 0) {
            console.log("⚠️ Sin materias.");
            return await PDFDocument.load(fileBytes);
        }

        // 3. GENERAR PÁGINAS
        for (const materia of materiasUnicas) {
            const pdfTemp = await PDFDocument.load(fileBytes);
            const formTemp = pdfTemp.getForm();

            const llenar = (id, val) => {
                const t = String(val).trim();
                const vs = [id, id.toLowerCase(), id.toUpperCase(), `Text_${id}`, `${id}_1`];
                for(const v of vs){ try{ const c = formTemp.getTextField(v); if(c) c.setText(t); }catch(e){} }
            };

            // --- LLENADO DE CAMPOS ---
            
            // 1. Fecha Abajo (Ahora formato simple)
            llenar('Fecha', fechaAbajo);      // Intentamos llenar el campo 'Fecha' principal
            llenar('Fecha-let', fechaAbajo);  // Y sus variantes por si acaso
            llenar('FechaLetra', fechaAbajo);

            // 2. Fecha Corta (Arriba)
            llenar('Fecha_Cabecera', fechaArriba); 
            llenar('Fecha_Top', fechaArriba);

            // 3. Datos Docente y Periodo
            llenar('NombreDocente', nombreDocente);
            llenar('Semestre', textoSemestre);
            llenar('Anio', textoAnio);
            llenar('Periodo', `${textoSemestre} ${textoAnio}`);

            // 4. Datos Específicos de la Materia
            llenar('Asignatura', materia.NombreMateria);
            llenar('Programa', materia.Prog);

            // 5. Firmas
            llenar('NombreJefe', nombreJefe);
            llenar('NombrePresidente', nombrePres);
            llenar('NombreSubdirector', nombreSub);

            formTemp.flatten();
            const [copia] = await pdfMaestro.copyPages(pdfTemp, [0]);
            pdfMaestro.addPage(copia);
        }

        return pdfMaestro;

    } catch (error) {
        console.error("❌ Error Recurso:", error);
        return null;
    }
}

module.exports = { llenarRecurso };