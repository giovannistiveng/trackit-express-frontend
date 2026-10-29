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

- Node.js 22.12 o superior (lo pide el escáner de SonarQube; Angular funciona desde 20.19)
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
| `npm run sonar`         | Análisis de SonarQube (ver abajo)                                                              |

## Configuración

`src/environments/environment.development.ts` (desarrollo) y `environment.ts` (producción):

| Clave        | Uso                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------- |
| `apiBaseUrl` | URL base de la API. Desarrollo: `http://localhost:3000/api`. Producción: `/api` (ver abajo) |
| `logs`       | `nivelMinimo`, `enviarAlServidor`, `consola`                                                |

Todo el frontend habla con el backend real: no hay datos simulados.

## Probar de punta a punta

1. En `trackit-express-backend`: `npm install`, copiar `.env.example` a `.env`, `npm run db:setup` (o `npm run db:migrate` si la base ya existía) y `npm run dev`.
2. En este repositorio: `npm start` y abre http://localhost:4200.
3. Registra un cliente y un conductor desde `/registro`. El administrador viene en la semilla: `admin@trackit.com.co` / `Admin2026*` (cámbiala en producción).
4. Recorrido: el conductor registra su vehículo y documentos → el administrador lo aprueba → el cliente cotiza y crea el envío → el conductor lo acepta, inicia la ruta y comparte su ubicación → el cliente lo sigue en el mapa → el conductor entrega con PIN y foto → el cliente califica.

## Estructura

```
src/app/
├── core/
│   ├── domain/        Modelos y reglas puras (validadores, transiciones, JWT)
│   ├── ports/         Contratos (clases abstractas usadas como tokens)
│   ├── adapters/
│   │   ├── http/      Adaptadores del backend (único lugar con snake_case)
│   │   └── local/     Almacenamiento del navegador y cola de ubicaciones sin conexión
│   ├── auth/          Sesión, guards, interceptor de autenticación
│   ├── http/          Interceptor de errores/tiempo/reintento, ApiError, traductor de mensajes
│   ├── logging/       LoggerService (logs al backend), ErrorHandler global
│   └── config/        Configuración y registro de adaptadores
├── shared/            UI (modal, toasts, estrellas, teclado PIN, carga de archivo, placa), pipes, utilidades
├── layout/            Shell por rol, banner sin conexión, 404
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
Nunca se registran contraseñas, PIN, tokens ni cuerpos de peticiones.

## Calidad con SonarQube

1. Levanta SonarQube (Docker): `docker run -d --name sonarqube -p 9000:9000 sonarqube:community`
2. Entra a http://localhost:9000 (admin/admin), crea el proyecto `trackit-express-frontend` y genera un token.
3. Ejecuta:
   ```bash
   npm run test:coverage
   npm run sonar -- -Dsonar.host.url=http://localhost:9000 -Dsonar.token=TU_TOKEN
   ```

## Despliegue

1. `npm ci && npm run build`. El resultado queda en `dist/trackit-express-frontend/browser`.
2. Sírvelo como sitio estático con _fallback_ a `index.html` (rutas de Angular) y HTTPS (lo exige el Service Worker y la geolocalización).
3. La compilación de producción llama a `/api`: publica el backend en el mismo dominio (proxy inverso de `/api` y `/uploads` al backend) o cambia `apiBaseUrl` en `src/environments/environment.ts` por la URL pública de la API y agrega el dominio del frontend a `CORS_ORIGINS` del backend.

## Documentación

- [docs/decisiones.md](docs/decisiones.md): contradicciones entre documentos y backend, y cómo se resolvieron
- Contrato de la API: Swagger del backend en `http://localhost:3000/api/docs`

## Ramas

- `main`: producción estable
- `pre-produccion`: staging
- `desarrollo`: trabajo diario
