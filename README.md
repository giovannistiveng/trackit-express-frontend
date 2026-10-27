# TrackIt Express - Frontend

Frontend de TrackIt Express, PWA (Aplicación Web Progresiva) para clientes y conductores de la plataforma de logística local en Fusagasugá y alrededores.

## Stack tecnológico

- Angular v21.2
- TypeScript
- Tailwind CSS
- PWA (Service Worker, instalable en Android/iOS)
- Google Maps JavaScript API (mapas interactivos)
- LocalForage (almacenamiento local temporal para conectividad intermitente)

## Estructura del proyecto

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/           # Servicios globales, guards, interceptores, modelos
│   │   ├── shared/         # Componentes, pipes, directivas compartidos
│   │   └── features/       # Módulos por funcionalidad (lazy loading)
│   │       ├── auth/          # Login, registro
│   │       ├── drivers/       # Registro de conductor, documentos, aprobación
│   │       ├── vehicles/      # Registro de vehículos
│   │       ├── shipments/     # Cotización, creación, listado de envíos
│   │       ├── tracking/      # Trazabilidad en tiempo real (mapa)
│   │       ├── deliveries/    # Validación de entrega (PIN, evidencia)
│   │       ├── ratings/       # Calificación de servicio
│   │       └── admin/         # Dashboard administrativo, aprobaciones
│   ├── assets/             # Recursos estáticos
│   └── environments/       # Variables de entorno
```

## Ramas

- `main` — Producción estable
- `pre-produccion` — Staging, listo para pruebas finales
- `desarrollo` — Rama de trabajo diario

## Despliegue

Frontend desplegado en Vercel / Netlify como PWA.