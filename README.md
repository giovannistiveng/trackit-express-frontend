# TrackIt Express - Frontend

PWA de TrackIt Express para clientes, conductores y administradores: envíos y mandados en
Fusagasugá y alrededores, con cotización por zona, seguimiento y PIN de entrega.

## Stack

- Angular 21.2 (componentes standalone, signals, zoneless, control de flujo `@if`/`@for`)
- TypeScript estricto, ESLint (angular-eslint) y Prettier
- Tailwind CSS 4
- PWA con Angular Service Worker
- Leaflet + teselas de OpenStreetMap
- LocalForage para colas y cachés sin conexión
- Vitest + jsdom para pruebas unitarias

## Requisitos

- Node.js 20.19 o superior (probado con Node 22)
- El backend `trackit-express-backend` corriendo en `http://localhost:3000`

## Instalación y arranque

```bash
npm install
npm start            # http://localhost:4200
```

Scripts:

| Script                  | Qué hace                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `npm start`             | Servidor de desarrollo                                                                         |
| `npm run build`         | Compilación de producción en `dist/` (con Service Worker)                                      |
| `npm test`              | Pruebas unitarias                                                                              |
| `npm run test:coverage` | Pruebas con cobertura y umbrales (80 % global, 75 % ramas, 90 % en dominio y adaptadores HTTP) |
| `npm run lint`          | Linter                                                                                         |

## Configuración

`src/environments/environment.development.ts` (desarrollo) y `environment.ts` (producción):

| Clave              | Uso                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `apiBaseUrl`       | URL base de la API (por defecto `http://localhost:3000/api`)                                   |
| `features`         | Un flag por brecha del backend. Ver [docs/brechas-backend.md](docs/brechas-backend.md)         |
| `cloudinary`       | `cloudName` y `uploadPreset` **sin firma** para subir la foto de entrega. Vacío = URL simulada |
| `logs`             | `nivelMinimo`, `enviarAlServidor`, `consola`                                                   |
| `demo.conductores` | Relación usuario → conductor mientras no exista `GET /api/conductores/me`                      |

## Probar contra el backend real

1. En `trackit-express-backend`: `npm install`, copiar `.env.example` a `.env`, crear la base de datos, ejecutar `database/schema.sql` y `database/seed.sql`, y `npm run dev`.
2. En este repositorio: `npm start`.
3. Registra un cliente y un conductor desde `/registro`.
4. Crea la fila del conductor y relaciónala en `environment.development.ts` siguiendo [docs/demo-conductor.sql](docs/demo-conductor.sql). Ahí también está cómo crear un administrador.

Recorrido completo probado: registro → cotización → envío con PIN → tablero del conductor →
aceptar → entrega con PIN y foto → calificación → historial, y panel de administración.

## Estructura

```
src/app/
├── core/
│   ├── domain/        Modelos y reglas puras (validadores, transiciones, JWT)
│   ├── ports/         Contratos (clases abstractas usadas como tokens)
│   ├── adapters/
│   │   ├── http/      Backend real y contratos propuestos (único lugar con snake_case)
│   │   ├── mock/      Simulados en memoria con datos semilla
│   │   └── local/     LocalForage: caché de envíos, colas, calificados, sondeo del tablero
│   ├── auth/          Sesión, guards, interceptor de autenticación
│   ├── http/          Interceptor de errores/tiempo/reintento, ApiError, traductor de mensajes
│   ├── logging/       LoggerService (logs al backend), ErrorHandler global
│   └── config/        Flags y elección de adaptadores
├── shared/            UI (modal, toasts, estrellas, teclado PIN, carga de archivo, placa), pipes, utilidades
├── layout/            Shell por rol, banner sin conexión, insignia Modo demo, 404
└── features/
    ├── auth/          CU-001 Registro, CU-002 Login
    ├── cliente/       CU-005, CU-006, CU-008, CU-010, historial
    ├── conductor/     CU-003, CU-004, CU-007, CU-008, CU-009
    └── admin/         CU-011, métricas y auditoría
src/testing/           Dobles, fixtures (Apéndice A) y helpers de pruebas
```

## Rutas

| Ruta                                   | Rol           | Caso de uso    |
| -------------------------------------- | ------------- | -------------- |
| `/login`, `/registro`                  | Público       | CU-002, CU-001 |
| `/cliente/nuevo-envio`                 | Cliente       | CU-005, CU-006 |
| `/cliente/envios`                      | Cliente       | E6-HU2         |
| `/cliente/envios/:id`                  | Cliente       | CU-008, CU-010 |
| `/conductor/perfil`                    | Conductor     | CU-003, CU-004 |
| `/conductor/tablero`                   | Conductor     | CU-007         |
| `/conductor/servicio/:id`              | Conductor     | CU-008, CU-009 |
| `/admin/conductores`                   | Administrador | CU-011         |
| `/admin/dashboard`, `/admin/auditoria` | Administrador | E7-HU2         |

## Logs

Los eventos del frontend (errores no capturados, fallos HTTP, acciones clave) se envían por
lotes a `POST /api/logs/frontend` y el backend los guarda en `logs/frontend-AAAA-MM-DD.txt`.
Nunca se registran contraseñas, PIN, tokens ni cuerpos de peticiones. En desarrollo, la
insignia **Modo demo** ofrece "Descargar log (.txt)".

## Documentación

- [docs/brechas-backend.md](docs/brechas-backend.md): los 12 flags, su contrato propuesto y qué pantalla depende de cada uno
- [docs/decisiones.md](docs/decisiones.md): contradicciones resueltas y supuestos
- [docs/demo-conductor.sql](docs/demo-conductor.sql): datos para probar el rol conductor y crear un administrador

## Ramas

- `main`: producción estable
- `pre-produccion`: staging
- `desarrollo`: trabajo diario
