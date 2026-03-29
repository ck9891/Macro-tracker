# Build client + server TypeScript
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm install

COPY client client
COPY server server
COPY tsconfig.base.json ./

RUN npm run build

# Runtime: Express + SQLite native module
FROM node:22-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ libc6-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/
RUN cd server && npm install --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/app.db

EXPOSE 3001

VOLUME ["/data"]

CMD ["node", "server/dist/index.js"]
