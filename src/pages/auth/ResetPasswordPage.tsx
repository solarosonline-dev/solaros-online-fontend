import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../api/auth";
import { ApiError } from "../../api/client";
import PasswordInput from "./PasswordInput";
import "./auth.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reset, setReset] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token!, password);
      setReset(true);
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
            <h1 className="auth-title">Missing reset link</h1>
            <p className="auth-subtitle">
              This page needs a valid reset token. Please use the link from your password reset email.
            </p>
          </div>
          <p className="auth-footnote">
            <Link to="/forgot-password">Request a new link</Link>
          </p>
        </div>
      </div>
    );
  }

  if (reset) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">✅</div>
            <h1 className="auth-title">Password reset</h1>
            <p className="auth-subtitle">You can now sign in with your new password.</p>
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
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="password">New password</label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </form>

        <p className="auth-footnote">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
