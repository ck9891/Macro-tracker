import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../authApi.js";
import { useAuth } from "../authContext.js";
import { consumeMagicLinkOnce } from "../magicLinkConsume.js";

export function LinkLoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token");

  const [email, setEmail] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [expiresMin, setExpiresMin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!tokenFromUrl) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await consumeMagicLinkOnce(tokenFromUrl);
        if (cancelled) return;
        await refresh();
        navigate("/", { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Link could not be used");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenFromUrl, refresh, navigate]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setMagicLink(null);
    setExpiresMin(null);
    setBusy(true);
    try {
      const res = await authApi.requestMagicLink(email.trim());
      if (res.link) {
        setMagicLink(res.link);
        setExpiresMin(res.expiresInMinutes ?? null);
      } else {
        setInfo(
          "No account uses that email yet, or the link was not returned. Register on the password page first, then try again.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (tokenFromUrl && busy && !error) {
    return (
      <div className="auth-page">
        <p className="loader">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1 className="page-title">Sign in with a link</h1>
      <p className="page-lede">
        One-time links expire in about 15 minutes. After you open a valid link, you stay signed in for 60 days.
        For local development the link is shown on this page instead of email.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      {info ? <p className="subtle">{info}</p> : null}
      <form className="auth-card card" onSubmit={requestLink}>
        <div className="field">
          <label htmlFor="magic-email">Email</label>
          <input
            id="magic-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait…" : "Get sign-in link"}
          </button>
          <Link to="/login" className="btn btn-ghost">
            Password sign-in
          </Link>
        </div>
      </form>
      {magicLink ? (
        <div className="card auth-magic-result">
          <p className="subtle">
            Link valid for about {expiresMin ?? 15} minutes. Open it in this browser (same origin):
          </p>
          <a className="mono magic-link-anchor" href={magicLink}>
            {magicLink}
          </a>
        </div>
      ) : null}
    </div>
  );
}
