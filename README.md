# Macro Tracker

React + React Router frontend, Express + TypeScript API, SQLite persistence, Docker deployment. Styling is plain CSS (no Tailwind).

## Local development

```bash
npm install
npm run dev
```

- Client: http://localhost:5173 (proxies `/api` to the server)
- API: http://localhost:3001

## Production build

```bash
npm run build
npm start
```

Serves the built SPA from the API on port 3001.

## Docker

```bash
docker compose up --build
```

Open http://localhost:3001

## Offline (PWA + sync)

The production build registers a **service worker** (Workbox precache) so the shell loads without the network. Recipes and meal plan are mirrored in **IndexedDB**; writes go to the local store first and are queued in an **outbox**. When online, the client **pulls** `/api/sync`, **replays** the queue (idempotent `PUT` upserts with client IDs), then pulls again.

**Background Sync** (`macro-outbox-sync`) is registered when possible so Chromium-based browsers can flush the outbox after connectivity returns; the app also syncs on the `online` event.

For a fully offline-capable install, use the production server or `vite preview` after `npm run build` (the dev server keeps PWA disabled by default).
