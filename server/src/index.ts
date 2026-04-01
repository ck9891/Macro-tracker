import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerAuthEndpoints } from "./auth.js";
import { openDb, seedDemoRecipesForDevAccounts, seedIfEmpty } from "./db.js";
import { registerRoutes } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const clientDist = path.join(__dirname, "../../client/dist");

const app = express();
// So req.secure and cookies honor X-Forwarded-Proto when behind TLS-terminating proxies.
app.set("trust proxy", 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const db = openDb();
seedIfEmpty(db);
seedDemoRecipesForDevAccounts(db);
registerAuthEndpoints(app, db);
registerRoutes(app, db);

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
