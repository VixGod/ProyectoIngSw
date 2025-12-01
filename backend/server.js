const express = require('express');
const cors = require('cors');
const { sql, poolPromise } = require('./db'); 
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// --- IMPORTACIÓN DE MÓDULOS DE DOCUMENTOS (PDFs estáticos) ---
const { llenarLaboral } = require('./documentos/docLaboral'); 
const { llenarCVU } = require('./documentos/docCVU'); 
const { llenarTutoria } = require('./documentos/docTutoria'); 
const { llenarEstrategias } = require('./documentos/docEstrategias');
const { llenarRecurso } = require('./documentos/docRecurso');
const { llenarCreditos } = require('./documentos/docCreditos');
const { llenarAsignaturas } = require('./documentos/docAsignaturas');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// ==================================================================
// 🔌 CONEXIÓN DE TUS NUEVOS DOCUMENTOS
// ==================================================================
require('./documentos/docExencion')(app);
require('./documentos/docHorarios')(app);

// ==================================================================
// HELPER GLOBAL
// ==================================================================
function formatearFecha(fecha) {
    if (!fecha) return "Fecha no registrada";
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ==================================================================
// 1. RUTA DE LOGIN
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
            UNION ALL SELECT ConaicID, NombreTitular, ApePatTitular, ApeMatTitular, 'conaic@delta.edu', RFCTitular, 'Administrativo', 'PresidenteCONAIC', FirmaDigital FROM PresidenteCONAIC WHERE RFCTitular = @user AND TitularPassword = @pass
            UNION ALL SELECT ResponsableID, NombreTitular, ApePatTitular, ApeMatTitular, 'area@delta.edu', RFCTitular, 'Administrativo', 'ResponsableArea', FirmaDigital FROM ResponsableArea WHERE RFCTitular = @user AND TitularPassword = @pass
        `;

        const result = await pool.request().input('user', sql.NVarChar, rfc).input('pass', sql.NVarChar, password).query(queryUniversal);

        if (result.recordset.length > 0) {
            const u = result.recordset[0];
            const usuarioFrontend = {
                DocenteID: u.ID,
                NombreDocente: u.Nombre,
                DocenteApePat: u.ApePat,
                DocenteApeMat: u.ApeMat,
                DocenteCorreo: u.Correo,
                DirectorNombre: (u.Rol === 'Administrativo') ? u.Nombre : null,
                Rol: u.Rol, 
                Cargo: u.Cargo,
                FirmaDigital: u.FirmaDigital
            };
            return res.json({ success: true, message: `Login exitoso como ${usuarioFrontend.Cargo}`, docente: usuarioFrontend });
        }
        res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    } catch (error) { console.error("Error Login:", error); res.status(500).json({ success: false, message: 'Error del servidor.' }); }
});

// ==================================================================
// 2. CATÁLOGO INTELIGENTE
// ==================================================================
app.get('/api/catalogo-inteligente', async (req, res) => {
    try {
        const pool = await poolPromise;
        const idDocente = req.query.id; 

        // 1. DATOS DEL DOCENTE
        const perfilQuery = await pool.request().input('id', idDocente).query("SELECT * FROM Docente WHERE DocenteID = @id");
        if (perfilQuery.recordset.length === 0) return res.json([]);
        const perfil = perfilQuery.recordset[0];

        // 2. LISTA DE DOCUMENTOS ESTÁNDAR
        const tiposDocs = await pool.request().query("SELECT * FROM TiposDocumento");
        const listaTodos = tiposDocs.recordset;

        // 3. VERIFICACIONES DE ROL
        const qTutor = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM Tutorados WHERE DocenteID = @id");
        const qGrupo = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM Grupo WHERE DocenteID = @id");
        const qAdmin = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM ActividadAdministrativa WHERE DocenteID = @id");

        const esTutor = qTutor.recordset[0].c > 0;
        const tieneGrupos = qGrupo.recordset[0].c > 0;
        const tieneAdmin = qAdmin.recordset[0].c > 0;

        let catalogo = [];

        // --- A. PROCESAR DOCUMENTOS NORMALES ---
        listaTodos.forEach(doc => {
            let motivoBloqueo = null;

            if (doc.RequiereValidacion === 'Tutorados' && !esTutor) motivoBloqueo = "Requiere ser Tutor";
            else if (doc.RequiereValidacion === 'Grupo' && !tieneGrupos) motivoBloqueo = "Requiere Grupos";
            else if (doc.RequiereValidacion === 'Administrativa' && !tieneAdmin) motivoBloqueo = "Requiere Act. Admin.";
            
            else if (doc.NombreVisible === 'Constancia Laboral') {
                let faltantes = [];
                if (!perfil.RFCDocente) faltantes.push('RFC');
                if (!perfil.FechaIngreso) faltantes.push('Fecha Ingreso');
                if (!perfil.ClavePresupuestal) faltantes.push('Clave Presup.');
                if (!perfil.CategoriaActual) faltantes.push('Categoría');
                if (!perfil.TipoPlaza) faltantes.push('Plaza');
                if (faltantes.length > 0) motivoBloqueo = `Faltan datos: ${faltantes.join(', ')}`;
            }

            catalogo.push({
                id: doc.TipoID,
                nombre: doc.NombreVisible,
                tipo: 'solicitud',
                bloqueadoPorPerfil: motivoBloqueo
            });
        });

        // --- B. PROCESAR EXÁMENES (INYECCIÓN DE EXENCIONES) ---
        const qExamenes = await pool.request().input('id', idDocente).query(`
            SELECT ExamenID, AlumnoNombre, FechaExamen 
            FROM ExamenProfesional 
            WHERE PresidenteID = @id OR SecretarioID = @id OR VocalID = @id
            ORDER BY FechaExamen DESC
        `);

        qExamenes.recordset.forEach(examen => {
            catalogo.push({
                id: examen.ExamenID,
                nombre: `Constancia de Exención - ${examen.AlumnoNombre}`,
                tipo: 'descarga_directa',
                bloqueadoPorPerfil: null
            });
        });

        res.json(catalogo);

    } catch (err) { console.error("Error catálogo:", err); res.status(500).send("Error del servidor"); }
});

// ==================================================================
// 3. MIS DOCUMENTOS (MODIFICADO: INCLUYE EXÁMENES)
// ==================================================================
app.get('/api/mis-documentos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { id, status, rol, cargo } = req.query;
        let query = "";
        
        // A. OBTENER DOCUMENTOS ESTÁNDAR
        if (rol === 'Administrativo') {
            if (status === 'Firmado') {
                query = `SELECT DISTINCT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, (D.NombreDocente + ' ' + D.DocenteApePat) as Solicitante, Doc.RolFirmanteActual FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID INNER JOIN Firma F ON Doc.DocumentoID = F.DocumentoID WHERE Doc.StatusDoc IN ('Firmado', 'Completado') AND F.TipoFirmante = @cargo`;
            } else {
                query = `SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, (D.NombreDocente + ' ' + D.DocenteApePat) as Solicitante, Doc.RolFirmanteActual FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID WHERE Doc.StatusDoc = 'Pendiente' AND Doc.RolFirmanteActual = @cargo`;
            }
        } else {
            // Docente
            let queryStatus = (status === 'Firmado') ? "Doc.StatusDoc IN ('Firmado', 'Completado')" : "Doc.StatusDoc = @status";
            query = `SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID WHERE Exp.DocenteID = @id AND ${queryStatus}`;
        }

        const result = await pool.request().input('id', sql.Int, id).input('status', sql.NVarChar, status).input('cargo', sql.NVarChar, cargo).query(query);
        
        let documentos = result.recordset.map(d => ({
            DocumentoID: d.DocumentoID,
            TipoDoc: d.Solicitante ? `${d.TipoDoc} - ${d.Solicitante}` : d.TipoDoc,
            FechaDoc: d.FechaDoc,
            StatusDoc: d.StatusDoc,
            RolFirmanteActual: d.RolFirmanteActual,
            EsExamen: false // Documento normal
        }));

        // B. SI PIDEN "FIRMADOS", AGREGAMOS LOS EXÁMENES AUTOMÁTICAMENTE
        if (status === 'Firmado' && rol !== 'Administrativo') {
            const qExamenes = await pool.request().input('id', sql.Int, id).query(`
                SELECT ExamenID, AlumnoNombre, FechaExamen 
                FROM ExamenProfesional 
                WHERE PresidenteID = @id OR SecretarioID = @id OR VocalID = @id
                ORDER BY FechaExamen DESC
            `);

            const examenes = qExamenes.recordset.map(e => ({
                DocumentoID: e.ExamenID,
                TipoDoc: `Constancia de Exención - ${e.AlumnoNombre}`,
                FechaDoc: e.FechaExamen,
                StatusDoc: 'Completado',
                RolFirmanteActual: null,
                EsExamen: true // ¡Importante para el frontend!
            }));

            // Fusionar listas
            documentos = [...documentos, ...examenes];
        }

        res.json(documentos);

    } catch (err) { 
        console.error("Error Mis Docs:", err);
        res.status(500).send(err.message); 
    }
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
// 6. GENERAR PDF (LÓGICA MAESTRA)
// ==================================================================
app.get('/api/generar-constancia', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nombreBuscado = req.query.nombre ? req.query.nombre.split(' - ')[0].trim() : ''; 
        const tipoDocumento = req.query.tipo;
        const idSolicitud = req.query.idDoc;

        // ==========================================
        // 1. OBTENER DATOS DEL USUARIO (Igual que antes)
        // ==========================================
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

        let pdfDoc = null;
        let form = null;

        // ==========================================
        // 2. SELECCIÓN DE ESTRATEGIA DE GENERACIÓN
        // ==========================================
        
        // CASO A: DOCUMENTOS GENERADOS DESDE CERO (SIN PLANTILLA)
        if (tipoDocumento.includes('Créditos') || tipoDocumento.includes('Monitor')) {
            // Llamamos a tu nueva función. Pasamos null en el primer parametro porque no hay plantilla base
            // Pasamos 'pool' porque docCreditos hace una consulta interna
            pdfDoc = await llenarCreditos(null, data, pool);
        }
        
        // CASO B: DOCUMENTOS BASADOS EN PLANTILLA (Lógica anterior)
        else {
            const fileQuery = await pool.request().input('nombreDoc', sql.NVarChar, tipoDocumento).query("SELECT NombreArchivoPDF FROM TiposDocumento WHERE NombreVisible = @nombreDoc");
            
            if (fileQuery.recordset.length === 0) return res.status(404).send(`Documento no configurado en BD.`);
            
            let archivoPDF = fileQuery.recordset[0].NombreArchivoPDF;
            const rutaPDF = path.join(__dirname, '..', 'frontend', 'Recursos-img', archivoPDF); 
            
            if (!fs.existsSync(rutaPDF)) return res.status(404).send(`Archivo base ${archivoPDF} no encontrado.`);
            
            const fileBytes = fs.readFileSync(rutaPDF);
            pdfDoc = await PDFDocument.load(fileBytes);
            
            if (tipoDocumento.includes('Asignaturas')) {
                // Pasamos 'pool' porque tu modulo hace consultas propias
                const docLleno = await llenarAsignaturas(fileBytes, data.DocenteID, pool);
                if (docLleno) pdfDoc = docLleno;
            }
            
            // Intentamos obtener el form (solo existe en plantillas editables)
            try { form = pdfDoc.getForm(); } catch(e) {}

            // Llenado específico de plantillas
            if (tipoDocumento === 'Constancia Laboral') {
                let nombreAdminFirma = ""; 
                const qRH = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM RH");
                if (qRH.recordset.length > 0) {
                    const rh = qRH.recordset[0];
                    nombreAdminFirma = `${rh.NombreTitular} ${rh.ApePatTitular} ${rh.ApeMatTitular}`.toUpperCase();
                }
                await llenarLaboral(form, data, nombreAdminFirma);
            } 
            else if (tipoDocumento.includes('CVU')) await llenarCVU(form, data);
            else if (tipoDocumento.includes('Tutoría')) await llenarTutoria(form, data, pool);
            else if (tipoDocumento.includes('Estrategias')) {
                const docMulti = await llenarEstrategias(fileBytes, data);
                if (docMulti) pdfDoc = docMulti;
            } 
            else if (tipoDocumento.includes('Recurso')) {
                const docMulti = await llenarRecurso(fileBytes, data);
                if (docMulti) pdfDoc = docMulti;
            }

            // Aplanamos el formulario si existe
            try { if(form) form.flatten(); } catch(e) {}
        }

        // ==========================================
        // 3. ESTAMPADO DE FIRMAS (Común para todos)
        // ==========================================
        if (idSolicitud && idSolicitud !== '0') {
            const resFirma = await pool.request().input('docId', sql.Int, idSolicitud).query("SELECT FirmaImagen, TipoFirmante FROM Firma WHERE DocumentoID = @docId ORDER BY FechaFirma ASC");
            
            if (resFirma.recordset.length > 0) {
                const pages = pdfDoc.getPages();
                // Nota: docCreditos tiene 1 sola página, pero el loop funciona igual
                for (const page of pages) {
                    for (const f of resFirma.recordset) {
                        if (f.FirmaImagen) {
                            try {
                                const pngImage = await pdfDoc.embedPng(f.FirmaImagen);
                                const dims = pngImage.scaleToFit(130, 50); 
                                let x = 0, y = 0; 

                                // COORDENADAS PARA CRÉDITOS
                                if (tipoDocumento.includes('Créditos') || tipoDocumento.includes('Monitor')) {
                                    if (f.TipoFirmante === 'ResponsableArea') { x = 100; y = 140; } // Izquierda (Jefe Area)
                                    else if (f.TipoFirmante === 'Subdireccion') { x = 400; y = 140; } // Derecha
                                }
                                // COORDENADAS EXISTENTES
                                else if (tipoDocumento.includes('Estrategias') || tipoDocumento.includes('Recurso')) {
                                    if (f.TipoFirmante === 'JefaDepartamento') { x = 260; y=330; }
                                    else if (f.TipoFirmante === 'PresidenteAcademia') { x = 140; y=260; }
                                    else if (f.TipoFirmante === 'Subdireccion') { x = 420; y=255; }
                                }
                                else if (tipoDocumento.includes('Tutoría')) {
                                    if (f.TipoFirmante === 'DesarrolloAcademico') { x = 80; y=260; }
                                    else if (f.TipoFirmante === 'Subdireccion') { x = 405; y=260; }
                                }
                                else if (tipoDocumento.includes('Asignaturas')) {
                                    if (f.TipoFirmante === 'Docente') { x = 70; y = 90; }     // Izquierda
                                    else if (f.TipoFirmante === 'Direccion') { x = 620; y = 90; } // Derecha (Director)
                                }
                                else if (tipoDocumento.includes('Laboral')) { x = 100; y=280; } 
                                else { x = 100; y=300; } // Default

                                if (x > 0) {
                                    // Ajuste para centrar firma sobre la línea
                                    const xCentrado = x + (100 - dims.width) / 2;
                                    page.drawImage(pngImage, { x: xCentrado, y: y, width: dims.width, height: dims.height });
                                }
                            } catch (e) { console.error("❌ Error al estampar firma:", e); }
                        }
                    }
                }
            }
        }
        
        const pdfBytesFinal = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytesFinal));

    } catch (err) { console.error(err); res.status(500).send("Error: " + err.message); }
});
// ==================================================================
// 7. GUARDAR FIRMA DE PERFIL (ADMIN)
// ==================================================================
app.post('/api/guardar-firma-perfil', async (req, res) => {
    const { idUsuario, rol, firmaBase64 } = req.body;
    const tablaMap = { 'Direccion': {table:'Direccion', idCol:'DirectorID'}, 'RH': {table:'RH', idCol:'RHID'}, 'Subdireccion': {table:'Subdireccion', idCol:'SubdireccionID'}, 'ServiciosEscolares': {table:'ServiciosEscolares', idCol:'ServEscID'}, 'JefaDepartamento': {table:'JefaDepartamento', idCol:'JefaDepartamentoID'}, 'DesarrolloAcademico': {table:'DesarrolloAcademico', idCol:'DesaAcadID'}, 'PresidenteAcademia': {table:'PresidenteAcademia', idCol:'PresidenteID'}, 'ResponsableArea': {table:'ResponsableArea', idCol:'ResponsableID'} };
    const configTabla = tablaMap[rol];
    if (!configTabla) return res.status(400).json({ success: false, message: "Rol no administrativo." });

    try {
        const pool = await poolPromise;
        await pool.request().input('firma', sql.NVarChar(sql.MAX), firmaBase64).input('id', sql.Int, idUsuario).query(`UPDATE ${configTabla.table} SET FirmaDigital = @firma WHERE ${configTabla.idCol} = @id`);
        res.json({ success: true, message: "Firma guardada." });
    } catch (err) { res.status(500).json({ success: false, message: "Error BD." }); }
});

const PORT = 3000;
app.listen(PORT, () => { console.log(`Servidor Backend corriendo en http://localhost:${PORT}`); });