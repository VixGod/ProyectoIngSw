USE TECNM;
GO

-- ===============================================================
-- 1. ACTUALIZACIÓN ESTRUCTURAL (TABLAS EXISTENTES)
-- ===============================================================

-- A. Agregar columnas al perfil del DOCENTE (Si no existen)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Docente') AND name = 'FechaIngreso')
BEGIN
    ALTER TABLE Docente ADD FechaIngreso DATE NULL;
    ALTER TABLE Docente ADD CategoriaActual NVARCHAR(100) NULL;
    ALTER TABLE Docente ADD TipoPlaza NVARCHAR(50) NULL;
    ALTER TABLE Docente ADD ClavePresupuestal NVARCHAR(50) NULL;
    ALTER TABLE Docente ADD EfectosDesde DATE NULL;

END

-- B. Agregar Firma Digital a todas las tablas ADMINISTRATIVAS
DECLARE @sql NVARCHAR(MAX) = '';
DECLARE @tableName NVARCHAR(50);
DECLARE tableCursor CURSOR FOR 
SELECT name FROM sys.tables WHERE name IN ('Direccion', 'RH', 'Subdireccion', 'ServiciosEscolares', 'DesarrolloAcademico', 'JefaDepartamento', 'PresidenteAcademia', 'ResponsableArea');

OPEN tableCursor;
FETCH NEXT FROM tableCursor INTO @tableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(@tableName) AND name = 'FirmaDigital')
    BEGIN
        SET @sql = 'ALTER TABLE ' + @tableName + ' ADD FirmaDigital NVARCHAR(MAX) NULL;';
        EXEC sp_executesql @sql;
    END
    FETCH NEXT FROM tableCursor INTO @tableName;
END
CLOSE tableCursor;
DEALLOCATE tableCursor;

GO

-- ===============================================================
-- 2. REINICIO DE TABLAS DEL SISTEMA (LIMPIEZA SEGURA)
-- Se eliminan y recrean para garantizar que todos tengan la misma estructura e IDs
-- ===============================================================

-- Eliminamos en orden inverso por las relaciones (FK)
IF OBJECT_ID('Firma', 'U') IS NOT NULL DROP TABLE Firma;
IF OBJECT_ID('RutaFirma', 'U') IS NOT NULL DROP TABLE RutaFirma; -- Depende de TiposDocumento
IF OBJECT_ID('Documentos', 'U') IS NOT NULL DROP TABLE Documentos; -- Depende de Expediente
IF OBJECT_ID('TiposDocumento', 'U') IS NOT NULL DROP TABLE TiposDocumento;

-- 2.1. Crear Tabla DOCUMENTOS (Con flujo de firmas)
CREATE TABLE Documentos (
    DocumentoID INT IDENTITY(1,1) PRIMARY KEY,
    TipoDoc NVARCHAR(100) NOT NULL,
    FechaDoc DATE NOT NULL,
    StatusDoc NVARCHAR(20) NOT NULL, -- 'Pendiente', 'Firmado', 'Completado'
    ExpedienteID INT NOT NULL,
    FirmanteActualID INT NULL,       
    RolFirmanteActual NVARCHAR(50) NULL, 
    DirectorID INT NULL, 
    CONSTRAINT FK_Documentos_Expediente FOREIGN KEY (ExpedienteID) REFERENCES Expediente(ExpedienteID)
);

-- 2.2. Crear Tabla FIRMA (Con imagen)
CREATE TABLE Firma (
    FirmaID INT IDENTITY(1,1) PRIMARY KEY,
    FechaFirma DATE NOT NULL,
    DocumentoID INT NOT NULL,
    TipoFirmante NVARCHAR(50) NOT NULL, 
    FirmanteID INT NOT NULL, 
    FirmaImagen NVARCHAR(MAX) NULL, -- Base64
    CONSTRAINT FK_Firma_Documento FOREIGN KEY (DocumentoID) REFERENCES Documentos(DocumentoID)
);

-- 2.3. Crear Tabla CATÁLOGO (Tipos de Documento)
CREATE TABLE TiposDocumento (
    TipoID INT IDENTITY(1,1) PRIMARY KEY,
    NombreVisible NVARCHAR(100) NOT NULL,
    NombreArchivoPDF NVARCHAR(100) NOT NULL,
    RequiereValidacion NVARCHAR(50) NULL
);

-- 2.4. Crear Tabla RUTAS (Flujo de autorización)
CREATE TABLE RutaFirma (
    RutaID INT IDENTITY(1,1) PRIMARY KEY,
    TipoID INT NOT NULL,
    Orden INT NOT NULL,
    RolResponsable NVARCHAR(50) NOT NULL,
    CONSTRAINT FK_Ruta_Tipo FOREIGN KEY (TipoID) REFERENCES TiposDocumento(TipoID)
);

GO

-- ===============================================================
-- 3. CARGA DEL CATÁLOGO (LOS 11 DOCUMENTOS)
-- ===============================================================

-- Reiniciamos contador por seguridad
DBCC CHECKIDENT ('TiposDocumento', RESEED, 0);

INSERT INTO TiposDocumento (NombreVisible, NombreArchivoPDF, RequiereValidacion) VALUES 
('Constancia Laboral', 'constancia_laboral.pdf', NULL),                                     -- 1        01
('Constancia de Tutoría', 'constancia_tutoria.pdf', 'Tutorados'),                             -- 2      1.1.5.1
('Constancia de Estrategias Didácticas', 'constancia_estrategias.pdf', 'Grupo'),              -- 3      1.2.1.3
('Constancia de Recurso Educativo Digital', 'constancia_recurso_digital.pdf', 'Grupo'),       -- 4      1.2.1.1
('Constancia de Créditos (Monitor)', 'constancia_creditos_monitor.pdf', 'Administrativa'),    -- 5      1.1.7
('Constancia de Exención de Examen Prof.', 'constancia_exencion_examen.pdf', NULL),           -- 6      1.3.1.1
('Carga Académica (Horario)', 'carga_academica.pdf', 'Grupo'),                                -- 7
('Carta de Exclusividad Laboral', 'carta_exclusividad.pdf', NULL),                            -- 8      04
('Acreditación CONAIC', 'acreditacion_conaic.pdf', NULL),                                     -- 9      1.1.6
('Constancia de CVU', 'constancia_cvu.pdf', NULL),                                            -- 10     06
('Constancia de Servicios Escolares', 'constancia_servicios.pdf', NULL);                      -- 11     07

-- ===============================================================
-- 4. CONFIGURACIÓN DE RUTAS (QUIÉN FIRMA QUÉ)
-- ===============================================================

-- 1. Laboral -> RH
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (1, 1, 'RH');
-- 2. Tutoría -> Desarrollo
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (2, 1, 'DesarrolloAcademico');
-- 3. Estrategias -> Jefa > Presidente > Subdirección
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (3, 1, 'JefaDepartamento'), (3, 2, 'PresidenteAcademia'), (3, 3, 'Subdireccion');
-- 4. Recurso -> Jefa > Presidente > Subdirección
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (4, 1, 'JefaDepartamento'), (4, 2, 'PresidenteAcademia'), (4, 3, 'Subdireccion');
-- 5. Créditos -> Responsable > Subdirección
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (5, 1, 'ResponsableArea'), (5, 2, 'Subdireccion');
-- 6. Exención -> Servicios Escolares
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (6, 1, 'ServiciosEscolares');
-- 7. Carga -> Jefa Depto
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (7, 1, 'JefaDepartamento');
-- 8. Exclusividad -> RH
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (8, 1, 'RH');
-- 9. Acreditación -> Dirección
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (9, 1, 'Direccion');
-- 10. CVU -> Desarrollo Académico
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (10, 1, 'DesarrolloAcademico');
-- 11. Servicios Escolares -> Servicios Escolares
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES (11, 1, 'ServiciosEscolares');


GO

-- ===============================================================
-- 5. DATOS DE PRUEBA (NORMA REBECA - ID 1)
-- ===============================================================
UPDATE Docente 
SET 
    FechaIngreso = '2009-09-16',
    CategoriaActual = 'PROFESOR TITULAR "B" (E.S.)',
    TipoPlaza = 'TIEMPO COMPLETO (40 HRS)',
    ClavePresupuestal = '14.02-E381500.0100489',
    EfectosDesde = '2023-10-01',
    Registro = '402002'
WHERE DocenteID = 1;

GO

-- ===============================================================
-- 6. NUEVAS COLUMNAS DE VALIDACIÓN (PROMEDIO Y ASISTENCIA)
-- ===============================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Docente') AND name = 'PromedioEvaluacion')
BEGIN
    ALTER TABLE Docente ADD PromedioEvaluacion DECIMAL(5,2) NULL;
    ALTER TABLE Docente ADD PorcentajeAsistencia INT NULL;
    PRINT '   -> Columnas de Promedio y Asistencia agregadas.';
END
GO

-- ===============================================================
-- 7. NUEVAS TABLAS (REPORTES DE ERROR Y EXAMEN PROFESIONAL)
-- ===============================================================

-- A. Tabla de Reportes (Quejas)
IF OBJECT_ID('ReportesError', 'U') IS NULL
BEGIN
    CREATE TABLE ReportesError (
        ReporteID INT IDENTITY(1,1) PRIMARY KEY,
        DocenteID INT NOT NULL,
        TipoDocumento NVARCHAR(100) NOT NULL,
        DepartamentoDestino NVARCHAR(50) NOT NULL,
        MensajeError NVARCHAR(MAX) NOT NULL,
        RespuestaAdmin NVARCHAR(MAX) NULL,
        FechaReporte DATETIME DEFAULT GETDATE(),
        FechaRespuesta DATETIME NULL,
        Estatus NVARCHAR(20) DEFAULT 'Pendiente',
        CONSTRAINT FK_Reportes_Docente FOREIGN KEY (DocenteID) REFERENCES Docente(DocenteID)
    );
    PRINT '   -> Tabla ReportesError creada.';
END

-- B. Tabla de Exámenes Profesionales (Para constancia de exención)
IF OBJECT_ID('ExamenProfesional', 'U') IS NULL
BEGIN
    CREATE TABLE ExamenProfesional (
        ExamenID INT IDENTITY(1,1) PRIMARY KEY,
        AlumnoNombre NVARCHAR(100) NOT NULL,
        AlumnoNoControl NVARCHAR(20) NOT NULL,
        AlumnoCarrera NVARCHAR(100) NOT NULL,
        AlumnoClave NVARCHAR(20) NOT NULL,
        OpcionTitulacion NVARCHAR(200) NOT NULL,
        TituloProyecto NVARCHAR(300) NOT NULL,
        FechaExamen DATE NOT NULL,
        LugarCiudad NVARCHAR(50) DEFAULT 'Culiacán, Sinaloa',
        PresidenteID INT NOT NULL,
        SecretarioID INT NOT NULL,
        VocalID INT NOT NULL,
        CONSTRAINT FK_Examen_Presidente FOREIGN KEY (PresidenteID) REFERENCES Docente(DocenteID),
        CONSTRAINT FK_Examen_Secretario FOREIGN KEY (SecretarioID) REFERENCES Docente(DocenteID),
        CONSTRAINT FK_Examen_Vocal FOREIGN KEY (VocalID) REFERENCES Docente(DocenteID)
    );
    PRINT '   -> Tabla ExamenProfesional creada.';
END
GO

-- ===============================================================
-- 8. CORRECCIÓN DE 'IDENTITY' EN EXPEDIENTE Y CONVOCATORIA
-- (Necesario para que el botón 'Obtener' no falle al crear expedientes nuevos)
-- ===============================================================

-- Solo recreamos si no tienen IDENTITY (Revisión rápida: intentamos borrar y crear)
-- Primero quitamos la FK de Documentos para poder tocar Expediente
IF OBJECT_ID('FK_Documentos_Expediente', 'F') IS NOT NULL 
    ALTER TABLE Documentos DROP CONSTRAINT FK_Documentos_Expediente;

IF OBJECT_ID('Convocatoria', 'U') IS NOT NULL DROP TABLE Convocatoria;
IF OBJECT_ID('Expediente', 'U') IS NOT NULL DROP TABLE Expediente;

-- Re-creamos Expediente con IDENTITY
CREATE TABLE Expediente(
    ExpedienteID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StatusExp NVARCHAR(10) NOT NULL,
    FechaReg DATE NULL,
    DocenteID INT NOT NULL,
    CONSTRAINT FK_Expediente_Docente FOREIGN KEY (DocenteID) REFERENCES Docente(DocenteID)
);

-- Re-creamos Convocatoria con IDENTITY
CREATE TABLE Convocatoria(
    ConvID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ConvNombre NVARCHAR (50) NOT NULL,
    FechaInicioConv DATE NOT NULL,
    FechaFinConv DATE NOT NULL,
    StatusConv NVARCHAR (10) NOT NULL,
    DocenteID INT NOT NULL,
    ExpedienteID INT NOT NULL,
    CONSTRAINT FK_Convocatoria_Docente FOREIGN KEY (DocenteID) REFERENCES Docente(DocenteID),
    CONSTRAINT FK_Convocatoria_Expediente FOREIGN KEY (ExpedienteID) REFERENCES Expediente(ExpedienteID)
);

-- Restauramos la relación con Documentos
ALTER TABLE Documentos WITH CHECK 
ADD CONSTRAINT FK_Documentos_Expediente FOREIGN KEY (ExpedienteID) REFERENCES Expediente(ExpedienteID);

-- Reiniciamos contadores para estar seguros
DBCC CHECKIDENT ('Documentos', RESEED, 0);
PRINT '   -> Tablas Expediente y Convocatoria corregidas con IDENTITY.';
GO

-- ===============================================================
-- 9. NUEVOS DATOS DE PRUEBA (PARA VALIDACIONES)
-- ===============================================================

-- A. Actualizar a NORMA REBECA (ID 1) - La alumna estrella (Todo bien)
UPDATE Docente 
SET PromedioEvaluacion = 95.5, 
    PorcentajeAsistencia = 100 
WHERE DocenteID = 1;

-- B. Crear/Actualizar a VICTORIA (ID 2) - La faltista (85% Asistencia)
IF NOT EXISTS (SELECT * FROM Docente WHERE DocenteID = 2)
BEGIN
    INSERT INTO Docente (DocenteID, NombreDocente, DocenteApePat, DocenteApeMat, DocenteCorreo, DocenteStatus, RFCDocente, CedulaDocente, InstitucionID, DocentePassword, Registro, DepartamentoID, FechaIngreso, CategoriaActual, TipoPlaza, ClavePresupuestal, EfectosDesde) 
    VALUES (2, 'Victoria Adahi', 'Ontiveros', 'Ramos', 'victoria@itc.mx', 'Activo', 'ORVA200505MNO', '123456', 1, 'SOSpass', 'IT11B716', 2, '2020-01-01', 'ASOCIADO A', 'TIEMPO COMPLETO', 'E3817', '2023-01-01');
END
UPDATE Docente SET PromedioEvaluacion = 80.0, PorcentajeAsistencia = 85 WHERE DocenteID = 2;
--Fima docente

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Docente') AND name = 'FirmaDigital')
BEGIN
    ALTER TABLE Docente ADD FirmaDigital NVARCHAR(MAX) NULL;
    PRINT '✅ Columna FirmaDigital agregada a Docente.';
END
ELSE
BEGIN
    PRINT 'ℹ️ La columna FirmaDigital ya existía en Docente.';
END
GO 

USE TECNM;
GO
    


-- 1. Insertar el tipo de documento (ID 12, asumiendo que tenías 11)
INSERT INTO TiposDocumento (NombreVisible, NombreArchivoPDF, RequiereValidacion) 
VALUES ('Validación de Cédula Profesional', 'validacion_cedula.pdf', NULL);

-- 2. Configurar la ruta de firma (Se firma solo por el Docente)
DECLARE @TipoID INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Validación de Cédula Profesional');

INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES (@TipoID, 1, 'Docente');
GO
USE TECNM;
GO
--en caso que este falla quienes fimasn 
IF OBJECT_ID('Firma', 'U') IS NOT NULL DROP TABLE Firma;

-- 2. Crear la tabla FIRMA correctamente
CREATE TABLE Firma (
    FirmaID INT IDENTITY(1,1) PRIMARY KEY,
    FechaFirma DATE DEFAULT GETDATE(),
    DocumentoID INT NOT NULL,
    TipoFirmante NVARCHAR(50) NOT NULL, 
    FirmanteID INT NOT NULL, 
    FirmaImagen NVARCHAR(MAX) NULL,
    CONSTRAINT FK_Firma_Documento FOREIGN KEY (DocumentoID) REFERENCES Documentos(DocumentoID)
);

PRINT '✅ Tabla Firma recuperada exitosamente.';
GO


USE TECNM;
GO

-- 1. LIMPIEZA DE RUTAS VIEJAS
DELETE FROM RutaFirma;
DBCC CHECKIDENT ('RutaFirma', RESEED, 0);

-- 2. INSERCIÓN DE RUTAS CORREGIDAS
-- Nota: Usamos subconsultas para garantizar que el ID sea el correcto aunque cambie

-- A. CONSTANCIA LABORAL -> RH
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia Laboral'), 1, 'RH');

-- B. CONSTANCIA DE CVU -> Desarrollo Académico
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de CVU'), 1, 'DesarrolloAcademico');

-- C. CONSTANCIA DE TUTORÍA -> Desarrollo (1) -> Subdirección (2)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Tutoría'), 1, 'DesarrolloAcademico');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Tutoría'), 2, 'Subdireccion');

-- D. CONSTANCIA DE SERVICIOS ESCOLARES -> Servicios Escolares
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Servicios Escolares'), 1, 'ServiciosEscolares');

-- E. ACREDITACIÓN CONAIC -> Dirección
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Acreditación CONAIC'), 1, 'Direccion');

-- F. ESTRATEGIAS DIDÁCTICAS -> Jefe Depto (1) -> Presidente (2) -> Subdirección (3)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Estrategias Didácticas'), 1, 'JefaDepartamento');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Estrategias Didácticas'), 2, 'PresidenteAcademia');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Estrategias Didácticas'), 3, 'Subdireccion');

-- G. RECURSO EDUCATIVO -> (Igual que Estrategias)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Recurso Educativo Digital'), 1, 'JefaDepartamento');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Recurso Educativo Digital'), 2, 'PresidenteAcademia');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Recurso Educativo Digital'), 3, 'Subdireccion');

-- H. CRÉDITOS (MONITOR) -> Responsable Área (1) -> Subdirección (2)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Créditos (Monitor)'), 1, 'ResponsableArea');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Créditos (Monitor)'), 2, 'Subdireccion');

-- I. EXENCIÓN DE EXAMEN -> Servicios Escolares
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Exención de Examen Prof.'), 1, 'ServiciosEscolares');

-- J. CARGA ACADÉMICA (HORARIO) -> Jefe Depto (1) -> Subdirección (2)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Carga Académica (Horario)'), 1, 'JefaDepartamento');
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Carga Académica (Horario)'), 2, 'Subdireccion');

-- K. CARTA EXCLUSIVIDAD -> Docente (Aunque se auto-firma, definimos la ruta para que exista)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) 
VALUES ((SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Carta de Exclusividad Laboral'), 1, 'Docente');

PRINT '✅ Rutas de firma corregidas y verificadas.';
GO
GO
