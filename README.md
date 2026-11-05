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
| `npm run lint`          | ESLint (reglas de SonarJS) + verificación de la arquitectura hexagonal                         |
| `npm run lint:sonar`    | Reporte de ESLint en `reports/eslint.json` para SonarQube                                      |
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
│   ├── domain/        Modelos y reglas puras (validadores, transiciones, JWT): sin Angular
│   ├── ports/         Contratos (clases abstractas usadas como tokens): API, eventos en vivo, push, logs…
│   ├── adapters/
│   │   ├── http/      Adaptadores del backend (único lugar con snake_case)
│   │   ├── sse/       EventosSseAdapter: avisos, chat y cambios de envío en vivo
│   │   ├── push/      PushHibridoAdapter: Web Push y Firebase (Capacitor)
│   │   └── local/     Almacenamiento del navegador
│   ├── auth/          Sesión, guards, interceptor de autenticación
│   ├── http/          Interceptor de errores/tiempo/reintento, ApiError, traductor de mensajes
│   ├── logging/       LoggerService (logs al backend), ErrorHandler global
│   └── config/        app-config y ports.providers (qué adaptador implementa cada puerto)
├── shared/            UI (modal, toasts, mapa, estado de carga, PIN, placa), pipes, utilidades
├── layout/            Shell por rol, sincronización de sesión, banner sin conexión, 404
└── features/          Pantallas por rol (auth, cliente, conductor, admin, público); solo usan puertos
src/testing/           Dobles, fixtures (Apéndice A) y helpers de pruebas
```

Reglas de dependencia (las verifica `scripts/verificar-arquitectura.mjs` en cada `npm run lint`):
`domain` no importa nada; `ports` solo dominio, rxjs y señales; `features`, `layout` y `shared` nunca
importan adaptadores; solo `app.config` usa `ports.providers`.

## Rutas

| Ruta                                                                 | Rol                  | Caso de uso                                              |
| -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `/login`, `/registro`                                                | Público              | CU-002, CU-001                                           |
| `/cliente/nuevo-envio`                                               | Cliente              | CU-005, CU-006                                           |
| `/cliente/envios`                                                    | Cliente              | E6-HU2                                                   |
| `/cliente/envios/:id`                                                | Cliente              | CU-008, CU-010                                           |
| `/conductor/perfil`                                                  | Conductor            | CU-003, CU-004                                           |
| `/conductor/tablero`                                                 | Conductor            | CU-007                                                   |
| `/conductor/servicio/:id`                                            | Conductor            | CU-008, CU-009                                           |
| `/admin/conductores`                                                 | Administrador        | CU-011                                                   |
| `/admin/dashboard`, `/admin/auditoria`                               | Administrador        | E7-HU2                                                   |
| `/` e `/inicio`                                                      | Público              | Sitio web                                                |
| `/cuenta`                                                            | Todos                | Mi cuenta                                                |
| `/conductor/ganancias`                                               | Conductor            | Resumen                                                  |
| `/admin/envios`, `/admin/zonas`                                      | Administrador        | Operación                                                |
| `/admin/mensajes`                                                    | Administrador        | Contacto                                                 |
| `/admin/pagos`                                                       | Administrador        | Pagos y liquidaciones                                    |
| `/olvide-contrasena`, `/restablecer-contrasena`, `/verificar-correo` | Público              | Cuenta                                                   |
| `/seguimiento/:token`                                                | Público (sin cuenta) | Seguimiento para quien recibe                            |
| `/envios/:id`                                                        | Cliente o conductor  | Enlace de las notificaciones push; redirige según el rol |

## Funciones nuevas (v2.1)

- **Sitio web público** en `/`: portada con ilustraciones animadas, cifras reales
  (`GET /api/publico/estadisticas`), cobertura y tarifas, cómo funciona y formulario de contacto.
- **Seguimiento en vivo**: mapa con origen, destino, recorrido, marcador del conductor y ETA
  (`GET /api/envios/:id/seguimiento`). El conductor reenvía su posición cada 20 s aunque no se mueva.
- **Cámara del dispositivo** al subir documentos y la foto de entrega (`getUserMedia`, cámara trasera,
  cambio de cámara, respaldo a elegir archivo). Las fotos se comprimen a JPEG ≤ 1600 px antes de subir.
  Requiere HTTPS o `localhost`.
- Cancelación de envíos (cliente en Pendiente; admin con motivo), notas para el conductor,
  calificación con comentario, notificaciones con campana, Mi cuenta (teléfono y contraseña),
  ganancias del conductor, búsqueda de envíos, edición de tarifas y bandeja de mensajes para el admin.
- **Sesión entre pestañas**: si se inicia otra cuenta en otra pestaña del mismo navegador, esta pestaña
  la adopta y avisa. Para probar dos roles a la vez usa otro navegador o una ventana privada.

## Funciones nuevas (v2.2): tarifas automáticas y zonas en el mapa

- **Direcciones con autocompletado** (`ti-campo-direccion`): busca en OpenStreetMap a través del backend
  (`GET /api/geo/buscar`), "Usar mi ubicación" y "Elegir en el mapa" (`ti-selector-mapa`, con las zonas dibujadas).
- **Cotización automática**: con las dos direcciones ubicadas en el mapa el precio se calcula solo; cada tarjeta de
  vehículo muestra su precio y la cotización trae el desglose (banderazo, km, minutos, recargos). Si el destino no se
  encuentra, se pide la zona a mano.
- **Zonas y tarifas** (`/admin/zonas`): el administrador edita banderazo, valor por km, por minuto y mínimo de cada
  vehículo (con ejemplos de precio en vivo) y crea, mueve, redimensiona o desactiva zonas tocando el mapa.
- **Tablero del conductor**: explica qué pedidos ve según su vehículo (un motocarro también ve los de moto) y llega
  la notificación "Nuevo servicio disponible" al crearse un envío compatible.
- La calculadora del sitio público usa las mismas tarifas (`GET /api/publico/tarifas`).

## Funciones nuevas (v2.3): pagos, tiempo real y servicio completo

- **Eliminar y editar:** el administrador elimina zonas (se archivan si tienen historial) y mensajes; el cliente edita
  un envío Pendiente; cualquiera borra notificaciones o las ya leídas.
- **Direcciones:** ya no existe el selector "Zona del destino": cada dirección se ubica con una sugerencia, "Usar mi
  ubicación" o el mapa. "Usar mi ubicación" diagnostica el motivo cuando falla (Windows con la ubicación apagada,
  sitio bloqueado, sin https, sin señal) y, si la ubicación es aproximada, abre el mapa para confirmarla.
- **Cuenta:** recuperar la contraseña por correo y verificar el correo (aviso en la cabecera con "Reenviar enlace").
- **Pagos:** efectivo contra entrega o **Nequi** (cobro al celular con espera en vivo, reintento o cambio a efectivo).
  El conductor confirma el efectivo al entregar y ve su liquidación semanal; el administrador la genera y la marca pagada.
- **Tiempo real:** los avisos, mensajes y cambios de envío llegan por SSE (`EventosPort` → `EventosSseAdapter`); si el canal se cae, se
  reconecta y mientras tanto se consulta cada 30 s. **Notificaciones push** (`PushPort` → `PushHibridoAdapter`): Web Push en el navegador
  (requiere el build de producción por el service worker) y Firebase en la app Android/iOS si se empaqueta con Capacitor.
- **Enlace de seguimiento** para quien recibe (WhatsApp, copiar o compartir), sin cuenta ni datos privados.
- **Envíos programados, hasta 3 paradas e ida y vuelta**, con su recargo en el desglose.
- **Chat cliente ↔ conductor** con respuestas rápidas, y **foto al recoger** el paquete (con ella inicia la ruta).

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
   npm run lint:sonar
   npm run sonar -- -Dsonar.host.url=http://localhost:9000 -Dsonar.token=TU_TOKEN
   ```

## Despliegue

- **Docker** (recomendado): el `Dockerfile` compila Angular en producción y lo sirve con Nginx, que además hace de
  proxy de `/api` y `/uploads` hacia la API (variable `API_UPSTREAM`, por defecto `http://api:3000`) sin búfer para
  los eventos en vivo. La aplicación completa (base de datos + API + web) se levanta con el compose del backend:
  ver `trackit-express-backend/deploy/README.md`, que también trae el plan para VirtualBox/Ubuntu y la nube.
- Sin Docker: `npm ci && npm run build` y servir `dist/trackit-express-frontend/browser` como sitio estático con
  _fallback_ a `index.html`, HTTPS y un proxy de `/api` y `/uploads` al backend.

## Documentación

- [docs/decisiones.md](docs/decisiones.md): contradicciones entre documentos y backend, y cómo se resolvieron
- Contrato de la API: Swagger del backend en `http://localhost:3000/api/docs`

## Ramas

- `main`: producción estable
- `pre-produccion`: staging
- `desarrollo`: trabajo diario
