#!/bin/bash
set -e

# Copiar .env.example si .env no existe
if [ ! -f .env ]; then
  cp .env.example .env
fi

# Instalar dependencias si node_modules no existe
if [ ! -d node_modules ]; then
  npm install
fi

# Iniciar el servidor de desarrollo Angular
npm run start -- --host 0.0.0.0 --disable-host-check