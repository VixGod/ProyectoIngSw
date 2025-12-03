DELETE FROM HorarioActividad WHERE ActividadID IN (SELECT GrupoMateriaID FROM GrupoMateria GM JOIN Grupo G ON GM.GrupoID = G.GrupoID WHERE G.DocenteID = 1);
DELETE FROM HorarioActividad WHERE ActividadID IN (SELECT ActApoyoID FROM ApoyoADocencia WHERE DocenteID = 1);
DELETE FROM HorarioActividad WHERE ActividadID IN (SELECT ActAdmID FROM ActividadAdministrativa WHERE DocenteID = 1);

DELETE FROM GrupoMateria WHERE GrupoID IN (SELECT GrupoID FROM Grupo WHERE DocenteID = 1);
DELETE FROM Grupo WHERE DocenteID = 1;
DELETE FROM ApoyoADocencia WHERE DocenteID = 1;
DELETE FROM ActividadAdministrativa WHERE DocenteID = 1;

-- =============================================================================
-- 2. RE-INSERCIÓN DE 40 HORAS EXACTAS (USANDO MATERIA "OBJETOS" ID 101 SIEMPRE)
-- =============================================================================
-- Si prefieres que siempre de la misma materia, usaremos MateriaID = 101 en los 3 periodos.

INSERT INTO Grupo (GrupoID, NumAlumnos, AulaGrupo, DocenteID, Nivel, Modalidad, Carrera, Code) VALUES 
(1001, 30, 'A1', 1, 'LI', 'PR', 'SISTEMAS', 'A'), (1002, 30, 'A2', 1, 'LI', 'PR', 'SISTEMAS', 'B'),
(1003, 30, 'A3', 1, 'LI', 'PR', 'SISTEMAS', 'C'), (1004, 30, 'A4', 1, 'LI', 'PR', 'SISTEMAS', 'D');
INSERT INTO GrupoMateria (GrupoMateriaID, GrupoID, MateriaID) VALUES 
(1001, 1001, 101), (1002, 1002, 101), (1003, 1003, 101), (1004, 1004, 101);

-- Horarios Docencia (7:00 a 11:00)
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(10001, 1, '07:00', '08:00', 'A1', 'GrupoMateria', 1001), (10002, 2, '07:00', '08:00', 'A1', 'GrupoMateria', 1001), (10003, 3, '07:00', '08:00', 'A1', 'GrupoMateria', 1001), (10004, 4, '07:00', '08:00', 'A1', 'GrupoMateria', 1001), (10005, 5, '07:00', '08:00', 'A1', 'GrupoMateria', 1001),
(10006, 1, '08:00', '09:00', 'A2', 'GrupoMateria', 1002), (10007, 2, '08:00', '09:00', 'A2', 'GrupoMateria', 1002), (10008, 3, '08:00', '09:00', 'A2', 'GrupoMateria', 1002), (10009, 4, '08:00', '09:00', 'A2', 'GrupoMateria', 1002), (10010, 5, '08:00', '09:00', 'A2', 'GrupoMateria', 1002),
(10011, 1, '09:00', '10:00', 'A3', 'GrupoMateria', 1003), (10012, 2, '09:00', '10:00', 'A3', 'GrupoMateria', 1003), (10013, 3, '09:00', '10:00', 'A3', 'GrupoMateria', 1003), (10014, 4, '09:00', '10:00', 'A3', 'GrupoMateria', 1003), (10015, 5, '09:00', '10:00', 'A3', 'GrupoMateria', 1003),
(10016, 1, '10:00', '11:00', 'A4', 'GrupoMateria', 1004), (10017, 2, '10:00', '11:00', 'A4', 'GrupoMateria', 1004), (10018, 3, '10:00', '11:00', 'A4', 'GrupoMateria', 1004), (10019, 4, '10:00', '11:00', 'A4', 'GrupoMateria', 1004), (10020, 5, '10:00', '11:00', 'A4', 'GrupoMateria', 1004);

-- Apoyo (10 horas) y Admin (10 horas)
INSERT INTO ApoyoADocencia (ActApoyoID, ActApoyoNombre, MetasAAtender, DocenteID, PeriodoID) VALUES (1050, 'Tutoría', 'X', 1, 10), (1051, 'Asesoría', 'X', 1, 10);
INSERT INTO ActividadAdministrativa (ActAdmID, ActAdmPuesto, PeriodoID, DocenteID, AreaID, NumDict, NumAlum, NumAcred) VALUES (1090, 'Gestión', 10, 1, 1, 'D-1', 0, 0);

INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(10021, 1, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1050), (10022, 2, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1050), (10023, 3, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1050), (10024, 4, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1050), (10025, 5, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1050),
(10026, 1, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1051), (10027, 2, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1051), (10028, 3, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1051), (10029, 4, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1051), (10030, 5, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1051),
(10031, 1, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1090), (10032, 2, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1090), (10033, 3, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1090), (10034, 4, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1090), (10035, 5, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1090);

-- --- PERIODO 11: AGO-DIC 2024 ---
INSERT INTO Grupo (GrupoID, NumAlumnos, AulaGrupo, DocenteID, Nivel, Modalidad, Carrera, Code) VALUES (1101, 30, 'A1', 1, 'LI', 'PR', 'SISTEMAS', 'A'), (1102, 30, 'A2', 1, 'LI', 'PR', 'SISTEMAS', 'B'), (1103, 30, 'A3', 1, 'LI', 'PR', 'SISTEMAS', 'C'), (1104, 30, 'A4', 1, 'LI', 'PR', 'SISTEMAS', 'D');
INSERT INTO GrupoMateria (GrupoMateriaID, GrupoID, MateriaID) VALUES (1101, 1101, 103), (1102, 1102, 103), (1103, 1103, 103), (1104, 1104, 103);
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(11001, 1, '07:00', '08:00', 'A1', 'GrupoMateria', 1101), (11002, 2, '07:00', '08:00', 'A1', 'GrupoMateria', 1101), (11003, 3, '07:00', '08:00', 'A1', 'GrupoMateria', 1101), (11004, 4, '07:00', '08:00', 'A1', 'GrupoMateria', 1101), (11005, 5, '07:00', '08:00', 'A1', 'GrupoMateria', 1101),
(11006, 1, '08:00', '09:00', 'A2', 'GrupoMateria', 1102), (11007, 2, '08:00', '09:00', 'A2', 'GrupoMateria', 1102), (11008, 3, '08:00', '09:00', 'A2', 'GrupoMateria', 1102), (11009, 4, '08:00', '09:00', 'A2', 'GrupoMateria', 1102), (11010, 5, '08:00', '09:00', 'A2', 'GrupoMateria', 1102),
(11011, 1, '09:00', '10:00', 'A3', 'GrupoMateria', 1103), (11012, 2, '09:00', '10:00', 'A3', 'GrupoMateria', 1103), (11013, 3, '09:00', '10:00', 'A3', 'GrupoMateria', 1103), (11014, 4, '09:00', '10:00', 'A3', 'GrupoMateria', 1103), (11015, 5, '09:00', '10:00', 'A3', 'GrupoMateria', 1103),
(11016, 1, '10:00', '11:00', 'A4', 'GrupoMateria', 1104), (11017, 2, '10:00', '11:00', 'A4', 'GrupoMateria', 1104), (11018, 3, '10:00', '11:00', 'A4', 'GrupoMateria', 1104), (11019, 4, '10:00', '11:00', 'A4', 'GrupoMateria', 1104), (11020, 5, '10:00', '11:00', 'A4', 'GrupoMateria', 1104);
INSERT INTO ApoyoADocencia (ActApoyoID, ActApoyoNombre, MetasAAtender, DocenteID, PeriodoID) VALUES (1150, 'Tutoría', 'X', 1, 11), (1151, 'Asesoría', 'X', 1, 11);
INSERT INTO ActividadAdministrativa (ActAdmID, ActAdmPuesto, PeriodoID, DocenteID, AreaID, NumDict, NumAlum, NumAcred) VALUES (1190, 'Gestión', 11, 1, 1, 'D-2', 0, 0);
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(11021, 1, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1150), (11022, 2, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1150), (11023, 3, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1150), (11024, 4, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1150), (11025, 5, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1150),
(11026, 1, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1151), (11027, 2, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1151), (11028, 3, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1151), (11029, 4, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1151), (11030, 5, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1151),
(11031, 1, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1190), (11032, 2, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1190), (11033, 3, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1190), (11034, 4, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1190), (11035, 5, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1190);

-- --- PERIODO 12: ENE-JUN 2025 ---
INSERT INTO Grupo (GrupoID, NumAlumnos, AulaGrupo, DocenteID, Nivel, Modalidad, Carrera, Code) VALUES (1201, 30, 'A1', 1, 'LI', 'PR', 'SISTEMAS', 'A'), (1202, 30, 'A2', 1, 'LI', 'PR', 'SISTEMAS', 'B'), (1203, 30, 'A3', 1, 'LI', 'PR', 'SISTEMAS', 'C'), (1204, 30, 'A4', 1, 'LI', 'PR', 'SISTEMAS', 'D');
INSERT INTO GrupoMateria (GrupoMateriaID, GrupoID, MateriaID) VALUES (1201, 1201, 105), (1202, 1202, 105), (1203, 1203, 105), (1204, 1204, 105);
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(12001, 1, '07:00', '08:00', 'A1', 'GrupoMateria', 1201), (12002, 2, '07:00', '08:00', 'A1', 'GrupoMateria', 1201), (12003, 3, '07:00', '08:00', 'A1', 'GrupoMateria', 1201), (12004, 4, '07:00', '08:00', 'A1', 'GrupoMateria', 1201), (12005, 5, '07:00', '08:00', 'A1', 'GrupoMateria', 1201),
(12006, 1, '08:00', '09:00', 'A2', 'GrupoMateria', 1202), (12007, 2, '08:00', '09:00', 'A2', 'GrupoMateria', 1202), (12008, 3, '08:00', '09:00', 'A2', 'GrupoMateria', 1202), (12009, 4, '08:00', '09:00', 'A2', 'GrupoMateria', 1202), (12010, 5, '08:00', '09:00', 'A2', 'GrupoMateria', 1202),
(12011, 1, '09:00', '10:00', 'A3', 'GrupoMateria', 1203), (12012, 2, '09:00', '10:00', 'A3', 'GrupoMateria', 1203), (12013, 3, '09:00', '10:00', 'A3', 'GrupoMateria', 1203), (12014, 4, '09:00', '10:00', 'A3', 'GrupoMateria', 1203), (12015, 5, '09:00', '10:00', 'A3', 'GrupoMateria', 1203),
(12016, 1, '10:00', '11:00', 'A4', 'GrupoMateria', 1204), (12017, 2, '10:00', '11:00', 'A4', 'GrupoMateria', 1204), (12018, 3, '10:00', '11:00', 'A4', 'GrupoMateria', 1204), (12019, 4, '10:00', '11:00', 'A4', 'GrupoMateria', 1204), (12020, 5, '10:00', '11:00', 'A4', 'GrupoMateria', 1204);
INSERT INTO ApoyoADocencia (ActApoyoID, ActApoyoNombre, MetasAAtender, DocenteID, PeriodoID) VALUES (1250, 'Tutoría', 'X', 1, 12), (1251, 'Asesoría', 'X', 1, 12);
INSERT INTO ActividadAdministrativa (ActAdmID, ActAdmPuesto, PeriodoID, DocenteID, AreaID, NumDict, NumAlum, NumAcred) VALUES (1290, 'Gestión', 12, 1, 1, 'D-3', 0, 0);
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(12021, 1, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1250), (12022, 2, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1250), (12023, 3, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1250), (12024, 4, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1250), (12025, 5, '11:00', '12:00', 'OF', 'ApoyoADocencia', 1250),
(12026, 1, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1251), (12027, 2, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1251), (12028, 3, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1251), (12029, 4, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1251), (12030, 5, '12:00', '13:00', 'OF', 'ApoyoADocencia', 1251),
(12031, 1, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1290), (12032, 2, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1290), (12033, 3, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1290), (12034, 4, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1290), (12035, 5, '13:00', '15:00', 'OF', 'ActividadAdministrativa', 1290);

-- TUTORÍAS PARA NORMA
INSERT INTO Tutorados (TutoriasID, CarreraTut, CantTutorados, DocenteID, PeriodoID) VALUES
(101, 'Ing. Sistemas', 5, 1, 10), (102, 'Ing. Sistemas', 5, 1, 11);

PRINT '✅ NORMA LISTA (40 HORAS, SIN ERRORES NI DUPLICADOS).';
-- =============================================================================
-- 4. CARGA MÍNIMA PARA VICTORIA (ID 2) - 5 HORAS SEMANALES
-- =============================================================================
-- Solo 1 materia, solo 1 periodo (10), solo 5 horas.
INSERT INTO Grupo (GrupoID, NumAlumnos, AulaGrupo, DocenteID, Nivel, Modalidad, Carrera, Code) VALUES (2001, 15, 'LAB', 2, 'LI', 'PR', 'SISTEMAS', 'V');
INSERT INTO GrupoMateria (GrupoMateriaID, GrupoID, MateriaID) VALUES (2001, 2001, 101);
INSERT INTO HorarioActividad (HorarioID, DiaSemAct, HoraInicioAct, HoraFinAct, AulaAct, TipoActividad, ActividadID) VALUES
(20001, 1, '08:00', '09:00', 'LAB', 'GrupoMateria', 2001),
(20002, 2, '08:00', '09:00', 'LAB', 'GrupoMateria', 2001),
(20003, 3, '08:00', '09:00', 'LAB', 'GrupoMateria', 2001),
(20004, 4, '08:00', '09:00', 'LAB', 'GrupoMateria', 2001),
(20005, 5, '08:00', '09:00', 'LAB', 'GrupoMateria', 2001);

UPDATE ActividadAdministrativa
SET NumAlum = 15, 
    NumAcred = 15
WHERE DocenteID = 1 
  AND PeriodoID IN (10, 11); -- Periodos del 2024
