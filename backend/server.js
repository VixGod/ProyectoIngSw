const express = require('express');
const cors = require('cors');
const { sql, poolPromise } = require('./db'); 
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// --- IMPORTACIÓN DE MÓDULOS ESPECIALISTAS ---
const { llenarLaboral } = require('./documentos/docLaboral'); 
const { llenarCVU } = require('./documentos/docCVU'); 
const { llenarTutoria } = require('./documentos/docTutoria'); 
const { llenarEstrategias } = require('./documentos/docEstrategias');
const { llenarRecurso } = require('./documentos/docRecurso');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

require('./documentos/docExencion')(app);  // El de la Constancia de Exención
require('./documentos/docHorarios')(app);

// Helper Global
function formatearFecha(fecha) {
    if (!fecha) return "Fecha no registrada";
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ==================================================================
// 1. LOGIN
// ==================================================================
app.post('/login', async (req, res) => {
    const { rfc, password } = req.body;
    if (!rfc || !password) return res.status(400).json({ success: false, message: 'Faltan datos.' });

    try {
        const pool = await poolPromise;
        const queryUniversal = `
            SELECT DocenteID as ID, NombreDocente as Nombre, DocenteApePat as ApePat, DocenteApeMat as ApeMat, DocenteCorreo as Correo, RFCDocente as Usuario, 'Docente' as Rol, 'Docente' as Cargo, NULL as FirmaDigital FROM Docente WHERE RFCDocente = @user AND DocentePassword = @pass
            UNION ALL SELECT DirectorID, DirectorNombre, DirectorApePat, DirectorApeMat, 'director@delta.edu', DirectorNombre, 'Administrativo', 'Direccion', FirmaDigital FROM Direccion WHERE DirectorNombre = @user AND DirectorPassword = @pass
            UNION ALL SELECT SubdireccionID, NombreTitular, ApePatTitular, ApeMatTitular, 'subdireccion@delta.edu', RFCTitular, 'Administrativo', 'Subdireccion', FirmaDigital FROM Subdireccion WHERE RFCTitular = @user AND SubdirectoraPassword = @pass
            UNION ALL SELECT RHID, NombreTitular, ApePatTitular, ApeMatTitular, 'rh@delta.edu', RFCTitular, 'Administrativo', 'RH', FirmaDigital FROM RH WHERE RFCTitular = @user AND TitularPassword = @pass
            UNION ALL SELECT ServEscID, NombreTitular, ApePatTitular, ApeMatTitular, 'escolares@delta.edu', RFCTitular, 'Administrativo', 'ServiciosEscolares', FirmaDigital FROM ServiciosEscolares WHERE RFCTitular = @user AND TitularPassword = @pass
            UNION ALL SELECT DesaAcadID, NombreTitular, ApePatTitular, ApeMatTitular, 'desarrollo@delta.edu', RFCTitular, 'Administrativo', 'DesarrolloAcademico', FirmaDigital FROM DesarrolloAcademico WHERE RFCTitular = @user AND TitularPassword = @pass
            UNION ALL SELECT JefaDepartamentoID, NombreTitular, ApePatTitular, ApeMatTitular, 'jefatura@delta.edu', RFCTitular, 'Administrativo', 'JefaDepartamento', FirmaDigital FROM JefaDepartamento WHERE RFCTitular = @user AND TitularPassword = @pass
            UNION ALL SELECT PresidenteID, PresidenteNombre, PresidenteApePat, PresidenteApeMat, 'academia@delta.edu', RFCPresidente, 'Administrativo', 'PresidenteAcademia', FirmaDigital FROM PresidenteAcademia WHERE RFCPresidente = @user AND PresidentePassword = @pass
            UNION ALL SELECT ResponsableID, NombreTitular, ApePatTitular, ApeMatTitular, 'area@delta.edu', RFCTitular, 'Administrativo', 'ResponsableArea', FirmaDigital FROM ResponsableArea WHERE RFCTitular = @user AND TitularPassword = @pass
        `;

        const result = await pool.request().input('user', sql.NVarChar, rfc).input('pass', sql.NVarChar, password).query(queryUniversal);

        if (result.recordset.length > 0) {
            const u = result.recordset[0];
            return res.json({ 
                success: true, 
                docente: {
                    DocenteID: u.ID,
                    NombreDocente: u.Nombre,
                    DocenteApePat: u.ApePat,
                    DocenteApeMat: u.ApeMat,
                    DocenteCorreo: u.Correo,
                    DirectorNombre: (u.Rol === 'Administrativo') ? u.Nombre : null,
                    Rol: u.Rol, 
                    Cargo: u.Cargo,
                    FirmaDigital: u.FirmaDigital
                }
            });
        }
        res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    } catch (error) { console.error("Error Login:", error); res.status(500).json({ success: false, message: 'Error del servidor.' }); }
});

// ==================================================================
// 2. CATÁLOGO INTELIGENTE (REGLAS ESTRICTAS DE NEGOCIO)
// ==================================================================
app.get('/api/catalogo-inteligente', async (req, res) => {
    try {
        const pool = await poolPromise;
        const idDocente = req.query.id; 

        // 1. DATOS Y CONSULTAS
        const perfilQuery = await pool.request().input('id', idDocente).query("SELECT * FROM Docente WHERE DocenteID = @id");
        if (perfilQuery.recordset.length === 0) return res.json([]); 
        const perfil = perfilQuery.recordset[0];

        const tiposDocs = await pool.request().query("SELECT * FROM TiposDocumento");
        const listaTodos = tiposDocs.recordset;

        // Consultas auxiliares
        const qTutor = await pool.request().input('id', idDocente).query("SELECT SUM(CantTutorados) as Total FROM Tutorados WHERE DocenteID = @id");
        const totalTutorados = qTutor.recordset[0].Total || 0;
        
        const qGrupo = await pool.request().input('id', idDocente).query(`SELECT M.Estrategia FROM Grupo G INNER JOIN GrupoMateria GM ON G.GrupoID = GM.GrupoID INNER JOIN Materia M ON GM.MateriaID = M.MateriaID WHERE G.DocenteID = @id`);
        const datosGrupo = qGrupo.recordset;
        
        const qAdmin = await pool.request().input('id', idDocente).query("SELECT NumDict FROM ActividadAdministrativa WHERE DocenteID = @id");
        const datosAdmin = qAdmin.recordset;

        const historialQ = await pool.request().input('id', idDocente).query(`SELECT Doc.TipoDoc FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID WHERE Exp.DocenteID = @id`);
        const docsYaPedidos = historialQ.recordset.map(d => d.TipoDoc.trim());

        // --- 2. CÁLCULO DE VALIDACIONES GLOBALES ---
        const esAdministrativo = perfil.Rol && perfil.Rol !== 'Docente';
        const horasClase = datosGrupo.length * 5; 
        const cumpleHorasAdmin = !esAdministrativo || (esAdministrativo && horasClase >= 4);

        // A. Antigüedad (Art. 20a)
        const anioActual = new Date().getFullYear();
        const fechaIngreso = perfil.FechaIngreso ? new Date(perfil.FechaIngreso) : new Date();
        const fechaLimiteAntiguedad = new Date(`${anioActual - 1}-01-16`); 
        const cumpleAntiguedad = fechaIngreso < fechaLimiteAntiguedad;

        // B. Asistencia (Art. 20a y 38h)
        const cumpleAsistencia = (perfil.PorcentajeAsistencia >= 90);

        // C. Evaluación (Art. 20o y 20p)
        // Asumimos que 70 es la calificación mínima para "SUFICIENTE"
        const cumpleEvaluacion = (perfil.PromedioEvaluacion >= 70);

        // D. Estatus (Art. 4)
        const estatusValido = perfil.TipoPlaza && !perfil.TipoPlaza.includes('(20)');


        // --- 3. GENERAR CATÁLOGO ---
        let catalogo = [];

        listaTodos.forEach(doc => {
            let motivoBloqueo = null;
            const yaLoTiene = docsYaPedidos.includes(doc.NombreVisible.trim());

            // =========================================================
            // REGLAS GLOBALES (BLOQUEO TOTAL SI FALLAN)
            // =========================================================
            if (!perfil.CedulaDocente) motivoBloqueo = "Falta Cédula Profesional (Req. Inicio)";
            
            else if (!estatusValido) motivoBloqueo = "Tu estatus (20) no participa en el programa.";
            
            else if (!cumpleAntiguedad) motivoBloqueo = "No cumples con la antigüedad mínima (1 año).";
            
            else if (!cumpleAsistencia) motivoBloqueo = `Asistencia insuficiente (${perfil.PorcentajeAsistencia}%). Mínimo requerido: 90%.`;
            
            // ✅ AHORA ES GLOBAL: Si reprueba evaluación, no entra a nada.
            else if (!cumpleEvaluacion) motivoBloqueo = `Evaluación docente insuficiente (${perfil.PromedioEvaluacion}). Mínimo: 70.`;

            // Regla para Administrativos
            else if (esAdministrativo && !cumpleHorasAdmin) motivoBloqueo = "Admin requiere mín. 4 hrs frente a grupo.";


            // =========================================================
            // REGLAS ESPECÍFICAS (Solo si pasó las globales)
            // =========================================================
            if (!motivoBloqueo) {
                
                if (doc.NombreVisible === 'Constancia Laboral') {
                    let faltantes = [];
                    if (!perfil.RFCDocente) faltantes.push('RFC');
                    if (!perfil.ClavePresupuestal) faltantes.push('Clave P.');
                    if (!perfil.TipoPlaza) faltantes.push('Plaza');
                    if (faltantes.length > 0) motivoBloqueo = `Faltan datos: ${faltantes.join(', ')}`;
                }
                
                else if (doc.NombreVisible.includes('Tutoría')) {
                    if (totalTutorados === 0) motivoBloqueo = "No tienes alumnos tutorados registrados.";
                }
                
                else if (doc.NombreVisible.includes('Estrategias')) {
                    if (datosGrupo.length === 0) motivoBloqueo = "Sin carga académica (Grupos).";
                    else {
                        const sinEstrategia = datosGrupo.some(g => !g.Estrategia || g.Estrategia === '');
                        if(sinEstrategia) motivoBloqueo = "Falta capturar Estrategias en tus materias.";
                    }
                }

                else if (doc.NombreVisible.includes('Recurso') || doc.NombreVisible.includes('Digital')) {
                    if (datosGrupo.length === 0) motivoBloqueo = "Debes impartir cátedra para generar recursos.";
                }

                else if (doc.RequiereValidacion === 'Administrativa' || doc.NombreVisible.includes('Créditos')) {
                    if (datosAdmin.length === 0) motivoBloqueo = "Sin actividad administrativa registrada.";
                    else if (!datosAdmin[0].NumDict) motivoBloqueo = "Falta No. Dictamen de la actividad.";
                }
                
                else if (doc.NombreVisible.includes('CVU')) {
                    if (!perfil.Registro) motivoBloqueo = "Falta: No. Registro CVU";
                }
                
                else if (doc.NombreVisible.includes('Exclusividad')) {
                    if (!perfil.TipoPlaza || !perfil.TipoPlaza.toUpperCase().includes('TIEMPO COMPLETO')) {
                        motivoBloqueo = "Solo para Tiempo Completo.";
                    }
                }
            }

            catalogo.push({
                id: doc.TipoID,
                nombre: doc.NombreVisible,
                ruta: doc.NombreArchivoPDF, 
                yaSolicitado: yaLoTiene, 
                bloqueadoPorPerfil: motivoBloqueo
            });
        });

        res.json(catalogo);
    } catch (err) { console.error("Error catálogo:", err); res.status(500).send("Error del servidor"); }
});

// ==================================================================
// 3. MIS DOCUMENTOS (FILTRADO CORRECTO PARA ADMIN)
// ==================================================================
app.get('/api/mis-documentos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { id, status, rol, cargo } = req.query;
        let query = "";
        
        if (rol === 'Administrativo') {
            if (status === 'Firmado') {
                // Admin > Completados: Solo lo que firmó SU departamento
                query = `SELECT DISTINCT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, (D.NombreDocente + ' ' + D.DocenteApePat) as Solicitante, Doc.RolFirmanteActual FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID INNER JOIN Firma F ON Doc.DocumentoID = F.DocumentoID WHERE Doc.StatusDoc IN ('Firmado', 'Completado') AND F.TipoFirmante = @cargo`;
            } else {
                // Admin > Pendientes
                query = `SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, (D.NombreDocente + ' ' + D.DocenteApePat) as Solicitante, Doc.RolFirmanteActual FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID WHERE Doc.StatusDoc = 'Pendiente' AND Doc.RolFirmanteActual = @cargo`;
            }
        } else {
            // Docente: Solo sus docs
            let queryStatus = (status === 'Firmado') ? "Doc.StatusDoc IN ('Firmado', 'Completado')" : "Doc.StatusDoc = @status";
            query = `SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID WHERE Exp.DocenteID = @id AND ${queryStatus}`;
        }

        const result = await pool.request().input('id', sql.Int, id).input('status', sql.NVarChar, status).input('cargo', sql.NVarChar, cargo).query(query);
        const documentos = result.recordset.map(d => ({
            DocumentoID: d.DocumentoID,
            TipoDoc: d.Solicitante ? `${d.TipoDoc} - ${d.Solicitante}` : d.TipoDoc,
            FechaDoc: d.FechaDoc,
            StatusDoc: d.StatusDoc,
            RolFirmanteActual: d.RolFirmanteActual 
        }));
        res.json(documentos);
    } catch (err) { res.status(500).send(err.message); }
});

// ==================================================================
// 4. SOLICITAR DOCUMENTO
// ==================================================================
app.post('/api/solicitar-documento', async (req, res) => {
    const { idDocente, nombreDocumento } = req.body;
    try {
        const pool = await poolPromise;
        let exp = await pool.request().input('id', idDocente).query("SELECT ExpedienteID FROM Expediente WHERE DocenteID = @id");
        let expedienteID = (exp.recordset.length > 0) ? exp.recordset[0].ExpedienteID : 
            (await pool.request().input('id', idDocente).query("INSERT INTO Expediente (StatusExp, DocenteID, FechaReg) OUTPUT INSERTED.ExpedienteID VALUES ('Activo', @id, GETDATE())")).recordset[0].ExpedienteID;

        const existe = await pool.request().input('exp', expedienteID).input('tipo', nombreDocumento).query("SELECT Count(*) as c FROM Documentos WHERE ExpedienteID = @exp AND TipoDoc = @tipo");
        if (existe.recordset[0].c > 0) return res.status(400).json({ success: false, message: "Ya has solicitado este documento." });

        const rutaInfo = await pool.request().input('nombre', sql.NVarChar, nombreDocumento).query("SELECT TOP 1 R.RolResponsable FROM RutaFirma R INNER JOIN TiposDocumento T ON R.TipoID = T.TipoID WHERE T.NombreVisible = @nombre AND R.Orden = 1");
        let rolResponsable = (rutaInfo.recordset.length > 0) ? rutaInfo.recordset[0].RolResponsable : 'Direccion';

        await pool.request().input('tipo', sql.NVarChar, nombreDocumento).input('fecha', sql.Date, new Date()).input('status', sql.NVarChar, 'Pendiente').input('expId', sql.Int, expedienteID).input('firmanteId', sql.Int, 1).input('rol', sql.NVarChar, rolResponsable)
            .query("INSERT INTO Documentos (TipoDoc, FechaDoc, StatusDoc, ExpedienteID, FirmanteActualID, RolFirmanteActual) VALUES (@tipo, @fecha, @status, @expId, @firmanteId, @rol)");

        res.json({ success: true, message: `Solicitud enviada a: ${rolResponsable}` });
    } catch (err) { console.error(err); res.status(500).json({ success: false, message: "Error SQL: " + err.message }); }
});

// ==================================================================
// 5. FIRMAR DOCUMENTO
// ==================================================================
app.post('/api/firmar-documento', async (req, res) => {
    const { idDocumento, firmaBase64, idFirmante, rolFirmanteActual } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request().input('fecha', sql.Date, new Date()).input('docId', sql.Int, idDocumento).input('tipo', sql.NVarChar, rolFirmanteActual || 'Direccion').input('firmanteId', sql.Int, idFirmante || 1).input('imagen', sql.NVarChar(sql.MAX), firmaBase64)
            .query("INSERT INTO Firma (FechaFirma, DocumentoID, TipoFirmante, FirmanteID, FirmaImagen) VALUES (@fecha, @docId, @tipo, @firmanteId, @imagen)");

        const docInfo = await pool.request().input('id', idDocumento).query("SELECT d.TipoDoc, t.TipoID FROM Documentos d JOIN TiposDocumento t ON d.TipoDoc = t.NombreVisible WHERE d.DocumentoID = @id");
        if(docInfo.recordset.length === 0) return res.status(404).json({message: "Documento no encontrado"});
        const { TipoID } = docInfo.recordset[0];

        const rutaActual = await pool.request().input('tipoId', TipoID).input('rol', rolFirmanteActual).query("SELECT Orden FROM RutaFirma WHERE TipoID = @tipoId AND RolResponsable = @rol");
        let ordenActual = (rutaActual.recordset.length > 0) ? rutaActual.recordset[0].Orden : 0;

        const siguientePaso = await pool.request().input('tipoId', TipoID).input('orden', ordenActual + 1).query("SELECT RolResponsable FROM RutaFirma WHERE TipoID = @tipoId AND Orden = @orden");

        if (siguientePaso.recordset.length > 0) {
            const siguienteRol = siguientePaso.recordset[0].RolResponsable;
            await pool.request().input('docId', idDocumento).input('rol', siguienteRol).query("UPDATE Documentos SET RolFirmanteActual = @rol WHERE DocumentoID = @docId");
            res.json({ success: true, message: `Firmado. Enviado a ${siguienteRol}.` });
        } else {
            await pool.request().input('docId', idDocumento).query("UPDATE Documentos SET StatusDoc = 'Firmado', RolFirmanteActual = NULL WHERE DocumentoID = @docId");
            res.json({ success: true, message: "Proceso finalizado." });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================================================================
// 6. GENERAR PDF (LÓGICA MAESTRA Y ESTAMPADO)
// ==================================================================
app.get('/api/generar-constancia', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nombreBuscado = req.query.nombre ? req.query.nombre.split(' - ')[0].trim() : ''; 
        const tipoDocumento = req.query.tipo;
        const idSolicitud = req.query.idDoc;

        // 1. OBTENER DATOS
        let data = null;
        if (idSolicitud && idSolicitud !== 'undefined' && idSolicitud !== '0') {
            const queryPorID = `SELECT D.* FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID WHERE Doc.DocumentoID = @docId`;
            const result = await pool.request().input('docId', sql.Int, idSolicitud).query(queryPorID);
            if (result.recordset.length > 0) data = result.recordset[0];
        }
        
        if (!data) {
            const queryPorNombre = `SELECT * FROM Docente WHERE NombreDocente LIKE '%' + @nombre + '%'`;
            const result = await pool.request().input('nombre', sql.NVarChar, nombreBuscado).query(queryPorNombre);
            if (result.recordset.length === 0) return res.status(404).send("Docente no encontrado.");
            data = result.recordset[0];
        }

        // 2. CARGAR PDF BASE
        const fileQuery = await pool.request().input('nombreDoc', tipoDocumento).query("SELECT NombreArchivoPDF FROM TiposDocumento WHERE NombreVisible = @nombreDoc");
        if (fileQuery.recordset.length === 0) return res.status(404).send(`Documento no configurado.`);
        
        let archivoPDF = fileQuery.recordset[0].NombreArchivoPDF;
        const rutaPDF = path.join(__dirname, '..', 'frontend', 'Recursos-img', archivoPDF); 
        
        if (!fs.existsSync(rutaPDF)) return res.status(404).send(`Archivo base ${archivoPDF} no encontrado.`);
        const fileBytes = fs.readFileSync(rutaPDF);

        // ✅ CORRECCIÓN 2: 'let' EN LUGAR DE 'const' PARA PERMITIR CAMBIO
        let pdfDoc = await PDFDocument.load(fileBytes);
        let form = pdfDoc.getForm();

        // 3. LLENADO ESPECÍFICO (ROUTER DE MÓDULOS)
        let nombreAdminFirma = ""; // Valor por defecto

        // --- CORRECCIÓN PARA CONSTANCIA LABORAL ---
        if (tipoDocumento === 'Constancia Laboral') {
            // Buscamos explícitamente al titular de RH
            const qRH = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM RH");
            if (qRH.recordset.length > 0) {
                const rh = qRH.recordset[0];
                nombreAdminFirma = `${rh.NombreTitular} ${rh.ApePatTitular} ${rh.ApeMatTitular}`.toUpperCase();
            }
            
            await llenarLaboral(form, data, nombreAdminFirma);
        }

        if (tipoDocumento === 'Constancia Laboral') {
            await llenarLaboral(form, data, nombreAdminFirma);
        } 
        else if (tipoDocumento.includes('CVU')) {
            await llenarCVU(form, data, nombreAdminFirma);
        }
        else if (tipoDocumento.includes('Tutoría')) {
            await llenarTutoria(form, data, pool);
        }
        else if (tipoDocumento.includes('Estrategias')) {
            // ✅ CORRECCIÓN 3: LE PASAMOS LOS BYTES CRUDOS PARA QUE GENERE MÚLTIPLES PÁGINAS
            // Y REEMPLAZAMOS EL DOCUMENTO ACTUAL CON EL NUEVO QUE TRAE MUCHAS PÁGINAS
            const docMultiPagina = await llenarEstrategias(fileBytes, data);
            if (docMultiPagina) {
                pdfDoc = docMultiPagina;
                // Nota: Al reemplazar pdfDoc, el 'form' anterior ya no sirve, pero ya acabamos de llenar.
                try { form = pdfDoc.getForm(); } catch(e) {} // Intentamos recuperar form por si acaso (para firma)
            }
        } else if (tipoDocumento.includes('Recurso') || tipoDocumento.includes('Digital')) {
            // Pasamos 'fileBytes' para que pueda crear varias páginas si hay varias materias
            const docMultiRecurso = await llenarRecurso(fileBytes, data);
            if (docMultiRecurso) {
                pdfDoc = docMultiRecurso;
                // Intentamos actualizar el form por si se requiere después
                try { form = pdfDoc.getForm(); } catch(e) {} 
            }
        }

        // 4. ESTAMPADO DE FIRMAS (SI YA ESTÁ FIRMADO)
// ==========================================================
        // D. ESTAMPADO DE FIRMAS (POR COORDENADAS FIJAS)
        // ==========================================================
        if (idSolicitud && idSolicitud !== '0') {
            const resFirma = await pool.request().input('docId', idSolicitud).query("SELECT FirmaImagen, TipoFirmante FROM Firma WHERE DocumentoID = @docId ORDER BY FechaFirma ASC");
            
            if (resFirma.recordset.length > 0) {
                const pages = pdfDoc.getPages();
                
                // Recorremos todas las páginas (vital para estrategias/recurso multipágina)
                for (const page of pages) {
                    for (const f of resFirma.recordset) {
                        if (f.FirmaImagen) {
                            try {
                                const pngImage = await pdfDoc.embedPng(f.FirmaImagen);
                                
                                // Dimensiones de la firma (ajustadas para que no se vean gigantes)
                                const dims = pngImage.scaleToFit(130, 50); 

                                // --- COORDENADAS MANUALES ---
                                // Altura Y: 125 es un buen estándar para quedar sobre la línea
                                // X: Calculado para centrar en las 3 columnas
                                let x = 0;
                                let y = 0; 

                                // Lógica para ESTRATEGIAS y RECURSO (3 Columnas)
                                if (tipoDocumento.includes('Estrategias') || tipoDocumento.includes('Recurso') || tipoDocumento.includes('Digital')) {
                                    if (f.TipoFirmante === 'JefaDepartamento') x = 260, y=330;        // Columna Izquierda
                                    else if (f.TipoFirmante === 'PresidenteAcademia') x = 140, y=260; // Columna Central
                                    else if (f.TipoFirmante === 'Subdireccion') x = 420, y=255;       // Columna Derecha
                                }
                                // Lógica para TUTORÍA (2 Columnas)
                                else if (tipoDocumento.includes('Tutoría')) {
                                    if (f.TipoFirmante === 'DesarrolloAcademico') x = 80, y=260; // Izquierda
                                    else if (f.TipoFirmante === 'Subdireccion') x = 405, y=260;  // Derecha
                                }
                                // Lógica para LABORAL / CVU (1 Columna Central)
                                else if (tipoDocumento.includes('Laboral'))  {
                                    x = 100, y=280; // Centro aproximado
                                } else{
                                    x = 100, y=300; // Centro aproximado
                                }

                                // Si tenemos coordenada X, estampamos
                                if (x > 0) {
                                    // Ajuste fino para centrar la imagen respecto al punto X
                                    const xCentrado = x + (100 - dims.width) / 2; // Asumiendo columna de ancho 100
                                    
                                    page.drawImage(pngImage, {
                                        x: xCentrado, // Usamos la coordenada ajustada
                                        y: y,
                                        width: dims.width,
                                        height: dims.height
                                    });
                                }

                            } catch (e) { 
                                console.error("❌ Error al estampar firma:", e); 
                            }
                        }
                    }
                }
            }
        }

        // Aplanar el formulario para que no sea editable
        try { if(form) form.flatten(); } catch(e) {}
        
        const pdfBytesFinal = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytesFinal));

    } catch (err) { console.error(err); res.status(500).send("Error: " + err.message); }
});

// ==================================================================
// 7. GUARDAR FIRMA DE PERFIL
// ==================================================================
app.post('/api/guardar-firma-perfil', async (req, res) => {
    const { idUsuario, rol, firmaBase64 } = req.body;
    const tablaMap = { 'Direccion': {table:'Direccion', idCol:'DirectorID'}, 'RH': {table:'RH', idCol:'RHID'}, 'Subdireccion': {table:'Subdireccion', idCol:'SubdireccionID'}, 'ServiciosEscolares': {table:'ServiciosEscolares', idCol:'ServEscID'}, 'JefaDepartamento': {table:'JefaDepartamento', idCol:'JefaDepartamentoID'}, 'DesarrolloAcademico': {table:'DesarrolloAcademico', idCol:'DesaAcadID'}, 'PresidenteAcademia': {table:'PresidenteAcademia', idCol:'PresidenteID'}, 'ResponsableArea': {table:'ResponsableArea', idCol:'ResponsableID'} };
    const configTabla = tablaMap[rol];
    if (!configTabla) return res.status(400).json({ success: false, message: "Rol inválido." });

    try {
        const pool = await poolPromise;
        await pool.request().input('firma', sql.NVarChar(sql.MAX), firmaBase64).input('id', sql.Int, idUsuario).query(`UPDATE ${configTabla.table} SET FirmaDigital = @firma WHERE ${configTabla.idCol} = @id`);
        res.json({ success: true, message: "Firma guardada." });
    } catch (err) { res.status(500).json({ success: false, message: "Error BD." }); }
});

// ==================================================================
// 8. SISTEMA DE REPORTES Y QUEJAS (NUEVO)
// ==================================================================

// A. CREAR REPORTE (Desde el botón rojo del Docente)
app.post('/api/reportar-error', async (req, res) => {
    const { idDocente, nombreDocumento, mensaje } = req.body;
    try {
        const pool = await poolPromise;
        // Buscamos quién es el responsable de este documento para mandarle la queja a él
        const rutaQ = await pool.request().input('nombre', sql.NVarChar, nombreDocumento).query(`SELECT TOP 1 R.RolResponsable FROM RutaFirma R INNER JOIN TiposDocumento T ON R.TipoID = T.TipoID WHERE T.NombreVisible = @nombre ORDER BY R.Orden ASC`);
        
        let depto = 'Direccion'; // Default
        if (rutaQ.recordset.length > 0) depto = rutaQ.recordset[0].RolResponsable;

        await pool.request().input('id', idDocente).input('doc', nombreDocumento).input('depto', depto).input('msg', mensaje)
            .query("INSERT INTO ReportesError (DocenteID, TipoDocumento, DepartamentoDestino, MensajeError) VALUES (@id, @doc, @depto, @msg)");

        res.json({ success: true, message: `Reporte enviado a ${depto}.` });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// B. VER MIS REPORTES (Para el Docente)
app.get('/api/mis-reportes', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.query.id).query("SELECT * FROM ReportesError WHERE DocenteID = @id ORDER BY FechaReporte DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// C. VER REPORTES DEL DEPARTAMENTO (Para el Admin)
app.get('/api/reportes-departamento', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('depto', sql.NVarChar, req.query.cargo).query(`SELECT R.*, (D.NombreDocente + ' ' + D.DocenteApePat) as NombreDocente FROM ReportesError R INNER JOIN Docente D ON R.DocenteID = D.DocenteID WHERE R.DepartamentoDestino = @depto ORDER BY R.Estatus DESC, R.FechaReporte DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// D. ATENDER REPORTE (Admin responde)
app.post('/api/atender-reporte', async (req, res) => {
    const { idReporte, respuesta } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, idReporte).input('resp', sql.NVarChar, respuesta).query("UPDATE ReportesError SET Estatus = 'Corregido', RespuestaAdmin = @resp, FechaRespuesta = GETDATE() WHERE ReporteID = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = 3000;
app.listen(PORT, () => { console.log(`Servidor Backend corriendo en http://localhost:${PORT}`); });