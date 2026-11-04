# TrackIt Express · Web (Angular) servida con Nginx
# Etapa 1 compila la aplicación; etapa 2 la sirve y reenvía /api y /uploads a la API.

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

# ---------- 1. Compilación de producción (incluye el service worker para la PWA y las notificaciones push)
FROM node:${NODE_VERSION}-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ngsw-config.json .postcssrc.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production

# ---------- 2. Servidor web
FROM nginx:${NGINX_VERSION}-alpine AS web
# Dirección interna de la API (nombre del servicio en docker compose)
ENV API_UPSTREAM=http://api:3000
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/seguridad.inc /etc/nginx/snippets/seguridad.inc
COPY --from=compilacion /app/dist/trackit-express-frontend/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/salud > /dev/null || exit 1
