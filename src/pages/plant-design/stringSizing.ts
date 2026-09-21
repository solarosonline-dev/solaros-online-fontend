// Temperature-corrected string sizing: given a module, an inverter, and the
// site's design temperature extremes, work out how many modules can go in
// series per string and how many strings can share one MPPT. See the
// "electrical design" phase in ROADMAP.md for the full context.
//
// Cold raises Voc (overvoltage risk against the inverter's max DC voltage
// and MPPT window) - that bounds the max string length. Heat lowers Vmp
// (undervoltage risk, MPPT can't track below its window's floor) - that
// bounds the min string length. Module datasheets only publish a Voc temp
// coefficient, so it's the standard stand-in for Vmp's temperature
// dependence too (Vmp tracks Voc closely enough for this purpose).

const STC_TEMP_C = 25;

export function tempCorrectedVoltage(voltageAtStc, tempCoeffPctPerC, tempC) {
  return voltageAtStc * (1 + (tempCoeffPctPerC / 100) * (tempC - STC_TEMP_C));
}

// Max modules in series without exceeding the inverter's absolute max DC
// voltage or its MPPT window's upper bound, at the coldest design temp.
// `mpptVoltageUtilizationPct` (default 100) lets the MPPT window's upper
// bound be pushed past its rated value - inverters keep tracking somewhat
// above that rated window, just with reduced accuracy at the extremes, so
// installers commonly allow strings up to ~120% of it. The absolute max DC
// voltage is a hard safety rating regardless and is never scaled.
export function maxModulesPerString(module, inverter, designMinTempC, mpptVoltageUtilizationPct = 100) {
  const vocCold = tempCorrectedVoltage(module.voc, module.tempCoeffVoc, designMinTempC);
  if (vocCold <= 0) return 0;
  const byAbsoluteMax = Math.floor(inverter.maxDcVoltage / vocCold);
  const byMpptWindow = Math.floor((inverter.mpptVoltageMax * (mpptVoltageUtilizationPct / 100)) / vocCold);
  return Math.max(0, Math.min(byAbsoluteMax, byMpptWindow));
}

// Min modules in series needed to keep Vmp above the MPPT window's lower
// bound at the hottest design temp (otherwise the inverter can't track).
export function minModulesPerString(module, inverter, designMaxTempC) {
  const vmpHot = tempCorrectedVoltage(module.vmp, module.tempCoeffVoc, designMaxTempC);
  if (vmpHot <= 0) return Infinity;
  return Math.ceil(inverter.mpptVoltageMin / vmpHot);
}

// Max strings that can land on one MPPT channel without exceeding its max
// input current (assumes strings are wired in parallel on the same MPPT).
export function maxStringsPerMppt(module, inverter) {
  if (module.isc <= 0) return 0;
  return Math.max(0, Math.floor(inverter.maxCurrentPerMppt / module.isc));
}

// Full sizing summary for a module/inverter/design-temp combination.
export function sizeStrings(module, inverter, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct = 100) {
  const minPerString = minModulesPerString(module, inverter, designMaxTempC);
  const maxPerString = maxModulesPerString(module, inverter, designMinTempC, mpptVoltageUtilizationPct);
  const stringsPerMppt = maxStringsPerMppt(module, inverter);
  const valid = Number.isFinite(minPerString) && maxPerString >= minPerString && stringsPerMppt > 0;
  return {
    minModulesPerString: minPerString,
    maxModulesPerString: maxPerString,
    maxStringsPerMppt: stringsPerMppt,
    maxModulesPerMppt: valid ? maxPerString * stringsPerMppt : 0,
    maxModulesPerInverter: valid ? maxPerString * stringsPerMppt * inverter.mpptCount : 0,
    valid,
  };
}
