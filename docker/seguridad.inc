# Encabezados de seguridad (se incluyen en cada location que define otros encabezados,
# porque en Nginx un add_header dentro de una location reemplaza a los heredados).
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(self), camera=(self), microphone=()" always;
