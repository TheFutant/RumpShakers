# syntax=docker/dockerfile:1

# ---- build: produce the static web export ----
# Debian slim (not alpine) so expo-export's image tooling (sharp) has prebuilt
# binaries and doesn't need a musl rebuild.
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# GetSongBPM key, inlined into the web bundle at export time. EXPO_PUBLIC_* is
# client-visible by design, so on the public URL this key is exposed — an
# accepted trade-off to enable search on rumpshakers.fly.dev. Supplied as a
# build arg from CI (secrets.EXPO_PUBLIC_GETSONGBPM_API_KEY). The empty default
# keeps search disabled (manual entry only) for any build that doesn't pass it.
ARG EXPO_PUBLIC_GETSONGBPM_API_KEY=""
# Supabase shared-library sync (see SYNC.md). Also client-visible by design;
# baking it here turns on shared sync for the public rumpshakers.fly.dev build.
# Empty defaults keep sync off for any build that doesn't supply them.
ARG EXPO_PUBLIC_SUPABASE_URL=""
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY=""
ENV EXPO_PUBLIC_GETSONGBPM_API_KEY=$EXPO_PUBLIC_GETSONGBPM_API_KEY
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY
RUN npx expo export --platform web

# ---- serve: nginx over the static files ----
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
