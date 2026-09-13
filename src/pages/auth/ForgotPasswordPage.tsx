import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../api/auth";
import { ApiError } from "../../api/client";
import "./auth.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">✉️</div>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">
              If that email is registered, we've sent a link to reset your password.
            </p>
          </div>
          <p className="auth-footnote">
            <Link to="/login">Back to sign in</Link>
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
        <h1 className="auth-title">Forgot password?</h1>
        <p className="auth-subtitle">Enter your email and we'll send you a link to reset your password.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="auth-footnote">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
