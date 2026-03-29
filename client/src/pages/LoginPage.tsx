import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../authApi.js";
import { useAuth } from "../authContext.js";

export function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await authApi.register(email, password);
      } else {
        await authApi.login(email, password, totpCode.trim() || undefined);
      }
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="page-title">{mode === "register" ? "Create account" : "Sign in"}</h1>
      <p className="page-lede">
        Use email and password, add an authenticator app for one-time codes, or{" "}
        <Link to="/login/link">sign in with a link</Link> (60-day session).
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      <form className="auth-card card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        </div>
        {mode === "signin" ? (
          <div className="field">
            <label htmlFor="login-totp">Authenticator code (if enabled)</label>
            <input
              id="login-totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digits"
              value={totpCode}
              onChange={(ev) => setTotpCode(ev.target.value)}
            />
          </div>
        ) : null}
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "register" ? "Register" : "Sign in"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setMode(mode === "signin" ? "register" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? "Need an account?" : "Already registered?"}
          </button>
        </div>
      </form>
    </div>
  );
}
