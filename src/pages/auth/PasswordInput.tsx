import { useState } from "react";

/** A password `<input>` with a small show/hide toggle -- drops in wherever
 * a plain `type="password"` input was, keeping the caller's own
 * `.auth-field` wrapper/label/error markup untouched. */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
