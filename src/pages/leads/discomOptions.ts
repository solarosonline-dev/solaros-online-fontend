/**
 * State -> DISCOM static reference data for the lead-creation "State" / "Discom"
 * dropdowns. Sourced and pared down from the MNRE-derived ~/discom.json master
 * dataset (schema_version 1.0.0, last_verified 2026-08-23) — trimmed to just
 * {code, name} pairs since the rest of that dataset (portal URLs, capacity
 * limits, bill-identifier hints) has no UI use here.
 *
 * This is pure static reference data (states/DISCOMs change rarely and the
 * app has no server-side validation tied to it), so it lives in the frontend
 * bundle rather than behind a backend endpoint — consistent with the existing
 * DISCOMS/METER_TYPES/LEAD_TYPES lists in ./leadOptions.
 */

export type Discom = { code: string; name: string };
export type StateOption = { code: string; name: string };

export const STATES: StateOption[] = [
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CH", name: "Chandigarh" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "DN", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PY", name: "Puducherry" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
];

export const DISCOMS_BY_STATE: Record<string, Discom[]> = {
  AN: [{ code: "ED-AN", name: "Electricity Department, Andaman and Nicobar Islands" }],
  AP: [{ code: "APCPDCL", name: "Central Power Distribution Company of Andhra Pradesh Limited" }, { code: "APEPDCL", name: "Eastern Power Distribution Company of Andhra Pradesh Limited" }, { code: "APSPDCL", name: "Southern Power Distribution Company of Andhra Pradesh Limited" }],
  AR: [{ code: "DoP-AP", name: "Department of Power, Government of Arunachal Pradesh" }],
  AS: [{ code: "APDCL", name: "Assam Power Distribution Company Limited" }],
  BR: [{ code: "NBPDCL", name: "North Bihar Power Distribution Company Limited" }, { code: "SBPDCL", name: "South Bihar Power Distribution Company Limited" }],
  CH: [{ code: "CPDL", name: "Chandigarh Power Distribution Limited" }],
  CG: [{ code: "CSPDCL", name: "Chhattisgarh State Power Distribution Company Limited" }],
  DN: [{ code: "DNHDD", name: "Electricity Department, Union Territory of Dadra and Nagar Haveli and Daman and Diu" }],
  DL: [{ code: "BRPL", name: "BSES Rajdhani Power Limited" }, { code: "BYPL", name: "BSES Yamuna Power Limited" }, { code: "NDMC", name: "New Delhi Municipal Council" }, { code: "TPDDL", name: "Tata Power Delhi Distribution Limited" }],
  GA: [{ code: "ED-GOA", name: "Electricity Department, Government of Goa" }],
  GJ: [{ code: "DGVCL", name: "Dakshin Gujarat Vij Company Limited" }, { code: "MGVCL", name: "Madhya Gujarat Vij Company Limited" }, { code: "PGVCL", name: "Paschim Gujarat Vij Company Limited" }, { code: "TORRENT-AHD", name: "Torrent Power Limited - Ahmedabad" }, { code: "TORRENT-SURAT", name: "Torrent Power Limited - Surat" }, { code: "UGVCL", name: "Uttar Gujarat Vij Company Limited" }],
  HR: [{ code: "DHBVN", name: "Dakshin Haryana Bijli Vitran Nigam Limited" }, { code: "UHBVN", name: "Uttar Haryana Bijli Vitran Nigam Limited" }],
  HP: [{ code: "HPSEBL", name: "Himachal Pradesh State Electricity Board Limited" }],
  JK: [{ code: "JKPDD", name: "Power Development Department, Jammu and Kashmir" }],
  JH: [{ code: "JBVNL", name: "Jharkhand Bijli Vitran Nigam Limited" }],
  KA: [{ code: "BESCOM", name: "Bangalore Electricity Supply Company Limited" }, { code: "CESC", name: "Chamundeshwari Electricity Supply Corporation Limited" }, { code: "GESCOM", name: "Gulbarga Electricity Supply Company Limited" }, { code: "HESCOM", name: "Hubli Electricity Supply Company Limited" }, { code: "MESCOM", name: "Mangalore Electricity Supply Company Limited" }],
  KL: [{ code: "KSEBL", name: "Kerala State Electricity Board Limited" }],
  LD: [{ code: "ED-LD", name: "Electricity Department, Lakshadweep" }],
  MP: [{ code: "MPMKVVCL", name: "Madhya Pradesh Madhya Kshetra Vidyut Vitaran Company Limited" }, { code: "MPPKVVCL", name: "Madhya Pradesh Paschim Kshetra Vidyut Vitaran Company Limited" }, { code: "MPPKVVCL-E", name: "Madhya Pradesh Poorv Kshetra Vidyut Vitaran Company Limited" }],
  MH: [{ code: "BEST", name: "Brihanmumbai Electric Supply and Transport Undertaking" }, { code: "MSEDCL", name: "Maharashtra State Electricity Distribution Company Limited" }],
  MN: [{ code: "MSPDCL", name: "Manipur State Power Distribution Company Limited" }],
  ML: [{ code: "MePDCL", name: "Meghalaya Power Distribution Corporation Limited" }],
  MZ: [{ code: "PED-MZ", name: "Power and Electricity Department, Government of Mizoram" }],
  NL: [{ code: "DoPN", name: "Department of Power, Government of Nagaland" }],
  OD: [{ code: "TPCODL", name: "TP Central Odisha Distribution Limited" }, { code: "TPNODL", name: "TP Northern Odisha Distribution Limited" }, { code: "TPSODL", name: "TP Southern Odisha Distribution Limited" }, { code: "TPWODL", name: "TP Western Odisha Distribution Limited" }],
  PY: [{ code: "ED-PY", name: "Electricity Department, Government of Puducherry" }],
  PB: [{ code: "PSPCL", name: "Punjab State Power Corporation Limited" }],
  RJ: [{ code: "AVVNL", name: "Ajmer Vidyut Vitran Nigam Limited" }, { code: "JVVNL", name: "Jaipur Vidyut Vitran Nigam Limited" }, { code: "JDVVNL", name: "Jodhpur Vidyut Vitran Nigam Limited" }],
  SK: [{ code: "PD-SK", name: "Power Department, Government of Sikkim" }],
  TN: [{ code: "TNPDCL", name: "Tamil Nadu Power Distribution Corporation Limited" }],
  TS: [{ code: "TGNPDCL", name: "Northern Power Distribution Company of Telangana Limited" }, { code: "TGSPDCL", name: "Southern Power Distribution Company of Telangana Limited" }],
  TR: [{ code: "TSECL", name: "Tripura State Electricity Corporation Limited" }],
  UP: [{ code: "DVVNL", name: "Dakshinanchal Vidyut Vitran Nigam Limited" }, { code: "KESCO", name: "Kanpur Electricity Supply Company Limited" }, { code: "MVVNL", name: "Madhyanchal Vidyut Vitran Nigam Limited" }, { code: "PVVNL", name: "Pashchimanchal Vidyut Vitran Nigam Limited" }, { code: "PUVVNL", name: "Purvanchal Vidyut Vitran Nigam Limited" }],
  UK: [{ code: "UPCL", name: "Uttarakhand Power Corporation Limited" }],
  WB: [{ code: "CESC", name: "CESC Limited" }, { code: "WBSEDCL", name: "West Bengal State Electricity Distribution Company Limited" }],
};

/** Discoms for a given state code. Empty/unrecognized state -> []. Callers
 * should still offer a free-text "Other" escape hatch alongside this list
 * for cases the dataset doesn't (yet) cover. */
export function getDiscomsForState(stateCode: string): Discom[] {
  if (!stateCode) return [];
  return DISCOMS_BY_STATE[stateCode] ?? [];
}

/** Full state name for a state code — Lead.state stores just the short code
 * (dropdowns show codes only, since full names like "Dadra and Nagar Haveli
 * and Daman and Diu" break the layout), so anywhere the *customer-facing*
 * full name is needed (e.g. on a generated quote), look it up from here.
 * Falls back to the raw code for values outside this dataset. */
export function getStateName(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  return STATES.find((s) => s.code === stateCode)?.name ?? stateCode;
}

/** Full DISCOM name for a DISCOM code — same rationale as getStateName:
 * Lead.discom stores just the short code, so quote documents/customer-facing
 * copy should resolve it to the full legal name via this helper rather than
 * showing the bare code. Falls back to the raw code for values outside this
 * dataset (e.g. free-text "Other" entries). */
export function getDiscomName(discomCode: string | null | undefined): string | null {
  if (!discomCode) return null;
  for (const discoms of Object.values(DISCOMS_BY_STATE)) {
    const match = discoms.find((d) => d.code === discomCode);
    if (match) return match.name;
  }
  return discomCode;
}
