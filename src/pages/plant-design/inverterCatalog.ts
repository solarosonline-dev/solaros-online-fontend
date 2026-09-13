// A small catalog of real string-inverter datasheets, used to size strings
// per MPPT and pick how many inverters a grid needs (see the "electrical
// design" phase in ROADMAP.md). Mirrors moduleCatalog.js's make/model shape.
//
// Deye entries sourced from the manufacturer's HV-variant datasheet
// (SUN-40/45/50K-G04, deyeinverter.com, 2023-12-11) - not the "-LV" suffix
// variant, which is a different 220/230V-class (Brazil/LatAm) product with
// a different DC voltage window; the plain "-G04" HV variant's 230/400V AC
// output is what actually fits a 415V-class grid (India and similar).
export const INVERTER_CATALOG = [
  {
    make: 'Deye',
    model: 'SUN-50K-G04',
    acPowerKw: 50,
    maxDcVoltage: 1100,
    mpptCount: 4,
    maxCurrentPerMppt: 40,
    mpptVoltageMin: 200,
    mpptVoltageMax: 1000,
    maxAcCurrent: 79.7,
    acVoltage: 400,
    phase: 3,
  },
  {
    make: 'Deye',
    model: 'SUN-45K-G04',
    acPowerKw: 45,
    maxDcVoltage: 1100,
    mpptCount: 4,
    maxCurrentPerMppt: 40,
    mpptVoltageMin: 200,
    mpptVoltageMax: 1000,
    maxAcCurrent: 71.7,
    acVoltage: 400,
    phase: 3,
  },
  {
    make: 'Deye',
    model: 'SUN-40K-G04',
    acPowerKw: 40,
    maxDcVoltage: 1100,
    mpptCount: 3,
    maxCurrentPerMppt: 40,
    mpptVoltageMin: 200,
    mpptVoltageMax: 1000,
    maxAcCurrent: 63.8,
    acVoltage: 400,
    phase: 3,
  },
];

export const CUSTOM_INVERTER_MAKE = 'Custom';

export function inverterCatalogMakes() {
  return [...new Set(INVERTER_CATALOG.map((i) => i.make))];
}

export function inverterCatalogModels(make) {
  return INVERTER_CATALOG.filter((i) => i.make === make);
}

export function findInverter(make, model) {
  return INVERTER_CATALOG.find((i) => i.make === make && i.model === model) ?? null;
}
