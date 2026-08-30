import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { activateAccount, verifyGstCertificate } from "../../api/auth";
import { ApiError } from "../../api/client";
import PasswordInput from "./PasswordInput";
import "./auth.css";

// "needs-gst" = email verified, but the entity is still PENDING_APPROVAL and
// needs a matching GST certificate upload (or manual admin approval) before
// it's fully active. "done" covers everyone else: entity already
// ACTIVE/INACTIVE, no entity at all (e.g. an invited team member), or the GST
// upload just matched -- doneKind picks the right copy for each of those.
type Status = "activating" | "needs-password" | "needs-gst" | "done" | "error";
type DoneKind = "email-only" | "activated";

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("activating");
  const [doneKind, setDoneKind] = useState<DoneKind>("email-only");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attempted = useRef(false);

  const [gstFile, setGstFile] = useState<File | null>(null);
  const [gstSubmitting, setGstSubmitting] = useState(false);
  const [gstError, setGstError] = useState<string | null>(null);
  const [gstNoMatchMessage, setGstNoMatchMessage] = useState<string | null>(null);
  const gstFileInputRef = useRef<HTMLInputElement>(null);

  function afterVerified(entityState: string | null) {
    if (entityState === "PENDING_APPROVAL") {
      setStatus("needs-gst");
    } else {
      setDoneKind("email-only");
      setStatus("done");
    }
  }

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    activateAccount(token)
      .then((res) => afterVerified(res.entity_state))
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
      const res = await activateAccount(token!, password);
      afterVerified(res.entity_state);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGstFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setGstFile(file);
  }

  async function handleGstSubmit() {
    if (!gstFile || !token) return;

    setGstError(null);
    setGstNoMatchMessage(null);
    setGstSubmitting(true);
    try {
      const res = await verifyGstCertificate(token, gstFile);
      if (res.status === "NO_MATCH") {
        setGstNoMatchMessage(res.message);
        setGstFile(null);
        if (gstFileInputRef.current) gstFileInputRef.current.value = "";
      } else {
        setDoneKind("activated");
        setStatus("done");
      }
    } catch (err) {
      setGstError(err instanceof ApiError ? err.message : "Couldn't upload this file — please try again.");
    } finally {
      setGstSubmitting(false);
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
            <h1 className="auth-title">Verifying your email…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (status === "needs-gst") {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">✅</div>
            <h1 className="auth-title">Email verified</h1>
            <p className="auth-subtitle">
              Upload your GST certificate and we'll activate your account automatically if it matches your
              registration details.
            </p>
          </div>

          <input
            ref={gstFileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            style={{ display: "none" }}
            onChange={handleGstFileSelect}
          />
          <button
            type="button"
            className="auth-submit"
            onClick={() => (gstFile ? handleGstSubmit() : gstFileInputRef.current?.click())}
            disabled={gstSubmitting}
          >
            {gstSubmitting
              ? "Verifying…"
              : gstFile
                ? `Upload ${gstFile.name}`
                : "📄 Choose GST certificate (PDF, JPG, or PNG)"}
          </button>
          {gstFile && !gstSubmitting && (
            <p className="auth-hint" style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setGstFile(null);
                  if (gstFileInputRef.current) gstFileInputRef.current.value = "";
                }}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
              >
                Choose a different file
              </button>
            </p>
          )}

          {gstError && (
            <p className="auth-error" role="alert">
              {gstError}
            </p>
          )}
          {gstNoMatchMessage && <p className="auth-hint">{gstNoMatchMessage}</p>}
        </div>
      </div>
    );
  }

  if (status === "done") {
    const activated = doneKind === "activated";
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-success">
            <div className="auth-success-icon">{activated ? "🎉" : "✅"}</div>
            <h1 className="auth-title">{activated ? "Account activated" : "Email verified"}</h1>
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
            {submitting ? "Activating…" : "Activate account"}
          </button>
        </form>
      </div>
    </div>
  );
}
