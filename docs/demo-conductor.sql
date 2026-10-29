-- ============================================================================
-- TrackIt Express - Datos para probar el flujo del conductor contra el backend
-- ============================================================================
-- El backend todavía no crea la fila de Conductor al registrar un usuario con
-- rol 3 (brecha 1, flag conductorMe). Mientras tanto:
--
-- 1. Registra el conductor desde /registro (perfil "Conductor").
-- 2. Busca su id de usuario:
--      SELECT id_usuario, nombre, correo FROM Usuario WHERE correo = 'conductor@correo.co';
-- 3. Crea su fila en Conductor (ajusta el id_usuario):
INSERT INTO Conductor (id_usuario, estado_aprobacion)
VALUES (2, 'Aprobado')
RETURNING id_conductor;
-- 4. En src/environments/environment.development.ts, en demo.conductores, relaciona
--    ese id_usuario con el id_conductor devuelto:
--      conductores: [{ idUsuario: 2, idConductor: 1, estadoAprobacion: 'Aprobado' }]
--
-- Para probar el panel de aprobación con un conductor real, crea la fila con
-- estado 'Pendiente' y usa ese id_conductor en demo.conductores (el primer
-- postulante simulado toma ese id).
--
-- Administrador: el hash sembrado en seed.sql es de ejemplo y no corresponde a
-- "admin123". Crea uno por la API (el frontend no ofrece este rol):
--   curl -X POST http://localhost:3000/api/auth/register \
--     -H 'Content-Type: application/json' \
--     -d '{"nombre":"Administrador","correo":"admin@correo.co","password":"Clave1234","id_rol":1}'
