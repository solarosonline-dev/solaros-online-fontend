// Monthly average daily global-horizontal irradiance (GHI, kWh/m^2/day) for
// a site — replaces layoutEngine.js's own SAMPLE_MONTHLY_GHI (an
// illustrative placeholder, same shape) once a location is known.
//
// Talks directly to NASA POWER's public climatology endpoint for now (free,
// no API key, global coverage, long-term monthly averages, and CORS-enabled
// so a plain browser fetch works) — kept in its own module behind a single
// async function so this can move behind our own backend later (server-side
// caching, a paid higher-resolution provider, hiding the request from the
// client entirely) without any caller needing to change: same { lat, lon }
// in, same 12-value Jan-Dec array out.
const NASA_POWER_CLIMATOLOGY_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export async function fetchMonthlyGHI({ lat, lon }) {
  const url = `${NASA_POWER_CLIMATOLOGY_URL}?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER request failed (${res.status})`);
  const json = await res.json();
  const monthly = json?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  if (!monthly) throw new Error('NASA POWER response missing ALLSKY_SFC_SW_DWN');
  const values = MONTH_KEYS.map((k) => monthly[k]);
  if (values.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    throw new Error('NASA POWER response had a non-numeric monthly value');
  }
  return values;
}

// Design ambient temperature range for a site, used by stringSizing.js's
// temperature-corrected Voc/Vmp checks. NASA POWER's climatology only gives
// monthly-average daily min/max (T2M_MIN/T2M_MAX), not true record extremes
// (e.g. an ASHRAE 99.6%/0.4% design value) - taking the coldest month's
// average min and hottest month's average max is a reasonable, if slightly
// less conservative, stand-in until a proper design-temperature source is
// wired in. Same swappable-function shape as fetchMonthlyGHI above.
export async function fetchDesignTemperatureRange({ lat, lon }) {
  const url = `${NASA_POWER_CLIMATOLOGY_URL}?parameters=T2M_MIN,T2M_MAX&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER request failed (${res.status})`);
  const json = await res.json();
  const minByMonth = json?.properties?.parameter?.T2M_MIN;
  const maxByMonth = json?.properties?.parameter?.T2M_MAX;
  if (!minByMonth || !maxByMonth) throw new Error('NASA POWER response missing T2M_MIN/T2M_MAX');
  const mins = MONTH_KEYS.map((k) => minByMonth[k]);
  const maxes = MONTH_KEYS.map((k) => maxByMonth[k]);
  if ([...mins, ...maxes].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    throw new Error('NASA POWER response had a non-numeric monthly temperature value');
  }
  return { min: Math.min(...mins), max: Math.max(...maxes) };
}
