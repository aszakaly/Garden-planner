# Kerttervező: Docker image a ZimaOS-szerverhez (linux/amd64).
# Az image csak a kódot és a lefordított felületet tartalmazza; az adatbázis
# a /data mappába kerül, amelyet a zimaos/*.yml ZimaOS-leírás csatol a szerver lemezéről.

# 1. Építés: függőségek telepítése és a felület lefordítása
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# 2. Futtatás: csak ami a szerverhez kell
FROM node:24-slim
WORKDIR /app
ARG KERT_VERZIO=ismeretlen
ENV NODE_ENV=production \
    KERT_PORT=4321 \
    KERT_DB=/data/garden.db \
    KERT_VERZIO=$KERT_VERZIO
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY package.json tsconfig.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY seed ./seed
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.KERT_PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# A tsx a Node folyamaton belül fut, így a leállítási jelet (SIGTERM) közvetlenül a szerver kapja
CMD ["node", "--import", "tsx", "src/server/index.ts"]
