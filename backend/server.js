const express = require('express');
const cors = require('cors');
const { sql, poolPromise } = require('./db'); 
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// --- IMPORTACIÓN DE MÓDULOS DE DOCUMENTOS ---
const { llenarLaboral } = require('./documentos/docLaboral'); 
const { llenarCVU } = require('./documentos/docCVU'); // <--- NUEVO IMPORT

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// Helper Global de Fechas (Para lo que se use fuera de los módulos)
function formatearFecha(fecha) {
    if (!fecha) return "Fecha no registrada";
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ==================================================================
// 1. RUTA DE LOGIN (BÚSQUEDA EN LAS 9 TABLAS + FIRMA)
// ==================================================================
app.post('/login', async (req, res) => {
    const { rfc, password } = req.body;
    if (!rfc || !password) return res.status(400).json({ success: false, message: 'Faltan datos.' });

    try {
        const pool = await poolPromise;
        
        // Consulta Universal (Incluye FirmaDigital)
        const queryUniversal = `
            /* 1. DOCENTE */
            SELECT DocenteID as ID, NombreDocente as Nombre, DocenteApePat as ApePat, DocenteApeMat as ApeMat, DocenteCorreo as Correo, RFCDocente as Usuario, 'Docente' as Rol, 'Docente' as Cargo, NULL as FirmaDigital
            FROM Docente WHERE RFCDocente = @user AND DocentePassword = @pass
            
            UNION ALL
            
            /* 2. DIRECCIÓN */
            SELECT DirectorID, DirectorNombre, DirectorApePat, DirectorApeMat, 'director@delta.edu', DirectorNombre, 'Administrativo', 'Direccion', FirmaDigital
            FROM Direccion WHERE DirectorNombre = @user AND DirectorPassword = @pass
            
            UNION ALL
            
            /* 3. SUBDIRECCIÓN */
            SELECT SubdireccionID, NombreTitular, ApePatTitular, ApeMatTitular, 'subdireccion@delta.edu', RFCTitular, 'Administrativo', 'Subdireccion', FirmaDigital
            FROM Subdireccion WHERE RFCTitular = @user AND SubdirectoraPassword = @pass

            UNION ALL
            
            /* 4. RH */
            SELECT RHID, NombreTitular, ApePatTitular, ApeMatTitular, 'rh@delta.edu', RFCTitular, 'Administrativo', 'RH', FirmaDigital
            FROM RH WHERE RFCTitular = @user AND TitularPassword = @pass

            UNION ALL
            
            /* 5. SERVICIOS ESCOLARES */
            SELECT ServEscID, NombreTitular, ApePatTitular, ApeMatTitular, 'escolares@delta.edu', RFCTitular, 'Administrativo', 'ServiciosEscolares', FirmaDigital
            FROM ServiciosEscolares WHERE RFCTitular = @user AND TitularPassword = @pass

            UNION ALL
            
            /* 6. DESARROLLO ACADÉMICO */
            SELECT DesaAcadID, NombreTitular, ApePatTitular, ApeMatTitular, 'desarrollo@delta.edu', RFCTitular, 'Administrativo', 'DesarrolloAcademico', FirmaDigital
            FROM DesarrolloAcademico WHERE RFCTitular = @user AND TitularPassword = @pass

            UNION ALL

            /* 7. JEFA DEPARTAMENTO */
            SELECT JefaDepartamentoID, NombreTitular, ApePatTitular, ApeMatTitular, 'jefatura@delta.edu', RFCTitular, 'Administrativo', 'JefaDepartamento', FirmaDigital
            FROM JefaDepartamento WHERE RFCTitular = @user AND TitularPassword = @pass

            UNION ALL

            /* 8. PRESIDENTE ACADEMIA */
            SELECT PresidenteID, PresidenteNombre, PresidenteApePat, PresidenteApeMat, 'academia@delta.edu', RFCPresidente, 'Administrativo', 'PresidenteAcademia', FirmaDigital
            FROM PresidenteAcademia WHERE RFCPresidente = @user AND PresidentePassword = @pass

            UNION ALL

            /* 9. RESPONSABLE DE ÁREA */
            SELECT ResponsableID, NombreTitular, ApePatTitular, ApeMatTitular, 'area@delta.edu', RFCTitular, 'Administrativo', 'ResponsableArea', FirmaDigital
            FROM ResponsableArea WHERE RFCTitular = @user AND TitularPassword = @pass
        `;

        const result = await pool.request()
            .input('user', sql.NVarChar, rfc)
            .input('pass', sql.NVarChar, password)
            .query(queryUniversal);

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
                FirmaDigital: u.FirmaDigital // Enviamos la firma al frontend
            };

            return res.json({ 
                success: true, 
                message: `Login exitoso como ${usuarioFrontend.Cargo}`, 
                docente: usuarioFrontend 
            });
        }
        
        res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });

    } catch (error) {
        console.error("Error Login:", error);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
});

// ==================================================================
// 2. CATÁLOGO INTELIGENTE (MODIFICADO: Muestra todo, bloquea si falta)
// ==================================================================
app.get('/api/catalogo-inteligente', async (req, res) => {
    try {
        const pool = await poolPromise;
        const idDocente = req.query.id; 

        // 1. DATOS DEL DOCENTE
        const perfilQuery = await pool.request().input('id', idDocente).query("SELECT * FROM Docente WHERE DocenteID = @id");
        if (perfilQuery.recordset.length === 0) return res.json([]); // Si no existe el usuario, array vacío
        const perfil = perfilQuery.recordset[0];

        // 2. LISTA DE DOCUMENTOS (SIEMPRE TRAEMOS TODOS)
        const tiposDocs = await pool.request().query("SELECT * FROM TiposDocumento");
        const listaTodos = tiposDocs.recordset;

        // 3. VERIFICACIONES DE ROL (Booleans)
        const qTutor = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM Tutorados WHERE DocenteID = @id");
        const qGrupo = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM Grupo WHERE DocenteID = @id");
        const qAdmin = await pool.request().input('id', idDocente).query("SELECT COUNT(*) as c FROM ActividadAdministrativa WHERE DocenteID = @id");

        const esTutor = qTutor.recordset[0].c > 0;
        const tieneGrupos = qGrupo.recordset[0].c > 0;
        const tieneAdmin = qAdmin.recordset[0].c > 0;

        // 4. CONSTRUIR RESPUESTA
        let catalogo = [];

        listaTodos.forEach(doc => {
            let motivoBloqueo = null; // Si es null, está DISPONIBLE. Si tiene texto, está BLOQUEADO.

            // --- A. BLOQUEO POR ROL ---
            // En lugar de ocultar, bloqueamos el botón y decimos por qué.
            if (doc.RequiereValidacion === 'Tutorados' && !esTutor) {
                motivoBloqueo = "Requiere ser Tutor";
            }
            else if (doc.RequiereValidacion === 'Grupo' && !tieneGrupos) {
                motivoBloqueo = "Requiere Grupos";
            }
            else if (doc.RequiereValidacion === 'Administrativa' && !tieneAdmin) {
                motivoBloqueo = "Requiere Act. Admin.";
            }

            // --- B. BLOQUEO POR DATOS FALTANTES (Constancia Laboral) ---
            // Solo revisamos esto si no estaba ya bloqueado por rol
            else if (doc.NombreVisible === 'Constancia Laboral') {
                let faltantes = [];
                if (!perfil.RFCDocente) faltantes.push('RFC');
                if (!perfil.FechaIngreso) faltantes.push('Fecha Ingreso');
                if (!perfil.ClavePresupuestal) faltantes.push('Clave Presup.');
                if (!perfil.CategoriaActual) faltantes.push('Categoría');
                if (!perfil.TipoPlaza) faltantes.push('Plaza'); // Importante para tu PDF
                
                if (faltantes.length > 0) {
                    motivoBloqueo = `Faltan datos: ${faltantes.join(', ')}`;
                }
            }

            // SIEMPRE AGREGAMOS EL DOCUMENTO A LA LISTA
            // Nunca usamos "continue" o "return" para saltar.
            catalogo.push({
                id: doc.TipoID,
                nombre: doc.NombreVisible,
                ruta: doc.NombreArchivoPDF, 
                yaSolicitado: false, // Simplificado por ahora para asegurar que salga
                bloqueadoPorPerfil: motivoBloqueo // Aquí va el mensaje de error o null
            });
        });

        console.log(`✅ Enviando ${catalogo.length} documentos al Frontend.`);
        res.json(catalogo);

    } catch (err) {
        console.error("❌ Error grave en catálogo:", err);
        res.status(500).send("Error del servidor");
    }
});

// ==================================================================
// 3. MIS DOCUMENTOS (CORREGIDO: Admin ve Pendientes y Firmados)
// ==================================================================
app.get('/api/mis-documentos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const idUsuario = req.query.id;
        const status = req.query.status; 
        const rol = req.query.rol;
        const cargo = req.query.cargo; // RECIBIMOS EL CARGO (ej: 'RH', 'Subdireccion')
        
        let query = "";
        
        if (rol === 'Administrativo') {
            // LÓGICA DE ADMINISTRADOR
            if (status === 'Firmado') {
                // Admin > Completados
                query = `
                    SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, D.NombreDocente as Solicitante, Doc.RolFirmanteActual
                    FROM Documentos Doc
                    INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID
                    INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID
                    WHERE Doc.StatusDoc IN ('Firmado', 'Completado')
                `;
            } else {
                // Admin > Pendientes (FILTRO ESTRICTO)
                query = `
                    SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc, D.NombreDocente as Solicitante, Doc.RolFirmanteActual
                    FROM Documentos Doc
                    INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID
                    INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID
                    WHERE Doc.StatusDoc = 'Pendiente' AND Doc.RolFirmanteActual = @cargo
                `;
            }
        } else {
            // LÓGICA DE DOCENTE
            let queryStatus = "Doc.StatusDoc = @status";
            if(status === 'Firmado') queryStatus = "Doc.StatusDoc IN ('Firmado', 'Completado')";
            
            query = `
                SELECT Doc.DocumentoID, Doc.TipoDoc, Doc.FechaDoc, Doc.StatusDoc
                FROM Documentos Doc
                INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID
                WHERE Exp.DocenteID = @id AND ${queryStatus}
            `;
        }

        const result = await pool.request()
            .input('id', sql.Int, idUsuario)
            .input('status', sql.NVarChar, status)
            .input('cargo', sql.NVarChar, cargo) // Inyectamos el cargo para el filtro
            .query(query);
        
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
        let expedienteID;
        if (exp.recordset.length === 0) {
            const nuevo = await pool.request().input('id', idDocente).query("INSERT INTO Expediente (StatusExp, DocenteID, FechaReg) OUTPUT INSERTED.ExpedienteID VALUES ('Activo', @id, GETDATE())");
            expedienteID = nuevo.recordset[0].ExpedienteID;
        } else { expedienteID = exp.recordset[0].ExpedienteID; }

        const existe = await pool.request().input('exp', expedienteID).input('tipo', nombreDocumento).query("SELECT Count(*) as c FROM Documentos WHERE ExpedienteID = @exp AND TipoDoc = @tipo");
        if (existe.recordset[0].c > 0) return res.status(400).json({ success: false, message: "Ya has solicitado este documento." });

        const rutaInfo = await pool.request().input('nombre', sql.NVarChar, nombreDocumento).query("SELECT TOP 1 R.RolResponsable FROM RutaFirma R INNER JOIN TiposDocumento T ON R.TipoID = T.TipoID WHERE T.NombreVisible = @nombre AND R.Orden = 1");
        let rolResponsable = 'Direccion';
        if (rutaInfo.recordset.length > 0) rolResponsable = rutaInfo.recordset[0].RolResponsable;

        await pool.request()
            .input('tipo', sql.NVarChar, nombreDocumento).input('fecha', sql.Date, new Date()).input('status', sql.NVarChar, 'Pendiente')
            .input('expId', sql.Int, expedienteID).input('firmanteId', sql.Int, 1).input('rol', sql.NVarChar, rolResponsable)
            .query("INSERT INTO Documentos (TipoDoc, FechaDoc, StatusDoc, ExpedienteID, FirmanteActualID, RolFirmanteActual) VALUES (@tipo, @fecha, @status, @expId, @firmanteId, @rol)");

        res.json({ success: true, message: `Solicitud enviada a: ${rolResponsable}` });
    } catch (err) { res.status(500).json({ success: false, message: "Error en BD al solicitar." }); }
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
        let ordenActual = rutaActual.recordset.length > 0 ? rutaActual.recordset[0].Orden : 0;

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
// 6. GENERAR PDF (LÓGICA MAESTRA MEJORADA)
// ==================================================================
app.get('/api/generar-constancia', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nombreBuscado = req.query.nombre ? req.query.nombre.split(' - ')[0].trim() : ''; 
        const tipoDocumento = req.query.tipo;
        const idSolicitud = req.query.idDoc; // Este es la clave

        let data = null;

        // --- CAMBIO CLAVE: BUSCAR POR ID DE DOCUMENTO (MÁS SEGURO) ---
        if (idSolicitud && idSolicitud !== 'undefined') {
            // Si tenemos el ID del documento, buscamos al docente dueño de ese documento
            const queryPorID = `
                SELECT D.*, I.NombreInstitucion, C.NombreCiudad, E.NombreEstado 
                FROM Documentos Doc
                INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID
                INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID
                LEFT JOIN Institucion I ON D.InstitucionID = I.InstitucionID 
                LEFT JOIN Ciudad C ON I.CiudadID = C.CiudadID 
                LEFT JOIN Estado E ON C.EstadoID = E.EstadoID
                WHERE Doc.DocumentoID = @docId
            `;
            const result = await pool.request().input('docId', sql.Int, idSolicitud).query(queryPorID);
            if (result.recordset.length > 0) {
                data = result.recordset[0];
            }
        }

        // Si no encontramos por ID (o es una vista previa sin ID), buscamos por Nombre (Método antiguo)
        if (!data) {
            const queryPorNombre = `
                SELECT D.*, I.NombreInstitucion, C.NombreCiudad, E.NombreEstado 
                FROM Docente D 
                LEFT JOIN Institucion I ON D.InstitucionID = I.InstitucionID 
                LEFT JOIN Ciudad C ON I.CiudadID = C.CiudadID 
                LEFT JOIN Estado E ON C.EstadoID = E.EstadoID 
                WHERE D.NombreDocente LIKE '%' + @nombre + '%'
            `;
            const result = await pool.request().input('nombre', sql.NVarChar, nombreBuscado).query(queryPorNombre);
            if (result.recordset.length === 0) return res.status(404).send("Error: Docente no encontrado en BD.");
            data = result.recordset[0];
        }
        
        // 2. Buscar archivo físico del PDF
        const fileQuery = await pool.request().input('nombreDoc', tipoDocumento).query("SELECT NombreArchivoPDF, TipoID FROM TiposDocumento WHERE NombreVisible = @nombreDoc");
        if (fileQuery.recordset.length === 0) return res.status(404).send(`Documento '${tipoDocumento}' no configurado.`);
        let archivoPDF = fileQuery.recordset[0].NombreArchivoPDF;
        const tipoDocId = fileQuery.recordset[0].TipoID;

        const rutasPosibles = [
            path.join(__dirname, '..', 'frontend', 'Recursos-img', archivoPDF)
        ];
        let fileBytes = null;
        for (const ruta of rutasPosibles) { if (fs.existsSync(ruta)) { fileBytes = fs.readFileSync(ruta); break; } }
        if (!fileBytes) return res.status(404).send(`No se encuentra archivo '${archivoPDF}'.`);

        if (archivoPDF.match(/\.(png|jpg|jpeg)$/i)) { 
            res.setHeader('Content-Type', `image/${archivoPDF.split('.').pop()}`);
            return res.send(fileBytes);
        } 

        // 3. PREPARAR PDF Y FIRMA ADMINISTRATIVA
        const pdfDoc = await PDFDocument.load(fileBytes);
        const form = pdfDoc.getForm();

        // Calcular Nombre del Administrativo que firma
        let nombreAdminFirma = "DIRECCIÓN GENERAL"; 
        const rutaQuery = await pool.request().input('tipoId', tipoDocId).query("SELECT TOP 1 RolResponsable FROM RutaFirma WHERE TipoID = @tipoId ORDER BY Orden ASC");
        if (rutaQuery.recordset.length > 0) {
            const rol = rutaQuery.recordset[0].RolResponsable;
            let tabla='', colNom='', colPat='', colMat='';
            const configs = {
                'RH': ['RH', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular'],
                'Direccion': ['Direccion', 'DirectorNombre', 'DirectorApePat', 'DirectorApeMat'],
                'Subdireccion': ['Subdireccion', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular'],
                'ServiciosEscolares': ['ServiciosEscolares', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular'],
                'DesarrolloAcademico': ['DesarrolloAcademico', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular'],
                'JefaDepartamento': ['JefaDepartamento', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular'],
                'PresidenteAcademia': ['PresidenteAcademia', 'PresidenteNombre', 'PresidenteApePat', 'PresidenteApeMat'],
                'ResponsableArea': ['ResponsableArea', 'NombreTitular', 'ApePatTitular', 'ApeMatTitular']
            };
            if(configs[rol]) {
                [tabla, colNom, colPat, colMat] = configs[rol];
                const adminQ = await pool.request().query(`SELECT TOP 1 ${colNom}, ${colPat}, ${colMat} FROM ${tabla}`);
                if(adminQ.recordset.length > 0) {
                    const a = adminQ.recordset[0];
                    nombreAdminFirma = `${a[colNom]} ${a[colPat]} ${a[colMat]}`.toUpperCase();
                }
            }
        }

        // Helper inline para otros docs
        const llenar = (id, valor) => {
            try { const c = form.getTextField(id); if(c) c.setText(String(valor||'')); } catch(e){}
        };

 
        // 4. RUTINA DE LLENADO (SWITCH POR TIPO DE DOCUMENTO)

        if (tipoDocumento === 'Constancia Laboral') {
            // MÓDULO EXTERNO: Constancia Laboral
            await llenarLaboral(form, data, nombreAdminFirma);
        } 
        
        else if (tipoDocumento === 'Constancia de CVU' || tipoDocumento.includes('CVU')) {
            // MÓDULO EXTERNO: Constancia de CVU (NUEVO)
            await llenarCVU(form, data, nombreAdminFirma);
        }

        // --- Lógica inline para los demás (puedes modularizarlos después) ---
        
        else if (tipoDocumento.includes('Estrategias')) {
            const q = await pool.request().input('id', data.DocenteID).query(`SELECT M.NombreMateria, M.Estrategia, M.Prog FROM Grupo G INNER JOIN Materia M ON G.MateriaID = M.MateriaID WHERE G.DocenteID = @id`);
            q.recordset.forEach((fila, i) => {
                llenar(`Asignatura${i+1}`, fila.NombreMateria);
                llenar(`Estrategia${i+1}`, fila.Estrategia || 'Aprendizaje Basado en Proyectos');
                llenar(`Programa${i+1}`, fila.Prog);
            });
            llenar('firma', nombreAdminFirma);
        }

        else if (tipoDocumento.includes('Tutoría')) {
            const q = await pool.request().input('id', data.DocenteID).query(`SELECT P.NombrePeriodo, T.CantTutorados, T.CarreraTut FROM Tutorados T INNER JOIN PeriodoEscolar P ON T.PeriodoID = P.PeriodoID WHERE T.DocenteID = @id`);
            q.recordset.forEach((fila, i) => {
                llenar(`Periodo${i+1}`, fila.NombrePeriodo);
                llenar(`Cantidad${i+1}`, fila.CantTutorados.toString());
                llenar(`Carrera${i+1}`, fila.CarreraTut);
            });
            llenar('firma', nombreAdminFirma);
        }

        else if (tipoDocumento.includes('Créditos') || tipoDocumento.includes('Monitor')) {
            const q = await pool.request().input('id', data.DocenteID).query(`SELECT ActAdmPuesto, NumAlum, P.NombrePeriodo FROM ActividadAdministrativa A INNER JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID WHERE A.DocenteID = @id`);
            if (q.recordset.length > 0) {
                const act = q.recordset[0];
                llenar('Actividad', act.ActAdmPuesto);
                llenar('Periodo', act.NombrePeriodo);
                llenar('Horas', `${act.NumAlum} Alumnos`);
            }
            llenar('firma', nombreAdminFirma);
        }

        else {
            // Llenado Genérico
            llenar('nombre', `${data.NombreDocente} ${data.DocenteApePat} ${data.DocenteApeMat}`.toUpperCase());
            llenar('firma', nombreAdminFirma);
        }


        // 5. ESTAMPADO DE FIRMA (IMAGEN)

        if (idSolicitud) {
            const resFirma = await pool.request().input('docId', idSolicitud).query("SELECT FirmaImagen FROM Firma WHERE DocumentoID = @docId ORDER BY FechaFirma ASC");
            if (resFirma.recordset.length > 0) {
                const page = pdfDoc.getPages()[0];
                let xFirma=100, yFirma=130, wFirma=200, hFirma=60; 
                try {
                    const campoFirma = form.getTextField('firma');
                    const widgets = campoFirma.acroField.getWidgets();
                    const rect = widgets[0].getRectangle();
                    xFirma = rect.x; yFirma = rect.y; wFirma = rect.width; hFirma = rect.height;
                } catch(e){}

                for (const f of resFirma.recordset) {
                    if (f.FirmaImagen) {
                        try {
                            const pngImage = await pdfDoc.embedPng(f.FirmaImagen);
                            const dims = pngImage.scaleToFit(wFirma, hFirma * 3); 
                            const xC = xFirma + (wFirma - dims.width) / 2;
                            const yC = yFirma + (hFirma / 2) - 10;
                            page.drawImage(pngImage, { x: xC, y: yC, width: dims.width, height: dims.height });
                        } catch (e) { console.error("Error imagen:", e); }
                    }
                }
            }
        }

        form.flatten(); 
        const pdfBytesFinal = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=Documento.pdf');
        res.send(Buffer.from(pdfBytesFinal));

    } catch (err) { console.error(err); res.status(500).send("Error generando: " + err.message); }
});

// ==================================================================
// 7. GUARDAR FIRMA DE PERFIL (ADMIN)
// ==================================================================
app.post('/api/guardar-firma-perfil', async (req, res) => {
    const { idUsuario, rol, firmaBase64 } = req.body;
    const tablaMap = {
        'Direccion': { table: 'Direccion', idCol: 'DirectorID' },
        'RH': { table: 'RH', idCol: 'RHID' },
        'Subdireccion': { table: 'Subdireccion', idCol: 'SubdireccionID' },
        'ServiciosEscolares': { table: 'ServiciosEscolares', idCol: 'ServEscID' },
        'JefaDepartamento': { table: 'JefaDepartamento', idCol: 'JefaDepartamentoID' },
        'DesarrolloAcademico': { table: 'DesarrolloAcademico', idCol: 'DesaAcadID' },
        'PresidenteAcademia': { table: 'PresidenteAcademia', idCol: 'PresidenteID' },
        'ResponsableArea': { table: 'ResponsableArea', idCol: 'ResponsableID' }
    };
    const configTabla = tablaMap[rol];
    if (!configTabla) return res.status(400).json({ success: false, message: "Rol no administrativo." });

    try {
        const pool = await poolPromise;
        await pool.request().input('firma', sql.NVarChar(sql.MAX), firmaBase64).input('id', sql.Int, idUsuario)
            .query(`UPDATE ${configTabla.table} SET FirmaDigital = @firma WHERE ${configTabla.idCol} = @id`);
        res.json({ success: true, message: "Firma guardada." });
    } catch (err) { res.status(500).json({ success: false, message: "Error BD." }); }
});

const PORT = 3000;
app.listen(PORT, () => { console.log(`Servidor Backend corriendo en http://localhost:${PORT}`); });
