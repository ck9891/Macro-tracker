async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const cred: RequestInit = { credentials: "include" };

export type AuthUser = {
  id: string;
  email: string;
  totpEnabled: boolean;
  isAdmin: boolean;
};

export const authApi = {
  me: () => fetch("/api/auth/me", cred).then((r) => json<{ user: AuthUser }>(r)),

  register: (email: string, password: string) =>
    fetch("/api/auth/register", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => json<{ user: AuthUser }>(r)),

  login: (email: string, password: string, totpCode?: string) =>
    fetch("/api/auth/login", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, totpCode: totpCode || undefined }),
    }).then((r) => json<{ user: AuthUser }>(r)),

  logout: () => fetch("/api/auth/logout", { ...cred, method: "POST" }).then((r) => json<void>(r)),

  requestMagicLink: (email: string) =>
    fetch("/api/auth/link/request", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) =>
      json<{ ok: boolean; link?: string; expiresInMinutes?: number }>(r),
    ),

  consumeMagicLink: (token: string) =>
    fetch("/api/auth/link/consume", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) => json<{ user: AuthUser }>(r)),

  totpSetup: () =>
    fetch("/api/auth/totp/setup", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((r) => json<{ secret: string; otpauthUrl: string }>(r)),

  totpEnable: (code: string) =>
    fetch("/api/auth/totp/enable", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => json<{ ok: boolean; totpEnabled: boolean }>(r)),

  totpDisable: (password: string, code: string) =>
    fetch("/api/auth/totp/disable", {
      ...cred,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, code }),
    }).then((r) => json<{ ok: boolean; totpEnabled: boolean }>(r)),
};
