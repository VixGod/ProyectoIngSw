USE TECNM
GO

-- ===============================================================
-- NUEVA TABLA PARA REGISTRAR LOS EXÁMENES PROFESIONALES
-- ===============================================================
IF OBJECT_ID('ExamenProfesional', 'U') IS NOT NULL DROP TABLE ExamenProfesional;

CREATE TABLE ExamenProfesional (
    ExamenID INT IDENTITY(1,1) PRIMARY KEY,
    
    -- Datos del Alumno (Extraídos del documento)
    AlumnoNombre NVARCHAR(100) NOT NULL,    -- Ej: Benjamin Quintero Camacho
    AlumnoNoControl NVARCHAR(20) NOT NULL,  -- Ej: 17171459
    AlumnoCarrera NVARCHAR(100) NOT NULL,   -- Ej: Ingeniería en Sistemas Computacionales
    AlumnoClave NVARCHAR(20) NOT NULL,      -- Ej: 250IT00021
    
    -- Datos del Acto Académico
    OpcionTitulacion NVARCHAR(200) NOT NULL,-- Ej: Titulación Integral: Informe Técnico...
    TituloProyecto NVARCHAR(300) NOT NULL,  -- Ej: "Medio de pago externo..."
    FechaExamen DATE NOT NULL,              -- Ej: 2024-06-21
    LugarCiudad NVARCHAR(50) DEFAULT 'Culiacán, Sinaloa',

    -- El Jurado (Vínculos a los Docentes existentes)
    -- IMPORTANTE: Un mismo examen involucra a 3 docentes distintos
    PresidenteID INT NOT NULL,
    SecretarioID INT NOT NULL,
    VocalID INT NOT NULL,

    -- Restricciones (Foreign Keys) para asegurar que los jurados sean docentes válidos
    CONSTRAINT FK_Examen_Presidente FOREIGN KEY (PresidenteID) REFERENCES Docente(DocenteID),
    CONSTRAINT FK_Examen_Secretario FOREIGN KEY (SecretarioID) REFERENCES Docente(DocenteID),
    CONSTRAINT FK_Examen_Vocal FOREIGN KEY (VocalID) REFERENCES Docente(DocenteID),

    -- Validación opcional: Evitar que el mismo docente tenga 2 roles en el mismo examen
    CONSTRAINT CHK_JuradoDistinto CHECK (PresidenteID <> SecretarioID AND PresidenteID <> VocalID AND SecretarioID <> VocalID)
);
GO

USE TECNM;
GO

-- 1. Creamos un tercer docente rápido para completar el jurado
IF NOT EXISTS (SELECT * FROM Docente WHERE DocenteID = 3)
BEGIN
    INSERT INTO Docente (DocenteID, NombreDocente, DocenteApePat, DocenteApeMat, DocenteCorreo, DocenteStatus, RFCDocente, CedulaDocente, InstitucionID, DocentePassword, Registro, DepartamentoID, FechaIngreso, CategoriaActual, TipoPlaza, ClavePresupuestal, EfectosDesde)
    VALUES (3, 'Jorge Luis', 'Leal', 'Rendon', 'jleal@itc.mx', 'Activo', 'LERJ800101XXX', '5168880', 1, 'passJorge', 'IT10B123', 1, '2010-01-01', 'PROFESOR ASOCIADO "C"', 'TIEMPO COMPLETO', 'ClaveEjemplo', '2023-01-01');
END
GO

-- 2. Insertamos el Examen Profesional (Basado en la imagen)
INSERT INTO ExamenProfesional 
(AlumnoNombre, AlumnoNoControl, AlumnoCarrera, AlumnoClave, OpcionTitulacion, TituloProyecto, FechaExamen, PresidenteID, SecretarioID, VocalID)
VALUES
(
    'Benjamin Quintero Camacho',      -- Alumno
    '17171459',                       -- No Control
    'Ingeniería en Sistemas Comp.',   -- Carrera
    '250IT00021',                     -- Clave
    'Titulación Integral: Informe Técnico de Residencia Profesional', -- Opción
    '"Medio de pago externo para BAPRO como canal de abonos..."',      -- Título Proyecto
    '2024-06-21',                     -- Fecha
    1, -- Presidente: Norma Rebeca (ID 1)
    3, -- Secretario: Jorge Luis Leal (ID 3)
    2  -- Vocal: Victoria Adahi (ID 2)
);
GO

-- Verificamos
-- SELECT * FROM ExamenProfesional;

-- ¿En qué exámenes ha participado Norma (ID 1)?
SELECT * FROM ExamenProfesional 
WHERE PresidenteID = 1 OR SecretarioID = 1 OR VocalID = 1





USE TECNM;
GO

-- 1. Primero borramos la ruta asociada (si existe)
DELETE FROM RutaFirma 
WHERE TipoID IN (SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Constancia de Exención de Examen Prof.');

-- 2. Ahora sí, borramos el documento del catálogo
DELETE FROM TiposDocumento 
WHERE NombreVisible = 'Constancia de Exención de Examen Prof.';

-- 3. Verificamos que ya no aparezca (Deberías ver solo los otros 10)
SELECT * FROM TiposDocumento;
GO



USE TECNM
GO

-- ==============================================================================
-- 1. CAMBIO EN "CONSTANCIA DE TUTORÍA"
-- Requerimiento: Debe firmar Desarrollo Académico Y Subdirección
-- ==============================================================================

-- Obtenemos el ID del documento
DECLARE @IdTutoria INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible LIKE '%Tutoría%');

-- Borramos la ruta vieja (que solo tenía a Desarrollo)
DELETE FROM RutaFirma WHERE TipoID = @IdTutoria;

-- Insertamos la nueva ruta secuencial (1. Desarrollo -> 2. Subdirección)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES 
(@IdTutoria, 1, 'DesarrolloAcademico'),
(@IdTutoria, 2, 'Subdireccion');

PRINT '✅ Ruta de Tutoría actualizada (Desarrollo -> Subdirección)';


-- ==============================================================================
-- 2. CAMBIO EN "CARTA DE EXCLUSIVIDAD LABORAL"
-- Requerimiento: Solo lo firma el Docente (No RH)
-- ==============================================================================

DECLARE @IdExclusividad INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible LIKE '%Exclusividad%');

-- Borramos la ruta vieja (RH)
DELETE FROM RutaFirma WHERE TipoID = @IdExclusividad;

-- Insertamos la nueva ruta (Docente)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES 
(@IdExclusividad, 1, 'Docente');

PRINT '✅ Ruta de Exclusividad actualizada (Solo Docente)';


-- ==============================================================================
-- 3. CAMBIO EN "ACREDITACIÓN CONAIC"
-- Requerimiento: Lo firma el Presidente de CONAIC (Nuevo Rol)
-- ==============================================================================

-- A. Crear la tabla para este nuevo rol (Si no existe)
IF OBJECT_ID('PresidenteCONAIC', 'U') IS NULL
BEGIN
    CREATE TABLE PresidenteCONAIC (
        ConaicID INT IDENTITY(1,1) PRIMARY KEY,
        NombreTitular NVARCHAR(30) NOT NULL,
        ApePatTitular NVARCHAR(20) NOT NULL,
        ApeMatTitular NVARCHAR(20) NULL,
        RFCTitular NVARCHAR(13) NOT NULL,
        TitularPassword NVARCHAR(10) NOT NULL,
        FirmaDigital NVARCHAR(MAX) NULL -- Para guardar su firma en base64
    );
    
    -- Insertamos un Presidente de prueba
    INSERT INTO PresidenteCONAIC (NombreTitular, ApePatTitular, ApeMatTitular, RFCTitular, TitularPassword)
    VALUES ('Francisco Javier', 'Alvarez', 'Rodriguez', 'CARL909090CON', 'admin123');
    
    PRINT '✅ Tabla PresidenteCONAIC creada.';
END

-- B. Actualizar la restricción (Constraint) en la tabla FIRMA
-- Esto es necesario para que la BD permita guardar 'PresidenteCONAIC' en la columna TipoFirmante
BEGIN TRY
    ALTER TABLE Firma DROP CONSTRAINT CHK_TipoFirmante;
END TRY
BEGIN CATCH
    -- Si no existe, ignoramos el error
END CATCH

ALTER TABLE Firma ADD CONSTRAINT CHK_TipoFirmante 
CHECK (TipoFirmante IN ('RH', 'ServiciosEscolares', 'DesarrolloAcademico', 'PresidenteAcademia', 'Direccion', 'Docente', 'Subdireccion', 'JefaDepartamento', 'ResponsableArea', 'PresidenteCONAIC'));

PRINT '✅ Constraint de Firmas actualizado.';

-- C. Actualizar la Ruta del Documento
DECLARE @IdConaic INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible LIKE '%CONAIC%');

DELETE FROM RutaFirma WHERE TipoID = @IdConaic;

INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES 
(@IdConaic, 1, 'PresidenteCONAIC');

PRINT '✅ Ruta de CONAIC actualizada (PresidenteCONAIC)';
GO

--==============================================================================
-- 4. CAMBIO: "CARGA ACADÉMICA" -> "HORARIOS DE LABORES"
-- Requerimiento: Cambiar nombre y que firmen Docente y Dirección
-- ==============================================================================

-- A. Actualizar el nombre en la tabla de Tipos
UPDATE TiposDocumento 
SET NombreVisible = 'Horarios de labores' 
WHERE NombreVisible = 'Carga Académica (Horario)';

-- B. Actualizar la Ruta de Firma
DECLARE @IdHorarios INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Horarios de labores');

-- Borrar ruta anterior (Jefa Depto)
DELETE FROM RutaFirma WHERE TipoID = @IdHorarios;

-- Insertar nueva ruta (1. Docente -> 2. Dirección)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES 
(@IdHorarios, 1, 'Docente'),
(@IdHorarios, 2, 'Direccion');

PRINT '✅ Documento "Horarios de labores" actualizado (Docente -> Dirección)';


-- ==============================================================================
-- 5. NUEVO: "ASIGNATURAS DE LICENCIATURAS"
-- Requerimiento: Agregar documento y que firmen Docente y Dirección
-- ==============================================================================

-- A. Insertar el nuevo documento (Si no existe)
IF NOT EXISTS (SELECT 1 FROM TiposDocumento WHERE NombreVisible = 'Asignaturas de licenciaturas')
BEGIN
    INSERT INTO TiposDocumento (NombreVisible, NombreArchivoPDF, RequiereValidacion) 
    VALUES ('Asignaturas de licenciaturas', 'asignaturas_licenciaturas.pdf', 'Grupo'); -- 'Grupo' para validar que tenga carga académica
    
    PRINT '✅ Documento "Asignaturas de licenciaturas" creado.';
END

-- B. Configurar su Ruta de Firma
DECLARE @IdAsignaturas INT = (SELECT TipoID FROM TiposDocumento WHERE NombreVisible = 'Asignaturas de licenciaturas');

-- Limpieza preventiva
DELETE FROM RutaFirma WHERE TipoID = @IdAsignaturas;

-- Ruta (1. Docente -> 2. Dirección)
INSERT INTO RutaFirma (TipoID, Orden, RolResponsable) VALUES 
(@IdAsignaturas, 1, 'Docente'),
(@IdAsignaturas, 2, 'Direccion');

PRINT '✅ Ruta de "Asignaturas de licenciaturas" configurada (Docente -> Dirección)';
GO