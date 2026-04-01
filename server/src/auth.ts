import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import type Database from "better-sqlite3";

export const LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001";
export const SESSION_COOKIE = "macro_session";
const SESSION_DAYS_PASSWORD = 30;
const SESSION_DAYS_MAGIC = 60;
const MAGIC_LINK_MINUTES = 15;

export type AuthUser = {
  id: string;
  email: string;
  totpEnabled: boolean;
  isAdmin: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const want = Buffer.from(parts[2], "hex");
  const key = scryptSync(password, salt, want.length);
  return want.length === key.length && timingSafeEqual(want, key);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionExpiryIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function magicExpiryIso(): string {
  const d = new Date();
  d.setUTCMinutes(d.getUTCMinutes() + MAGIC_LINK_MINUTES);
  return d.toISOString();
}

function totpValid(secret: string, token: string): boolean {
  return verifySync({ secret, token, epochTolerance: 30 }).valid;
}

/** Use Secure cookies only on HTTPS (or when a trusted proxy says the client used HTTPS). */
function sessionCookieSecure(req: Request): boolean {
  if (process.env.SESSION_COOKIE_INSECURE === "1") return false;
  return Boolean(req.secure);
}

export function registerAuthEndpoints(app: import("express").Express, db: Database.Database) {
  app.post("/api/auth/register", (req, res) => {
    const body = req.body as { email?: string; password?: string };
    if (!body?.email?.trim() || typeof body.password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const email = body.email.trim().toLowerCase();
    if (body.password.length < 8) {
      res.status(400).json({ error: "password must be at least 8 characters" });
      return;
    }
    if (email === "legacy@local" || email === (process.env.TEST_ADMIN_EMAIL ?? "test.admin@local").toLowerCase()) {
      res.status(400).json({ error: "reserved email" });
      return;
    }
    const id = randomUUID();
    const passwordHash = hashPassword(body.password);
    try {
      db.prepare(
        "INSERT INTO users (id, email, password_hash, totp_enabled, is_admin) VALUES (?, ?, ?, 0, 0)",
      ).run(id, email, passwordHash);
    } catch {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryIso(SESSION_DAYS_PASSWORD);
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, method) VALUES (?, ?, ?, ?, ?)",
    ).run(sessionId, id, tokenHash, expiresAt, "password");
    res.cookie(SESSION_COOKIE, `${sessionId}.${token}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
      maxAge: SESSION_DAYS_PASSWORD * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.status(201).json({ user: { id, email, totpEnabled: false, isAdmin: false } });
  });

  app.post("/api/auth/login", (req, res) => {
    const body = req.body as { email?: string; password?: string; totpCode?: string };
    if (!body?.email?.trim() || typeof body.password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const email = body.email.trim().toLowerCase();
    const row = db
      .prepare(
        "SELECT id, email, password_hash, totp_secret, totp_enabled, is_admin FROM users WHERE email = ? COLLATE NOCASE",
      )
      .get(email) as
      | {
          id: string;
          email: string;
          password_hash: string | null;
          totp_secret: string | null;
          totp_enabled: number;
          is_admin: number;
        }
      | undefined;
    if (!row || !row.password_hash || !verifyPassword(body.password, row.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (row.totp_enabled) {
      const code = typeof body.totpCode === "string" ? body.totpCode.replace(/\s/g, "") : "";
      if (!code || !row.totp_secret || !totpValid(row.totp_secret, code)) {
        res.status(401).json({ error: "Invalid or missing authenticator code" });
        return;
      }
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryIso(SESSION_DAYS_PASSWORD);
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, method) VALUES (?, ?, ?, ?, ?)",
    ).run(sessionId, row.id, tokenHash, expiresAt, "password");
    res.cookie(SESSION_COOKIE, `${sessionId}.${token}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
      maxAge: SESSION_DAYS_PASSWORD * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({
      user: {
        id: row.id,
        email: row.email,
        totpEnabled: Boolean(row.totp_enabled),
        isAdmin: Boolean(row.is_admin),
      },
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SESSION_COOKIE];
    if (raw) {
      const dot = raw.indexOf(".");
      if (dot !== -1) {
        const sessionId = raw.slice(0, dot);
        db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      }
    }
    res.clearCookie(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
    });
    res.status(204).send();
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.json({ user });
  });

  app.post("/api/auth/link/request", (req, res) => {
    const body = req.body as { email?: string };
    if (!body?.email?.trim()) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    const email = body.email.trim().toLowerCase();
    const row = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email) as
      | { id: string }
      | undefined;
    if (!row) {
      res.status(202).json({ ok: true });
      return;
    }
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const id = randomUUID();
    const expiresAt = magicExpiryIso();
    db.prepare(
      "INSERT INTO magic_login_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).run(id, row.id, tokenHash, expiresAt);
    const base =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host") || "localhost"}`;
    const link = `${base}/login/link?token=${encodeURIComponent(rawToken)}`;
    res.status(201).json({ ok: true, link, expiresInMinutes: MAGIC_LINK_MINUTES });
  });

  app.post("/api/auth/link/consume", (req, res) => {
    const body = req.body as { token?: string };
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const tokenHash = hashToken(token);
    const row = db
      .prepare(
        `
      SELECT m.id, m.user_id, m.expires_at, m.used_at, u.email, u.totp_enabled, u.is_admin
      FROM magic_login_tokens m
      JOIN users u ON u.id = m.user_id
      WHERE m.token_hash = ?
    `,
      )
      .get(tokenHash) as
      | {
          id: string;
          user_id: string;
          expires_at: string;
          used_at: string | null;
          email: string;
          totp_enabled: number;
          is_admin: number;
        }
      | undefined;
    if (!row || row.used_at) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    if (new Date(row.expires_at) <= new Date()) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    db.prepare("UPDATE magic_login_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = hashToken(sessionToken);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryIso(SESSION_DAYS_MAGIC);
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, method) VALUES (?, ?, ?, ?, ?)",
    ).run(sessionId, row.user_id, sessionTokenHash, expiresAt, "link");
    res.cookie(SESSION_COOKIE, `${sessionId}.${sessionToken}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
      maxAge: SESSION_DAYS_MAGIC * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({
      user: {
        id: row.user_id,
        email: row.email,
        totpEnabled: Boolean(row.totp_enabled),
        isAdmin: Boolean(row.is_admin),
      },
    });
  });

  app.post("/api/auth/totp/setup", (req, res) => {
    const user = getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const secret = generateSecret();
    const otpauth = generateURI({ issuer: "Macro Tracker", label: user.email, secret });
    db.prepare("UPDATE users SET totp_secret = ? WHERE id = ?").run(secret, user.id);
    res.json({ secret, otpauthUrl: otpauth });
  });

  app.post("/api/auth/totp/enable", (req, res) => {
    const user = getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const body = req.body as { code?: string };
    const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }
    const row = db
      .prepare("SELECT totp_secret FROM users WHERE id = ?")
      .get(user.id) as { totp_secret: string | null } | undefined;
    if (!row?.totp_secret) {
      res.status(400).json({ error: "Run totp setup first" });
      return;
    }
    if (!totpValid(row.totp_secret, code)) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(user.id);
    res.json({ ok: true, totpEnabled: true });
  });

  app.post("/api/auth/totp/disable", (req, res) => {
    const user = getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const body = req.body as { password?: string; code?: string };
    if (typeof body?.password !== "string") {
      res.status(400).json({ error: "password is required" });
      return;
    }
    const row = db
      .prepare("SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = ?")
      .get(user.id) as
      | { password_hash: string | null; totp_secret: string | null; totp_enabled: number }
      | undefined;
    if (!row?.password_hash || !verifyPassword(body.password, row.password_hash)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    if (row.totp_enabled) {
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      if (!code || !row.totp_secret || !totpValid(row.totp_secret, code)) {
        res.status(401).json({ error: "Invalid authenticator code" });
        return;
      }
    }
    db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?").run(user.id);
    res.json({ ok: true, totpEnabled: false });
  });
}

export function getSessionUser(db: Database.Database, req: Request): AuthUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!sessionId || !token) return null;
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `
    SELECT s.expires_at, u.id, u.email, u.totp_enabled, u.is_admin
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.token_hash = ?
  `,
    )
    .get(sessionId, tokenHash) as
    | { expires_at: string; id: string; email: string; totp_enabled: number; is_admin: number }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    totpEnabled: Boolean(row.totp_enabled),
    isAdmin: Boolean(row.is_admin),
  };
}

export function requireUser(
  db: Database.Database,
): (req: Request, res: Response, next: () => void) => void {
  return (req, res, next) => {
    const user = getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    (req as Request & { authUser: AuthUser }).authUser = user;
    next();
  };
}
