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
('Constancia Laboral', 'constancia_laboral.pdf', NULL),                                     -- 1
('Constancia de Tutoría', 'constancia_tutoria.pdf', 'Tutorados'),                             -- 2
('Constancia de Estrategias Didácticas', 'constancia_estrategias.pdf', 'Grupo'),              -- 3
('Constancia de Recurso Educativo Digital', 'constancia_recurso_digital.pdf', 'Grupo'),       -- 4
('Constancia de Créditos (Monitor)', 'constancia_creditos_monitor.pdf', 'Administrativa'),    -- 5
('Constancia de Exención de Examen Prof.', 'constancia_exencion_examen.pdf', NULL),           -- 6
('Carga Académica (Horario)', 'carga_academica.pdf', 'Grupo'),                                -- 7
('Carta de Exclusividad Laboral', 'carta_exclusividad.pdf', NULL),                            -- 8
('Acreditación CONAIC', 'acreditacion_conaic.pdf', NULL),                                     -- 9
('Constancia de CVU', 'constancia_cvu.pdf', NULL),                                            -- 10
('Constancia de Servicios Escolares', 'constancia_servicios.pdf', NULL);                      -- 11

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
