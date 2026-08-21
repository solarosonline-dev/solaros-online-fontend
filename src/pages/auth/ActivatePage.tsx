import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { activateAccount } from "../../api/auth";
import { ApiError } from "../../api/client";
import "./auth.css";

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await activateAccount(token!, password || undefined);
      setActivated(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">⚠️</div>
            <h1 className="auth-title">Missing activation link</h1>
            <p className="auth-subtitle">
              This page needs a valid activation token. Please use the link from your activation email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">✅</div>
            <h1 className="auth-title">Account activated</h1>
            <p className="auth-subtitle">You can now sign in.</p>
          </div>
          <p className="auth-footnote">
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          Solar<em>OS</em>
        </div>
        <h1 className="auth-title">Activate your account</h1>
        <p className="auth-subtitle">
          If you didn't already set a password when registering, choose one now.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="password">Password <span className="auth-optional">(skip if already set)</span></label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!password}
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Activating…" : "Activate account"}
          </button>
        </form>
      </div>
    </div>
  );
}
