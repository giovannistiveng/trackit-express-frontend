# Decisiones y supuestos

Orden de precedencia cuando las fuentes se contradicen: (1) backend real, (2) casos de uso
CU-001 a CU-011, (3) historias de usuario, (4) README.

## Contradicciones resueltas

| Tema                                   | Documentos                                | Backend real                                 | Decisión                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapas                                  | Google Maps                               | OpenStreetMap (Nominatim + Haversine)        | Leaflet con teselas de OpenStreetMap, sin API key y con atribución visible. El mapa se carga de forma perezosa mientras el envío está Asignado o En Ruta. |
| Error de dirección (CU-005)            | "Dirección no reconocida muestra error"   | Nunca devuelve error; usa distancia simulada | No se puede cumplir. La distancia se rotula "estimada" y se añade la nota "La distancia es una estimación".                                               |
| Entrada de la cotización               | Categoría del vehículo                    | `id_zona`                                    | Se cotiza por `id_zona`. Al crear, el cliente puede elegir la categoría de vehículo (opcional) y solo la ven conductores con ese vehículo.                |
| Redondeo y recargo (E4-HU2)            | Redondeo a la centena, recargo provincial | `tarifa_base + km × 1000`                    | El frontend no recalcula ni redondea: muestra lo que devuelve el backend.                                                                                 |
| Tarifa al crear                        | Igual a la cotizada                       | Se recalcula                                 | Se muestra siempre la tarifa de la respuesta y se avisa si difiere de la cotizada.                                                                        |
| SMS con el PIN                         | Twilio                                    | No existe                                    | El PIN se muestra al cliente (grande, con botón de copiar) para que se lo dicte al conductor.                                                             |
| Evidencia de entrega                   | Archivo                                   | `url_foto` (texto)                           | La foto se sube a `POST /api/envios/:id/evidencia` (el backend la guarda en Cloudinary o en disco) y se envía la URL. Si el PIN falla, se reutiliza.      |
| Comentario en la calificación (E7-HU1) | Sí                                        | No                                           | Solo estrellas de 1 a 5, enteras.                                                                                                                         |
| Motivo de rechazo (CU-011)             | Obligatorio                               | No se guarda                                 | Obligatorio (1 a 255 caracteres), se guarda y el conductor lo ve en su perfil. Al subir un documento nuevo vuelve a revisión.                             |
| Apellidos y teléfono (CU-001)          | Sí                                        | Solo `nombre`                                | Nombres y apellidos se concatenan en `nombre` (máx. 120). El teléfono se omite porque el backend no lo guarda.                                            |
| Marca, modelo, capacidad (CU-003)      | Sí                                        | Solo placa y categoría                       | No se piden. La ruta es `/api/vehicles/register`.                                                                                                         |
| Estado Cancelado                       | Mencionado                                | Migración 002 lo agrega                      | El cliente cancela en Pendiente; el admin cancela cualquier envío activo con motivo.                                                                      |
| Contraseña                             | CU y HU con reglas distintas              | Mismo criterio en frontend y backend         | Se aplica la más estricta: mínimo 8 caracteres, una mayúscula y un número.                                                                                |
| Expiración del JWT                     | 8 h                                       | `JWT_EXPIRES_IN` (24 h por defecto)          | Se lee del claim `exp`; se cierra la sesión al arrancar si venció y se programa el cierre automático.                                                     |
| Base de datos                          | MySQL                                     | PostgreSQL                                   | Sin impacto en el frontend.                                                                                                                               |
| Entrega desde Asignado                 | CU-009 exige En Ruta                      | Solo desde En Ruta                           | El conductor inicia la ruta (`POST /api/envios/:id/iniciar-ruta`) y solo entonces puede finalizar.                                                        |

## Supuestos

- **Ejecutor de pruebas:** Vitest (lo que genera el CLI de Angular 21) con jsdom. No se usa Karma.
- **Zoneless:** el CLI de Angular 21 genera la app sin zone.js. Las pruebas con tiempo usan `vi.useFakeTimers()`.
- **Tailwind v4** con `@tailwindcss/postcss` (lo que deja el CLI). Las clases propias (`btn-primario`, `campo`, …) se definen con `@utility`.
- **Prefijo de componentes:** `ti-` (TrackIt) en lugar de `app-`.
- **Estado:** servicios con signals, sin NgRx.
- **Autorización:** el backend identifica al usuario por el token; el frontend nunca envía `id_cliente` ni `id_conductor`. Un 401 cierra la sesión; un 403 solo muestra "No tienes permiso".
- **PIN:** solo lo recibe el cliente dueño del envío. El adaptador del conductor descarta `pin_seguridad` aunque llegara.
- **Servicio activo único (RN_OP_002):** lo informa `GET /api/conductores/envios/activo` y el backend también lo hace cumplir al aceptar.
- **Caché del Service Worker:** las respuestas de `GET /api/envios/*` se guardan como máximo 5 minutos (estrategia de frescura) y la caché de datos se borra al cerrar sesión, porque incluyen el PIN.
- **Fuentes:** Archivo desde Google Fonts, con respaldo a fuentes del sistema. La compilación de producción no incrusta las fuentes (`optimization.fonts: false`) para no depender de la red al compilar.
- **Umbral de cobertura por carpeta:** el builder de Angular solo admite umbrales globales; el 90 % de `core/domain` y `core/adapters/http` lo verifica `scripts/verificar-cobertura.mjs`, que corre en `npm run test:coverage`.
- **Logs del frontend:** se envían por lotes a `POST /api/logs/frontend` (lo escribe en `logs/frontend-AAAA-MM-DD.txt`).

## Diseño visual

- Paleta: naranja `#C2410C` como color de marca (oscuro `#9A3412`, suave `#FFEDD5`), fondo cálido `#F6F3EF`, tinta `#1F1A17` y amarillo placa `#F5C518` como acento.
- El PIN y la placa del vehículo se muestran como una placa colombiana (amarillo con borde negro): es el dato que el cliente dicta al conductor.
- El recorrido del envío se dibuja como una ruta vertical con paradas.
- Tipografía Archivo: ensanchada en títulos, normal en el texto; números tabulares en tarifas y PIN.
- Objetivos táctiles de 44 px mínimo, foco visible de alto contraste, `prefers-reduced-motion` respetado.

## Decisiones v2.1

- **Iconos:** `lucide-static` (SVG en línea, sin fuentes ni peticiones). Se fija la versión exacta.
- **Ilustraciones:** SVG propios en `shared/ilustraciones/` (sin imágenes de terceros ni derechos de autor).
- **Animaciones:** `IntersectionObserver` para revelar y contar; todo se desactiva con `prefers-reduced-motion`.
- **Cámara:** componente propio sobre `getUserMedia` (token `CAMARAS` para probarlo); si no hay permiso o
  cámara se ofrece `<input type=file capture>`.
- **Errores de extensiones del navegador:** el `ErrorHandler` global los ignora y agrupa repetidos en 10 s,
  para que no llenen los logs.
- **App móvil:** la PWA ya es instalable. Para tiendas, la vía recomendada es Capacitor (mismo código);
  el GPS en segundo plano del conductor necesita un plugin nativo.

## Decisiones v2.2 (tarifas y zonas)

- **Causa del tablero vacío:** el backend exigía que la categoría del pedido coincidiera exactamente con la del
  vehículo; un conductor con Motocarro no veía pedidos de Moto Express. Ahora un vehículo atiende su categoría y las
  menores.
- **Causa de las tarifas exageradas:** Nominatim ubicaba nombres como "Vereda Pekín" en otro país (4.344 km) y la
  tarifa era "base + $1.000 × km". Ahora la búsqueda se limita a la región (máx. 80 km de Fusagasugá) y el precio es
  banderazo + km + minutos por vehículo con mínimo, más un recargo pequeño por zona.
- **Zonas como círculos:** más simple de administrar que polígonos y suficiente para municipios y veredas; un punto
  pertenece a la zona más pequeña que lo contiene.
- **La fórmula vive en el backend.** El frontend solo replica `precioEstimado` para ejemplos y la calculadora pública;
  el precio cobrado siempre es el del servidor.

## Decisiones v2.3 (pagos, tiempo real y servicio completo)

- **Sin selector de zona:** el precio exige coordenadas (sugerencia, ubicación o mapa). Escribir a mano ya no basta,
  así nunca se cobra con una distancia adivinada.
- **"Usar mi ubicación" en Windows:** desde Chrome 144 la ubicación depende también del permiso de Windows; si el
  sitio tiene permiso pero Windows lo bloquea, el navegador responde "permiso denegado". Se cruza el error con
  `navigator.permissions` para decir exactamente qué activar. Primero se pide una ubicación rápida de baja precisión y,
  si no llega, una con GPS.
- **Nequi:** el backend usa la API Nequi Conecta (pago con notificación push al celular). En desarrollo corre en modo
  simulado. El envío no se publica a los conductores hasta que el pago queda aprobado (o el cliente elige efectivo).
- **SSE en vez de WebSocket:** los eventos solo van del servidor al cliente; SSE funciona sobre HTTP normal, atraviesa
  proxies y reconecta fácil. Como `EventSource` no envía encabezados, se usa un ticket de un solo uso de 60 s.
- **App híbrida:** `PushService` detecta `window.Capacitor`; en la app usa el plugin nativo (FCM) y en el navegador
  Web Push con el service worker de Angular. Las rutas `/envios/:id` hacen que el mismo enlace de la notificación sirva
  para cliente y conductor.
- **Presupuesto del bundle inicial:** se subió el aviso a 600 kB por el canal de eventos y el push en la cabecera.
