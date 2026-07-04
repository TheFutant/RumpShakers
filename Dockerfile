# syntax=docker/dockerfile:1

# ---- build: produce the static web export ----
# Debian slim (not alpine) so expo-export's image tooling (sharp) has prebuilt
# binaries and doesn't need a musl rebuild.
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# EXPO_PUBLIC_* vars are inlined at build time. None is baked here, so the
# deployed site ships with GetSongBPM search disabled and manual entry enabled
# — which is exactly what we want until a real API key exists. Rebuild with
# EXPO_PUBLIC_GETSONGBPM_API_KEY set to light search up.
RUN npx expo export --platform web

# ---- serve: nginx over the static files ----
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
