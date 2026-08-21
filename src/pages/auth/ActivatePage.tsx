import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { activateAccount } from "../../api/auth";
import { ApiError } from "../../api/client";
import "./auth.css";

type Status = "activating" | "needs-password" | "activated" | "error";

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("activating");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    activateAccount(token)
      .then(() => setStatus("activated"))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "PASSWORD_REQUIRED") {
          setStatus("needs-password");
        } else {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
          setStatus("error");
        }
      });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await activateAccount(token!, password);
      setStatus("activated");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
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

  if (status === "activating") {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <h1 className="auth-title">Activating your account…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (status === "activated") {
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

  if (status === "error") {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">⚠️</div>
            <h1 className="auth-title">Couldn't activate account</h1>
            <p className="auth-subtitle">{error}</p>
          </div>
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
        <h1 className="auth-title">Set your password</h1>
        <p className="auth-subtitle">Choose a password to activate your account.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
              required
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Activating…" : "Activate account"}
          </button>
        </form>
      </div>
    </div>
  );
}
