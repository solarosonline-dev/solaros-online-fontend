import { FROM_EMAIL_DOMAIN } from "../lib/emailFromAddress";

// Shared by EmailTemplatesPanel and EmailComposePanel -- an admin can only
// ever edit the display name and local-part; the @solaros.online domain is
// fixed and shown as plain, non-editable text (see lib/emailFromAddress.ts
// for why: it's the only domain verified for sending in Resend).
export function FromEmailFields({
  displayName,
  localPart,
  onDisplayNameChange,
  onLocalPartChange,
}: {
  displayName: string;
  localPart: string;
  onDisplayNameChange: (value: string) => void;
  onLocalPartChange: (value: string) => void;
}) {
  return (
    <div className="email-from-fields">
      <label>
        From display name
        <input
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="SolarOS Connect"
        />
      </label>
      <label>
        From address
        <div className="email-from-fields-address">
          <input
            type="text"
            value={localPart}
            onChange={(e) => onLocalPartChange(e.target.value)}
            placeholder="connect"
          />
          <span className="email-from-fields-domain">@{FROM_EMAIL_DOMAIN}</span>
        </div>
      </label>
    </div>
  );
}
