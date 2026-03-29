import { useState } from "react";
import { authApi } from "../authApi.js";
import { useAuth } from "../authContext.js";

export function AccountPage() {
  const { state, refresh, signOut } = useAuth();
  const user = state.status === "signedIn" ? state.user : null;

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function startTotp() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const r = await authApi.totpSetup();
      setSetupSecret(r.secret);
      setSetupUri(r.otpauthUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function enableTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await authApi.totpEnable(enableCode.replace(/\s/g, ""));
      setEnableCode("");
      setSetupSecret(null);
      setSetupUri(null);
      await refresh();
      setMessage("Authenticator enabled. You will need a code when signing in with password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable");
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await authApi.totpDisable(disablePassword, disableCode.replace(/\s/g, ""));
      setDisablePassword("");
      setDisableCode("");
      await refresh();
      setMessage("Authenticator disabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Account</h1>
      <p className="page-lede">
        Signed in as {user.email}
        {user.isAdmin ? (
          <span className="pill" style={{ marginLeft: "0.5rem" }}>
            Admin
          </span>
        ) : null}
      </p>
      {message ? <p className="subtle">{message}</p> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Authenticator (one-time codes)</h2>
        <p className="subtle">
          Compatible with Google Authenticator and similar apps (TOTP). After enabling, password sign-in also
          requires a 6-digit code.
        </p>
        {user.totpEnabled ? (
          <p className="pill">Authenticator is on</p>
        ) : (
          <p className="pill">Authenticator is off</p>
        )}

        {!user.totpEnabled ? (
          <div style={{ marginTop: "1rem" }}>
            {!setupSecret ? (
              <button type="button" className="btn btn-primary" onClick={startTotp} disabled={busy}>
                Start setup
              </button>
            ) : (
              <form onSubmit={enableTotp}>
                <p className="subtle">
                  Add this secret to your app (or scan if you generate a QR from the URI below):
                </p>
                <p className="mono" style={{ wordBreak: "break-all" }}>
                  {setupSecret}
                </p>
                {setupUri ? (
                  <p className="mono subtle" style={{ wordBreak: "break-all", fontSize: "0.75rem" }}>
                    {setupUri}
                  </p>
                ) : null}
                <div className="field">
                  <label htmlFor="totp-enable">Code from app</label>
                  <input
                    id="totp-enable"
                    inputMode="numeric"
                    value={enableCode}
                    onChange={(ev) => setEnableCode(ev.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Confirm and enable
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={disableTotp} style={{ marginTop: "1rem" }}>
            <div className="field">
              <label htmlFor="totp-disable-pw">Password</label>
              <input
                id="totp-disable-pw"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(ev) => setDisablePassword(ev.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="totp-disable-code">Authenticator code</label>
              <input
                id="totp-disable-code"
                inputMode="numeric"
                value={disableCode}
                onChange={(ev) => setDisableCode(ev.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-danger" disabled={busy}>
              Turn off authenticator
            </button>
          </form>
        )}
      </div>

      <div className="button-row" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
