// The Email module's `from_email` is stored on the backend as a single full
// string, e.g. "SolarOS Connect <connect@solaros.online>" -- see
// app/schemas/email.py's _FROM_EMAIL_RE. The domain is fixed to
// solaros.online (the only domain verified for sending in Resend), so this
// UI only ever lets an admin edit the display name and local-part, never
// the domain -- composeFromEmail/parseFromEmail keep that split at the edge
// so the rest of the app can just pass the composed string around.

export const FROM_EMAIL_DOMAIN = "solaros.online";
export const DEFAULT_DISPLAY_NAME = "SolarOS Connect";
export const DEFAULT_LOCAL_PART = "connect";

const FROM_EMAIL_RE = /^(.+) <([^@\s]+)@solaros\.online>$/;

export function composeFromEmail(displayName: string, localPart: string): string {
  return `${displayName.trim()} <${localPart.trim()}@${FROM_EMAIL_DOMAIN}>`;
}

export function parseFromEmail(value: string | null | undefined): { displayName: string; localPart: string } {
  if (!value) return { displayName: "", localPart: "" };
  const match = FROM_EMAIL_RE.exec(value);
  if (!match) return { displayName: "", localPart: "" };
  return { displayName: match[1], localPart: match[2] };
}
