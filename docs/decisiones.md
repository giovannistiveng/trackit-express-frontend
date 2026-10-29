# Decisiones y supuestos

Orden de precedencia cuando las fuentes se contradicen: (1) backend real, (2) casos de uso
CU-001 a CU-011, (3) historias de usuario, (4) README.

## Contradicciones resueltas

| Tema                                   | Documentos                                | Backend real                                 | Decisión                                                                                                                                         |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mapas                                  | Google Maps                               | OpenStreetMap (Nominatim + Haversine)        | Leaflet con teselas de OpenStreetMap, sin API key y con atribución visible. El mapa se carga de forma perezosa y solo con el flag `ubicacion`.   |
| Error de dirección (CU-005)            | "Dirección no reconocida muestra error"   | Nunca devuelve error; usa distancia simulada | No se puede cumplir. La distancia se rotula "estimada" y se añade la nota "La distancia es una estimación".                                      |
| Entrada de la cotización               | Categoría del vehículo                    | `id_zona`                                    | Se envía `id_zona`. La categoría queda detrás del flag `categoriaEnvio`.                                                                         |
| Redondeo y recargo (E4-HU2)            | Redondeo a la centena, recargo provincial | `tarifa_base + km × 1000`                    | El frontend no recalcula ni redondea: muestra lo que devuelve el backend.                                                                        |
| Tarifa al crear                        | Igual a la cotizada                       | Se recalcula                                 | Se muestra siempre la tarifa de la respuesta y se avisa si difiere de la cotizada.                                                               |
| SMS con el PIN                         | Twilio                                    | No existe                                    | El PIN se muestra al cliente (grande, con botón de copiar) para que se lo dicte al conductor.                                                    |
| Evidencia de entrega                   | Archivo                                   | `url_foto` (texto)                           | La foto se sube con `EvidenceStoragePort` (Cloudinary sin firma o simulado) y se envía la URL. Si el PIN falla, se reutiliza la URL ya obtenida. |
| Comentario en la calificación (E7-HU1) | Sí                                        | No                                           | Solo estrellas de 1 a 5, enteras.                                                                                                                |
| Motivo de rechazo (CU-011)             | Obligatorio                               | No se guarda                                 | Se pide (1 a 255 caracteres), no se envía con el flag apagado y se avisa.                                                                        |
| Apellidos y teléfono (CU-001)          | Sí                                        | Solo `nombre`                                | Nombres y apellidos se concatenan en `nombre` (máx. 120). El teléfono se omite porque el backend no lo guarda.                                   |
| Marca, modelo, capacidad (CU-003)      | Sí                                        | Solo placa y categoría                       | No se piden. La ruta es `/api/vehicles/register`.                                                                                                |
| Estado Cancelado                       | Mencionado                                | No existe (CHECK en la BD)                   | No se ofrece cancelar.                                                                                                                           |
| Contraseña                             | CU y HU con reglas distintas              | Sin validación                               | Se aplica la más estricta: mínimo 8 caracteres, una mayúscula y un número.                                                                       |
| Expiración del JWT                     | 8 h                                       | `JWT_EXPIRES_IN` (24 h por defecto)          | Se lee del claim `exp`; se cierra la sesión al arrancar si venció y se programa el cierre automático.                                            |
| Base de datos                          | MySQL                                     | PostgreSQL                                   | Sin impacto en el frontend.                                                                                                                      |
| Entrega desde Asignado                 | CU-009 exige En Ruta                      | Se permite desde Asignado                    | Con `iniciarRutaEndpoint` apagado, se permite desde Asignado; encendido, solo desde En Ruta.                                                     |

## Supuestos

- **Ejecutor de pruebas:** Vitest (lo que genera el CLI de Angular 21) con jsdom. No se usa Karma.
- **Zoneless:** el CLI de Angular 21 genera la app sin zone.js. Las pruebas con tiempo usan `vi.useFakeTimers()`.
- **Tailwind v4** con `@tailwindcss/postcss` (lo que deja el CLI). Las clases propias (`btn-primario`, `campo`, …) se definen con `@utility`.
- **Prefijo de componentes:** `ti-` (TrackIt) en lugar de `app-`.
- **Estado:** servicios con signals, sin NgRx.
- **Tablero del conductor sin endpoint:** en vez de datos puramente simulados (con los que "Aceptar" fallaría contra el backend real), se recorren los ids existentes con `GET /api/envios/:id`. Así el flujo completo cliente → conductor → entrega funciona hoy contra el backend real.
- **Perfil del conductor sin endpoint:** se relaciona usuario y conductor en `environment.demo.conductores`. Es la única forma de probar el rol conductor sin cambiar el backend; ver `docs/demo-conductor.sql`.
- **Servicio activo único (RN_OP_002):** se recuerda en LocalForage por conductor y se verifica con `GET /api/envios/:id` antes de bloquear.
- **Envíos de otro cliente:** como `GET /api/envios/:id` es público, la pantalla de seguimiento no muestra un envío cuyo `id_cliente` no sea el del usuario.
- **Caché del Service Worker:** las respuestas de `GET /api/envios/*` se guardan como máximo 5 minutos (estrategia de frescura) y la caché de datos se borra al cerrar sesión, porque incluyen el PIN.
- **Fuentes:** Archivo desde Google Fonts, con respaldo a fuentes del sistema. La compilación de producción no incrusta las fuentes (`optimization.fonts: false`) para no depender de la red al compilar.
- **Umbral de cobertura por carpeta:** el builder de Angular solo admite umbrales globales; el 90 % de `core/domain` y `core/adapters/http` lo verifica `scripts/verificar-cobertura.mjs`, que corre en `npm run test:coverage`.
- **Logs del frontend:** se envían por lotes a `POST /api/logs/frontend` (lo escribe en `logs/frontend-AAAA-MM-DD.txt`). En desarrollo también se pueden descargar como `.txt` desde la insignia Modo demo.

## Diseño visual

- Paleta: verde montaña `#123B2F`, niebla `#EEF2EF`, amarillo placa `#F5C518` como único acento.
- El PIN y la placa del vehículo se muestran como una placa colombiana (amarillo con borde negro): es el dato que el cliente dicta al conductor.
- El recorrido del envío se dibuja como una ruta vertical con paradas.
- Tipografía Archivo: ensanchada en títulos, normal en el texto; números tabulares en tarifas y PIN.
- Objetivos táctiles de 44 px mínimo, foco visible amarillo, `prefers-reduced-motion` respetado.
