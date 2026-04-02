import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import { Prisma, type PrismaClient } from "@prisma/client";
import { LEGACY_USER_ID } from "./constants.js";
import { hashPassword, verifyPassword } from "./password.js";

export { LEGACY_USER_ID };
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

function sessionExpiryDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function magicExpiryDate(): Date {
  const d = new Date();
  d.setUTCMinutes(d.getUTCMinutes() + MAGIC_LINK_MINUTES);
  return d;
}

function totpValid(secret: string, token: string): boolean {
  return verifySync({ secret, token, epochTolerance: 30 }).valid;
}

/** Use Secure cookies only on HTTPS (or when a trusted proxy says the client used HTTPS). */
function sessionCookieSecure(req: Request): boolean {
  if (process.env.SESSION_COOKIE_INSECURE === "1") return false;
  return Boolean(req.secure);
}

export function registerAuthEndpoints(app: import("express").Express, db: PrismaClient) {
  app.post("/api/auth/register", async (req, res) => {
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
      await db.user.create({
        data: {
          id,
          email,
          passwordHash,
          totpEnabled: false,
          isAdmin: false,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }
      throw e;
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryDate(SESSION_DAYS_PASSWORD);
    await db.session.create({
      data: {
        id: sessionId,
        userId: id,
        tokenHash,
        expiresAt,
        method: "password",
      },
    });
    res.cookie(SESSION_COOKIE, `${sessionId}.${token}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
      maxAge: SESSION_DAYS_PASSWORD * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.status(201).json({ user: { id, email, totpEnabled: false, isAdmin: false } });
  });

  app.post("/api/auth/login", async (req, res) => {
    const body = req.body as { email?: string; password?: string; totpCode?: string };
    if (!body?.email?.trim() || typeof body.password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const email = body.email.trim().toLowerCase();
    const row = await db.user.findUnique({ where: { email } });
    if (!row?.passwordHash || !verifyPassword(body.password, row.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (row.totpEnabled) {
      const code = typeof body.totpCode === "string" ? body.totpCode.replace(/\s/g, "") : "";
      if (!code || !row.totpSecret || !totpValid(row.totpSecret, code)) {
        res.status(401).json({ error: "Invalid or missing authenticator code" });
        return;
      }
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryDate(SESSION_DAYS_PASSWORD);
    await db.session.create({
      data: {
        id: sessionId,
        userId: row.id,
        tokenHash,
        expiresAt,
        method: "password",
      },
    });
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
        totpEnabled: row.totpEnabled,
        isAdmin: row.isAdmin,
      },
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SESSION_COOKIE];
    if (raw) {
      const dot = raw.indexOf(".");
      if (dot !== -1) {
        const sessionId = raw.slice(0, dot);
        await db.session.deleteMany({ where: { id: sessionId } });
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

  app.get("/api/auth/me", async (req, res, next) => {
    try {
      const user = await getSessionUser(db, req);
      if (!user) {
        res.status(401).json({ error: "Not signed in" });
        return;
      }
      res.json({ user });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/auth/link/request", async (req, res) => {
    const body = req.body as { email?: string };
    if (!body?.email?.trim()) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    const email = body.email.trim().toLowerCase();
    const row = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!row) {
      res.status(202).json({ ok: true });
      return;
    }
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const id = randomUUID();
    const expiresAt = magicExpiryDate();
    await db.magicLoginToken.create({
      data: {
        id,
        userId: row.id,
        tokenHash,
        expiresAt,
      },
    });
    const base =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host") || "localhost"}`;
    const link = `${base}/login/link?token=${encodeURIComponent(rawToken)}`;
    res.status(201).json({ ok: true, link, expiresInMinutes: MAGIC_LINK_MINUTES });
  });

  app.post("/api/auth/link/consume", async (req, res) => {
    const body = req.body as { token?: string };
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const tokenHash = hashToken(token);
    const row = await db.magicLoginToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.usedAt) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    if (row.expiresAt <= new Date()) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    await db.magicLoginToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = hashToken(sessionToken);
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryDate(SESSION_DAYS_MAGIC);
    await db.session.create({
      data: {
        id: sessionId,
        userId: row.userId,
        tokenHash: sessionTokenHash,
        expiresAt,
        method: "link",
      },
    });
    res.cookie(SESSION_COOKIE, `${sessionId}.${sessionToken}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(req),
      maxAge: SESSION_DAYS_MAGIC * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({
      user: {
        id: row.userId,
        email: row.user.email,
        totpEnabled: row.user.totpEnabled,
        isAdmin: row.user.isAdmin,
      },
    });
  });

  app.post("/api/auth/totp/setup", async (req, res) => {
    const user = await getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const secret = generateSecret();
    const otpauth = generateURI({ issuer: "Macro Tracker", label: user.email, secret });
    await db.user.update({
      where: { id: user.id },
      data: { totpSecret: secret },
    });
    res.json({ secret, otpauthUrl: otpauth });
  });

  app.post("/api/auth/totp/enable", async (req, res) => {
    const user = await getSessionUser(db, req);
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
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });
    if (!row?.totpSecret) {
      res.status(400).json({ error: "Run totp setup first" });
      return;
    }
    if (!totpValid(row.totpSecret, code)) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    await db.user.update({
      where: { id: user.id },
      data: { totpEnabled: true },
    });
    res.json({ ok: true, totpEnabled: true });
  });

  app.post("/api/auth/totp/disable", async (req, res) => {
    const user = await getSessionUser(db, req);
    if (!user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const body = req.body as { password?: string; code?: string };
    if (typeof body?.password !== "string") {
      res.status(400).json({ error: "password is required" });
      return;
    }
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, totpSecret: true, totpEnabled: true },
    });
    if (!row?.passwordHash || !verifyPassword(body.password, row.passwordHash)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    if (row.totpEnabled) {
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      if (!code || !row.totpSecret || !totpValid(row.totpSecret, code)) {
        res.status(401).json({ error: "Invalid authenticator code" });
        return;
      }
    }
    await db.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    res.json({ ok: true, totpEnabled: false });
  });
}

export async function getSessionUser(db: PrismaClient, req: Request): Promise<AuthUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!sessionId || !token) return null;
  const tokenHash = hashToken(token);
  const row = await db.session.findFirst({
    where: { id: sessionId, tokenHash },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt <= new Date()) {
    await db.session.deleteMany({ where: { id: sessionId } });
    return null;
  }
  return {
    id: row.user.id,
    email: row.user.email,
    totpEnabled: row.user.totpEnabled,
    isAdmin: row.user.isAdmin,
  };
}

export function requireUser(
  db: PrismaClient,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    getSessionUser(db, req)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: "Sign in required" });
          return;
        }
        (req as Request & { authUser: AuthUser }).authUser = user;
        next();
      })
      .catch(next);
  };
}
