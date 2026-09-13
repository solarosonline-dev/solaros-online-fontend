// ============================================================
// Solar position math (simplified NOAA-style equations)
// ============================================================
export const DEG = Math.PI / 180;
export const toRad = (d) => d * DEG;
export const toDeg = (r) => r / DEG;

export function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export function solarDeclination(n) {
  return 23.45 * Math.sin(toRad((360 / 365) * (284 + n)));
}

export function equationOfTime(n) {
  const B = toRad((360 / 365) * (n - 81));
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

export function solarPosition(lat, lon, date, hourDecimal, tzOffset) {
  const n = dayOfYear(date);
  const decl = solarDeclination(n);
  const eot = equationOfTime(n);
  const standardMeridian = 15 * tzOffset;
  const timeCorrectionMin = 4 * (lon - standardMeridian) + eot;
  const solarTime = hourDecimal + timeCorrectionMin / 60;
  const H = 15 * (solarTime - 12);

  const latR = toRad(lat), declR = toRad(decl), HR = toRad(H);
  const sinElev = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(HR);
  const elevation = toDeg(Math.asin(Math.max(-1, Math.min(1, sinElev))));

  let azimuth = 180;
  if (elevation > -0.5) {
    const elevR = toRad(elevation);
    const denom = Math.cos(elevR) * Math.cos(latR) || 1e-9;
    const cosAz = (Math.sin(declR) - Math.sin(elevR) * Math.sin(latR)) / denom;
    const az = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
    azimuth = H > 0 ? 360 - az : az;
  }
  return { elevation, azimuth };
}
