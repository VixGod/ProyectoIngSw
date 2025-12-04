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
const { llenarCreditos } = require('./documentos/docCreditos');
const { llenarExencion } = require('./documentos/docExencion');
const { llenarServicios } = require('./documentos/docServicios');
const { llenarAcreditacion } = require('./documentos/docAcreditacion');
const { llenarCargaAcademica } = require('./documentos/docCargaAcademica');
const { llenarExclusividad } = require('./documentos/docExclusividad');
const { llenarCedula } = require('./documentos/docCedula');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

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

        // 1. OBTENER PERFIL Y DOCUMENTOS
        const perfilQuery = await pool.request().input('id', sql.Int, idDocente).query("SELECT * FROM Docente WHERE DocenteID = @id");
        if (perfilQuery.recordset.length === 0) return res.json([]); 
        const perfil = perfilQuery.recordset[0];

        const tiposDocs = await pool.request().query("SELECT * FROM TiposDocumento");
        const listaTodos = tiposDocs.recordset;

        const historialQ = await pool.request().input('id', sql.Int, idDocente).query(`SELECT Doc.TipoDoc FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID WHERE Exp.DocenteID = @id`);
        const docsYaPedidos = historialQ.recordset.map(d => d.TipoDoc.trim());

        // --- CONSTANTES DE EVALUACIÓN ---
        const ANIO_EVALUAR = "2024";
        const ANIO_ACTUAL = "2025";

        // --- 2. CONSULTAS DE VALIDACIÓN (Lógica Robusta) ---

        // A. CÁLCULO DE HORAS EXACTAS (Usando minutos para evitar errores de redondeo)
        const qHoras = `
            SELECT Periodo, SUM(Minutos)/60.0 as Horas FROM (
                -- 1. Clases
                SELECT P.NombrePeriodo as Periodo, ISNULL(DATEDIFF(MINUTE, H.HoraInicioAct, H.HoraFinAct), 0) as Minutos
                FROM HorarioActividad H
                JOIN GrupoMateria GM ON H.ActividadID = GM.GrupoMateriaID AND H.TipoActividad = 'GrupoMateria'
                JOIN Grupo G ON GM.GrupoID = G.GrupoID
                JOIN Materia M ON GM.MateriaID = M.MateriaID
                JOIN PeriodoEscolar P ON M.PeriodoID = P.PeriodoID
                WHERE G.DocenteID = @id AND P.NombrePeriodo NOT LIKE '%VERANO%'
                
                UNION ALL
                
                -- 2. Apoyo
                SELECT P.NombrePeriodo as Periodo, ISNULL(DATEDIFF(MINUTE, H.HoraInicioAct, H.HoraFinAct), 0) as Minutos
                FROM HorarioActividad H
                JOIN ApoyoADocencia A ON H.ActividadID = A.ActApoyoID AND H.TipoActividad = 'ApoyoADocencia'
                JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID
                WHERE A.DocenteID = @id AND P.NombrePeriodo NOT LIKE '%VERANO%'

                UNION ALL

                -- 3. Administrativas
                SELECT P.NombrePeriodo as Periodo, ISNULL(DATEDIFF(MINUTE, H.HoraInicioAct, H.HoraFinAct), 0) as Minutos
                FROM HorarioActividad H
                JOIN ActividadAdministrativa AD ON H.ActividadID = AD.ActAdmID AND H.TipoActividad = 'ActividadAdministrativa'
                JOIN PeriodoEscolar P ON AD.PeriodoID = P.PeriodoID
                WHERE AD.DocenteID = @id AND P.NombrePeriodo NOT LIKE '%VERANO%'
            ) as TablaHoras
            GROUP BY Periodo
        `;

        const resHoras = await pool.request().input('id', sql.Int, idDocente).query(qHoras);
        
        let h24_1 = 0, h24_2 = 0, h25_1 = 0;
        resHoras.recordset.forEach(r => {
            const p = r.Periodo.toUpperCase();
            if (p.includes(ANIO_EVALUAR) && (p.includes('ENE') || p.includes('JUN') || p.includes('ENERO'))) h24_1 += r.Horas;
            if (p.includes(ANIO_EVALUAR) && (p.includes('AGO') || p.includes('DIC') || p.includes('DICIEMBRE'))) h24_2 += r.Horas;
            if (p.includes(ANIO_ACTUAL) && (p.includes('ENE') || p.includes('JUN') || p.includes('ENERO'))) h25_1 += r.Horas;
        });

        // REGLA HORAS: Se pide aprox 40hrs. Usamos 35 como margen de seguridad.
        const cumpleHoras = (h24_1 >= 35 && h24_2 >= 35 && h25_1 >= 35);
        const tieneCargaAnual = (h24_1 > 0 || h24_2 > 0); // Para saber si dio clases

        // B. TUTORÍAS (Existencia en 2024)
        const qTut = `SELECT COUNT(*) as C FROM Tutorados T JOIN PeriodoEscolar P ON T.PeriodoID=P.PeriodoID WHERE T.DocenteID=@id AND P.NombrePeriodo LIKE '%`+ANIO_EVALUAR+`%'`;
        const resTut = await pool.request().input('id', sql.Int, idDocente).query(qTut);
        const tieneTutorias = resTut.recordset[0].C > 0;

        // C. CRÉDITOS / ACTIVIDAD ADMINISTRATIVA (Existencia en 2024)
const qCred = `
            SELECT ISNULL(SUM(NumAlum), 0) as TotalAlumnos 
            FROM ActividadAdministrativa A 
            JOIN PeriodoEscolar P ON A.PeriodoID = P.PeriodoID 
            WHERE A.DocenteID = @id AND P.NombrePeriodo LIKE '%` + ANIO_EVALUAR + `%'
        `;
        const resCred = await pool.request().input('id', sql.Int, idDocente).query(qCred);
        const totalAlumnosCreditos = resCred.recordset[0].TotalAlumnos;

        // D. REGLAS DE PERFIL
        const anioActual = new Date().getFullYear();
        const fechaLimite = new Date(`${anioActual - 1}-01-16`); 
        const fechaIngreso = perfil.FechaIngreso ? new Date(perfil.FechaIngreso) : new Date();
        
        const cumpleAntiguedad = fechaIngreso < fechaLimite;
        const cumpleAsistencia = (perfil.PorcentajeAsistencia >= 90);
        const cumpleEvaluacion = (perfil.PromedioEvaluacion >= 70);
        
        const estatusValido = perfil.TipoPlaza && !perfil.TipoPlaza.includes('(20)'); // Bloquear interinos puros
        const esTiempoCompleto = (perfil.TipoPlaza || '').toUpperCase().includes('COMPLETO') || (perfil.TipoPlaza || '').toUpperCase().includes('40');

        // --- 3. ARMADO DEL CATÁLOGO ---
        let catalogo = [];

        listaTodos.forEach(doc => {
            let motivoBloqueo = null;
            const yaLoTiene = docsYaPedidos.includes(doc.NombreVisible.trim());
            const nombre = doc.NombreVisible.toUpperCase();

            // 1. VALIDACIONES GLOBALES (Aplican a casi todo)
            if (!motivoBloqueo) {
                if (!perfil.CedulaDocente) motivoBloqueo = "Falta Cédula Profesional.";
                else if (!estatusValido) motivoBloqueo = "Estatus no válido para el programa.";
                else if (!cumpleAntiguedad) motivoBloqueo = `Antigüedad insuficiente (Ingreso posterior a Ene ${ANIO_EVALUAR}).`;
                else if (!cumpleAsistencia) motivoBloqueo = `Asistencia insuficiente (${perfil.PorcentajeAsistencia}%). Req: 90%.`;
                else if (!cumpleEvaluacion) motivoBloqueo = `Evaluación docente baja (${perfil.PromedioEvaluacion}). Req: 70.`;
            }

            // 2. VALIDACIONES ESPECÍFICAS POR DOCUMENTO
            if (!motivoBloqueo) {
                
                // Horario / Carga Académica
                if (nombre.includes('CARGA') || nombre.includes('HORARIO')) {
                    if (!cumpleHoras) motivoBloqueo = `Horas insuficientes (Ene24:${h24_1.toFixed(0)}, Ago24:${h24_2.toFixed(0)}, Ene25:${h25_1.toFixed(0)}). Req: 40h.`;
                }

                // Tutoría
                else if (nombre.includes('TUTORÍA')) {
                    if (!tieneTutorias) motivoBloqueo = `No tienes tutorados registrados en ${ANIO_EVALUAR}.`;
                }

                // Estrategias / Recursos (Requieren haber dado clases)
                else if (nombre.includes('ESTRATEGIAS') || nombre.includes('RECURSO')) {
                    if (!tieneCargaAnual) motivoBloqueo = `No impartiste clases frente a grupo en ${ANIO_EVALUAR}.`;
                }

                // Créditos (Monitor)
                else if (nombre.includes('CRÉDITOS') || nombre.includes('MONITOR')) {
                    // CORRECCIÓN: Si el total de alumnos es 0, bloqueamos aunque exista la actividad.
                    if (totalAlumnosCreditos === 0) {
                        motivoBloqueo = `Actividad registrada sin alumnos (0) en ${ANIO_EVALUAR}.`;
                    }
                }

                // Servicios Escolares
                else if (nombre.includes('SERVICIOS')) {
                    if (!tieneCargaAnual) motivoBloqueo = `Sin carga académica registrada en ${ANIO_EVALUAR}.`;
                }

                // Constancia Laboral / Exclusividad
                else if (nombre.includes('LABORAL') || nombre.includes('EXCLUSIVIDAD')) {
                    if (!esTiempoCompleto) motivoBloqueo = "Tu plaza no es de Tiempo Completo.";
                    // Validación extra para Laboral
                    if (nombre.includes('CONSTANCIA LABORAL')) {
                        if (!perfil.ClavePresupuestal) motivoBloqueo = "Falta Clave Presupuestal en perfil.";
                    }
                }
                
                // CVU
                else if (nombre.includes('CVU')) {
                    if (!perfil.Registro) motivoBloqueo = "Falta No. Registro CVU en perfil.";
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

    } catch (err) { console.error("Error catálogo:", err); res.status(500).send("Error del servidor: " + err.message); }
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
        
        // A. Obtener Expediente
        let exp = await pool.request().input('id', idDocente).query("SELECT ExpedienteID FROM Expediente WHERE DocenteID = @id");
        let expedienteID = (exp.recordset.length > 0) ? exp.recordset[0].ExpedienteID : 
            (await pool.request().input('id', idDocente).query("INSERT INTO Expediente (StatusExp, DocenteID, FechaReg) OUTPUT INSERTED.ExpedienteID VALUES ('Activo', @id, GETDATE())")).recordset[0].ExpedienteID;

        // B. Verificar duplicados
        const existe = await pool.request().input('exp', expedienteID).input('tipo', nombreDocumento).query("SELECT Count(*) as c FROM Documentos WHERE ExpedienteID = @exp AND TipoDoc = @tipo");
        if (existe.recordset[0].c > 0) return res.status(400).json({ success: false, message: "Ya has solicitado este documento." });

        // --- LÓGICA ESPECIAL: CARTA DE EXCLUSIVIDAD (AUTO-FIRMA) ---
        if (nombreDocumento.includes('Exclusividad') || nombreDocumento.includes('Cédula') || nombreDocumento.includes('Exención')) {
            // 1. Verificar si el docente tiene firma configurada
            const qFirma = await pool.request().input('id', idDocente).query("SELECT FirmaDigital FROM Docente WHERE DocenteID = @id");
            if (qFirma.recordset.length === 0 || !qFirma.recordset[0].FirmaDigital) {
                return res.status(400).json({ success: false, message: "Para solicitar este documento, primero debes configurar tu FIRMA DIGITAL en 'Mi Perfil'." });
            }
            const firmaBase64 = qFirma.recordset[0].FirmaDigital;

            // 2. Insertar Documento como 'Completado' directamente
            const qDoc = await pool.request()
                .input('tipo', sql.NVarChar, nombreDocumento)
                .input('fecha', sql.Date, new Date())
                .input('status', sql.NVarChar, 'Completado') // ¡Directo a Completado!
                .input('expId', sql.Int, expedienteID)
                .query("INSERT INTO Documentos (TipoDoc, FechaDoc, StatusDoc, ExpedienteID) OUTPUT INSERTED.DocumentoID VALUES (@tipo, @fecha, @status, @expId)");
            
            const nuevoDocID = qDoc.recordset[0].DocumentoID;

            // 3. Estampar la firma automáticamente en la tabla Firma
            await pool.request()
                .input('fecha', sql.Date, new Date())
                .input('docId', sql.Int, nuevoDocID)
                .input('tipo', sql.NVarChar, 'Docente') // Quien firma es el Docente
                .input('firmanteId', sql.Int, idDocente)
                .input('imagen', sql.NVarChar(sql.MAX), firmaBase64)
                .query("INSERT INTO Firma (FechaFirma, DocumentoID, TipoFirmante, FirmanteID, FirmaImagen) VALUES (@fecha, @docId, @tipo, @firmanteId, @imagen)");

            return res.json({ success: true, message: "Documento generado y firmado exitosamente. Puedes descargarlo en 'Completados'." });
        }

        // --- LÓGICA NORMAL (FLUJO DE APROBACIÓN) ---

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

        let data = null;
        if (idSolicitud && idSolicitud !== '0') {
            const r = await pool.request().input('id', idSolicitud).query(`SELECT D.* FROM Documentos Doc INNER JOIN Expediente Exp ON Doc.ExpedienteID = Exp.ExpedienteID INNER JOIN Docente D ON Exp.DocenteID = D.DocenteID WHERE Doc.DocumentoID = @id`);
            if (r.recordset.length) data = r.recordset[0];
        }
        if (!data) {
            const r = await pool.request().input('nom', nombreBuscado).query(`SELECT * FROM Docente WHERE NombreDocente LIKE '%' + @nom + '%'`);
            if (r.recordset.length) data = r.recordset[0]; else return res.status(404).send("Docente no encontrado");
        }

        // Cargar Plantilla (Solo si existe y se necesita)
        const fQ = await pool.request().input('nom', tipoDocumento).query("SELECT NombreArchivoPDF FROM TiposDocumento WHERE NombreVisible=@nom");
        let fileBytes = null;
        if(fQ.recordset.length) {
            const p = path.join(__dirname, '..', 'frontend', 'Recursos-img', fQ.recordset[0].NombreArchivoPDF);
            if(fs.existsSync(p)) fileBytes = fs.readFileSync(p);
        }

        let pdfDoc;
        let form;

        // --- GENERACIÓN ---

        // 1. EXCLUSIVIDAD (Desde Cero)

if (tipoDocumento.includes('Exclusividad')) {
    // CLONAMOS los datos para no afectar otras partes
    let datosParaGenerar = { ...data };

    // SI ES VISTA PREVIA (idDoc=0), ocultamos la firma para que salga en blanco
    if (!idSolicitud || idSolicitud === '0') {
        datosParaGenerar.FirmaDigital = null;
    }

    // Pasamos 'datosParaGenerar' en lugar de 'data'
    pdfDoc = await llenarExclusividad(null, datosParaGenerar, pool);
}
else if (tipoDocumento.includes('Cédula')) {
            let datosParaGenerar = { ...data };
            // Mismo truco de ocultar firma si es vista previa
            if (!idSolicitud || idSolicitud === '0') datosParaGenerar.FirmaDigital = null;
            
            pdfDoc = await llenarCedula(datosParaGenerar);
        }
        else if (tipoDocumento.includes('Cédula') || tipoDocumento.includes('Validación')) {
            
            // CLONAMOS los datos
            let datosParaGenerar = { ...data };

            // CANDADO: SI ES VISTA PREVIA (idDoc=0), BORRAMOS LA FIRMA TEMPORALMENTE
            if (!idSolicitud || idSolicitud === '0') {
                datosParaGenerar.FirmaDigital = null;
            }
            
            pdfDoc = await llenarCedula(datosParaGenerar);
        }
        // 2. CONSTANCIA LABORAL (Con Plantilla)
        else if (tipoDocumento.includes('Laboral')) {
            if(!fileBytes) throw new Error("Falta plantilla Laboral");
            pdfDoc = await PDFDocument.load(fileBytes);
            form = pdfDoc.getForm();
            const qRH = await pool.request().query("SELECT TOP 1 NombreTitular, ApePatTitular, ApeMatTitular FROM RH");
            let nomRH = qRH.recordset.length ? `${qRH.recordset[0].NombreTitular} ${qRH.recordset[0].ApePatTitular} ${qRH.recordset[0].ApeMatTitular}`.toUpperCase() : "JEFA RH";
            await llenarLaboral(form, data, nomRH);
        }
        // 3. CVU (Con Plantilla)
        else if (tipoDocumento.includes('CVU')) {
            if(!fileBytes) throw new Error("Falta plantilla CVU");
            pdfDoc = await PDFDocument.load(fileBytes);
            form = pdfDoc.getForm();
            await llenarCVU(form, data, "");
        }
        // 4. TUTORÍA (Con Plantilla)
        else if (tipoDocumento.includes('Tutoría')) {
            if(!fileBytes) throw new Error("Falta plantilla Tutoría");
            pdfDoc = await PDFDocument.load(fileBytes);
            form = pdfDoc.getForm();
            await llenarTutoria(form, data, pool);
        }
        // 5. ESTRATEGIAS (Híbrido: Usa plantilla base y clona páginas)
        else if (tipoDocumento.includes('Estrategias')) {
            if(!fileBytes) throw new Error("Falta plantilla Estrategias");
            pdfDoc = await llenarEstrategias(fileBytes, data);
        } 
        // 6. RECURSO DIGITAL (Híbrido)
        else if (tipoDocumento.includes('Recurso') || tipoDocumento.includes('Digital')) {
            if(!fileBytes) throw new Error("Falta plantilla Recurso");
            pdfDoc = await llenarRecurso(fileBytes, data);
        }
        // 7. DOCUMENTOS DESDE CERO (Nuevos)
        else if (tipoDocumento.includes('Créditos')) pdfDoc = await llenarCreditos(null, data, pool);
        else if (tipoDocumento.includes('Exención')) pdfDoc = await llenarExencion(null, data, pool);
        else if (tipoDocumento.includes('Servicios')) pdfDoc = await llenarServicios(null, data, pool);
        else if (tipoDocumento.includes('Carga')) pdfDoc = await llenarCargaAcademica(null, data, pool);
        else if (tipoDocumento.includes('Acreditación')) pdfDoc = await llenarAcreditacion(null, data, pool);
        
        else {
            if(!fileBytes) return res.status(500).send("Sin generador ni plantilla.");
            pdfDoc = await PDFDocument.load(fileBytes);
        }

        // FIRMAS (Igual que siempre, con la excepción de Exclusividad)
        if (idSolicitud && idSolicitud !== '0') {
            const resF = await pool.request().input('id', idSolicitud).query("SELECT FirmaImagen, TipoFirmante FROM Firma WHERE DocumentoID=@id ORDER BY FechaFirma ASC");
            if(resF.recordset.length) {
                const pages = pdfDoc.getPages();
                for(const p of pages) {
                    for(const f of resF.recordset) {
                        if(f.FirmaImagen) {
try {
    let img;
    // 1. DETECCIÓN INTELIGENTE (Soporte para JPG y PNG)
    if (f.FirmaImagen.startsWith('data:image/jpeg') || f.FirmaImagen.startsWith('data:image/jpg')) {
        img = await pdfDoc.embedJpg(f.FirmaImagen);
    } else {
        img = await pdfDoc.embedPng(f.FirmaImagen);
    }

    const dims = img.scaleToFit(130, 50);
    let x = 0, y = 0;

    // 2. EXCEPCIONES (Documentos que no llevan firma estampada aquí)
    // Corregí 'nombreDocumento' por 'tipoDocumento'
    if (tipoDocumento.includes('Exclusividad') || tipoDocumento.includes('Cédula') || tipoDocumento.includes('Exención')) {
        continue; 
    } 
    // 3. COORDENADAS
    else if (tipoDocumento.includes('Estrategias') || tipoDocumento.includes('Recurso')) {
        if (f.TipoFirmante.includes('Jefa')) { x = 260; y = 330; }
        else if (f.TipoFirmante.includes('Presidente')) { x = 140; y = 260; }
        else { x = 420; y = 255; }
    } 
    else if (tipoDocumento.includes('Tutoría')) {
        if (f.TipoFirmante.includes('Desarrollo')) { x = 80; y = 260; } 
        else { x = 405; y = 260; }
    } 
    else if (tipoDocumento.includes('Carga')) {
        if (f.TipoFirmante.includes('Jefa')) { x = 60; y = 120; } 
        else { x = 400; y = 120; }
    }
    else if (tipoDocumento.includes('Créditos')) {
            if (f.TipoFirmante.includes('Responsable')) { x = 100; y = 150; } 
            else { x = 400; y = 150; }
    }else if (tipoDocumento.includes('Servicios')) {  x = 240;   y = 100; }
    else {
        // Laboral y CVU
        x = 100; y = 280; 
    }

    if (x > 0) p.drawImage(img, { x, y, width: dims.width, height: dims.height });

} catch (e) {
    console.error(`Error firma en ${tipoDocumento}:`, e.message);
}
                        }
                    }
                }
            }
        }

        try { if(form) form.flatten(); } catch(e){}
        const b = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(b));

    } catch (e) { console.error(e); res.status(500).send(e.message); }
});

// SOLICITAR DOCUMENTO (Con Auto-Firma Exclusividad)
app.post('/api/solicitar-documento', async (req, res) => {
    const { idDocente, nombreDocumento } = req.body;
    try {
        const pool = await poolPromise;
        let exp = await pool.request().input('id', idDocente).query("SELECT ExpedienteID FROM Expediente WHERE DocenteID = @id");
        let expedienteID = (exp.recordset.length > 0) ? exp.recordset[0].ExpedienteID : (await pool.request().input('id', idDocente).query("INSERT INTO Expediente (StatusExp, DocenteID, FechaReg) OUTPUT INSERTED.ExpedienteID VALUES ('Activo', @id, GETDATE())")).recordset[0].ExpedienteID;

        const existe = await pool.request().input('exp', expedienteID).input('tipo', nombreDocumento).query("SELECT Count(*) as c FROM Documentos WHERE ExpedienteID = @exp AND TipoDoc = @tipo AND StatusDoc = 'Pendiente'");
        if (existe.recordset[0].c > 0) return res.status(400).json({ success: false, message: "Solicitud pendiente." });

        const fechaCuliacan = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Mazatlan"}));

        if (nombreDocumento.includes('Exclusividad')) {
            const qFirma = await pool.request().input('id', idDocente).query("SELECT FirmaDigital FROM Docente WHERE DocenteID = @id");
            if (!qFirma.recordset[0]?.FirmaDigital) return res.status(400).json({ success: false, message: "FIRMA DIGITAL REQUERIDA" });
            
            const qDoc = await pool.request().input('tipo', nombreDocumento).input('fecha', fechaCuliacan).input('status', 'Completado').input('expId', expedienteID).query("INSERT INTO Documentos (TipoDoc, FechaDoc, StatusDoc, ExpedienteID) OUTPUT INSERTED.DocumentoID VALUES (@tipo, @fecha, @status, @expId)");
            await pool.request().input('fecha', fechaCuliacan).input('docId', qDoc.recordset[0].DocumentoID).input('tipo', 'Docente').input('firmanteId', idDocente).input('imagen', qFirma.recordset[0].FirmaDigital).query("INSERT INTO Firma VALUES (@fecha, @docId, @tipo, @firmanteId, @imagen)");
            return res.json({ success: true, message: "Documento generado y firmado." });
        }

        const rutaInfo = await pool.request().input('nombre', nombreDocumento).query("SELECT TOP 1 R.RolResponsable FROM RutaFirma R INNER JOIN TiposDocumento T ON R.TipoID = T.TipoID WHERE T.NombreVisible = @nombre AND R.Orden = 1");
        let rol = (rutaInfo.recordset.length > 0) ? rutaInfo.recordset[0].RolResponsable : 'Direccion';
        await pool.request().input('tipo', nombreDocumento).input('fecha', fechaCuliacan).input('status', 'Pendiente').input('expId', expedienteID).input('rol', rol).query("INSERT INTO Documentos (TipoDoc, FechaDoc, StatusDoc, ExpedienteID, RolFirmanteActual) VALUES (@tipo, @fecha, @status, @expId, @rol)");
        res.json({ success: true, message: `Enviado a: ${rol}` });

    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ==================================================================
// 7. GUARDAR FIRMA DE PERFIL
// ==================================================================
app.post('/api/guardar-firma-perfil', async (req, res) => {
    const { idUsuario, rol, firmaBase64 } = req.body;
    
    // Mapeo de roles a tablas
    const tablaMap = { 
        'Direccion': {table:'Direccion', idCol:'DirectorID'}, 
        'RH': {table:'RH', idCol:'RHID'}, 
        'Subdireccion': {table:'Subdireccion', idCol:'SubdireccionID'}, 
        'ServiciosEscolares': {table:'ServiciosEscolares', idCol:'ServEscID'}, 
        'JefaDepartamento': {table:'JefaDepartamento', idCol:'JefaDepartamentoID'}, 
        'DesarrolloAcademico': {table:'DesarrolloAcademico', idCol:'DesaAcadID'}, 
        'PresidenteAcademia': {table:'PresidenteAcademia', idCol:'PresidenteID'}, 
        'ResponsableArea': {table:'ResponsableArea', idCol:'ResponsableID'},
        'Docente': {table:'Docente', idCol:'DocenteID'} // ¡NUEVO! Agregamos soporte para Docentes
    };

    // Si el rol es nulo o indefinido, asumimos que es 'Docente' (para mayor seguridad)
    const rolNormalizado = rol || 'Docente';
    const configTabla = tablaMap[rolNormalizado];

    if (!configTabla) return res.status(400).json({ success: false, message: "Rol inválido para guardar firma." });

    try {
        const pool = await poolPromise;
        await pool.request().input('firma', sql.NVarChar(sql.MAX), firmaBase64).input('id', sql.Int, idUsuario).query(`UPDATE ${configTabla.table} SET FirmaDigital = @firma WHERE ${configTabla.idCol} = @id`);
        res.json({ success: true, message: "Firma guardada correctamente." });
    } catch (err) { res.status(500).json({ success: false, message: "Error BD: " + err.message }); }
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
