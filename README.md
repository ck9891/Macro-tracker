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
