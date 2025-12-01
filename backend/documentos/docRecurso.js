// Archivo: backend/documentos/docRecurso.js
const { sql, poolPromise } = require('../db');
const { PDFDocument } = require('pdf-lib');

// --- HELPER: CONVERTIR NÚMEROS A LETRAS ---
function numeroALetras(num) {
    const unidades = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
    const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

    if (num < 10) return unidades[num];
    if (num >= 10 && num < 20) return especiales[num - 10];
    if (num >= 20 && num < 30) return (num === 20) ? 'veinte' : 'veinti' + unidades[num - 20];
    if (num >= 30 && num < 100) {
        const d = Math.floor(num / 10);
        const u = num % 10;
        return (u === 0) ? decenas[d] : `${decenas[d]} y ${unidades[u]}`;
    }
    if (num === 2024) return "dos mil veinticuatro";
    if (num === 2025) return "dos mil veinticinco";
    if (num === 2026) return "dos mil veintiséis";
    return num.toString();
}

// Generar la frase legal completa (Ej: "trece días del mes de junio del año dos mil veinticinco")
function obtenerFechaLegal() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    
    const diaLetra = numeroALetras(d.getDate());
    const mesNombre = meses[d.getMonth()];
    const anioLetra = numeroALetras(d.getFullYear());

    // Ajustamos el texto para que encaje gramaticalmente en el espacio "a los _______"
    return `${diaLetra} días del mes de ${mesNombre} del año ${anioLetra}`;
}

// Fecha corta para la parte superior (13/junio/2025)
function obtenerFechaCorta() {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    return `${d.getDate()}/${meses[d.getMonth()]}/${d.getFullYear()}`;
}

async function llenarRecurso(fileBytes, data) {
    console.log("📄 Generando Recurso Digital (Modo Campos)...");

    try {
        const pool = await poolPromise;
        const pdfMaestro = await PDFDocument.create();

        // 1. PREPARAR DATOS
        const fechaArriba = obtenerFechaCorta(); 
        const fechaLegalAbajo = obtenerFechaLegal(); // Texto largo para el campo 'Fecha'
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

        // 2. BUSCAR MATERIAS (Multipágina)
        const queryMaterias = `
            SELECT DISTINCT M.NombreMateria, M.Prog 
            FROM Grupo G 
            INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID 
            INNER JOIN Materia M ON GM.MateriaID = M.MateriaID 
            WHERE G.DocenteID = @id
        `;
        const filasCrudas = (await pool.request().input('id', sql.Int, data.DocenteID).query(queryMaterias)).recordset;
        
        // Filtro JS para eliminar duplicados
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

            // Helper "Cazador de Campos"
            const llenar = (id, val) => {
                const t = String(val).trim();
                // Busca id exacto, minúsculas, mayúsculas y variantes Text_
                const vs = [id, id.toLowerCase(), id.toUpperCase(), `Text_${id}`, `${id}_1`];
                for(const v of vs){ try{ const c = formTemp.getTextField(v); if(c) c.setText(t); }catch(e){} }
            };

            // --- LLENADO DE CAMPOS ---
            
            // 1. Fecha Legal (Abajo) -> En el campo 'Fecha' como pediste
            llenar('Fecha-let', fechaLegalAbajo); 
            llenar('FechaLetra', fechaLegalAbajo); // Variante por seguridad

            // 2. Fecha Corta (Arriba) -> Si tienes otro campo para esto
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