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

# Runtime: Express + Prisma + PostgreSQL
FROM node:22-bookworm-slim AS runner
WORKDIR /app

COPY server/package.json server/
COPY server/prisma server/prisma

RUN cd server && npm install --omit=dev

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/macro
RUN cd server && npx prisma generate

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node dist/index.js"]
