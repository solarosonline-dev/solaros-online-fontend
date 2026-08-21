import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { registerEntity } from "../../api/entityRegistration";
import { ApiError } from "../../api/client";
import "./auth.css";

const ENTITY_TYPES = ["EPC", "Financier (NBFC/Bank)", "RESCO Investor/Asset Owner", "O&M Vendor"];

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState(ENTITY_TYPES[0]);
  const [gstno, setGstno] = useState("");
  const [address, setAddress] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerEntity({
        entity: { name, type, gstno, address },
        admin_user: { full_name: fullName, email, phone, password },
      });
      setSuccessMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">📧</div>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">{successMessage}</p>
          </div>
          <p className="auth-footnote">
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card--wide">
        <div className="auth-logo">
          Solar<em>OS</em>
        </div>
        <h1 className="auth-title">Register your business</h1>
        <p className="auth-subtitle">Create your entity account and invite your team once approved.</p>

        <form onSubmit={handleSubmit} noValidate>
          <p className="auth-section-label">Business details</p>

          <div className="auth-field">
            <label htmlFor="name">Business name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label htmlFor="type">Business type</label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label htmlFor="gstno">GST number</label>
              <input id="gstno" type="text" value={gstno} onChange={(e) => setGstno(e.target.value)} required />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="address">Address</label>
            <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>

          <p className="auth-section-label">Your details (founding admin)</p>

          <div className="auth-field">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>

          <div className="auth-field-row">
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
          </div>
          <p className="auth-hint">
            At least 8 characters, one uppercase letter, one number, and one special character.
          </p>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Submitting…" : "Register"}
          </button>
        </form>

        <p className="auth-footnote">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
