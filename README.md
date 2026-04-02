# Macro Tracker

React + React Router frontend, Express + TypeScript API, PostgreSQL with [Prisma](https://www.prisma.io/), Docker deployment. Styling is plain CSS (no Tailwind).

## Local development

Set `DATABASE_URL` to a PostgreSQL connection string (the schema uses the `citext` extension, available on typical Postgres images).

```bash
# Example: Postgres on localhost, database "macro"
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/macro"
cd server && npx prisma migrate deploy && cd ..
npm install
npm run dev
```

- Client: http://localhost:5173 (proxies `/api` to the server)
- API: http://localhost:3001

Use `npm run db:migrate -w server` from the repo root to apply migrations, or `npm run db:studio -w server` to open Prisma Studio.

## Production build

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
npm run build
cd server && npx prisma migrate deploy && cd ..
npm start
```

Serves the built SPA from the API on port 3001.

## Docker

Compose starts PostgreSQL and the app; the container runs `prisma migrate deploy` before the API.

```bash
docker compose up --build
```

Open http://localhost:3001

## Offline (PWA + sync)

The production build registers a **service worker** (Workbox precache) so the shell loads without the network. Recipes and meal plan are mirrored in **IndexedDB**; writes go to the local store first and are queued in an **outbox**. When online, the client **pulls** `/api/sync`, **replays** the queue (idempotent `PUT` upserts with client IDs), then pulls again.

**Background Sync** (`macro-outbox-sync`) is registered when possible so Chromium-based browsers can flush the outbox after connectivity returns; the app also syncs on the `online` event.

For a fully offline-capable install, use the production server or `vite preview` after `npm run build` (the dev server keeps PWA disabled by default).
