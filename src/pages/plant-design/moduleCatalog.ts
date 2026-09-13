// A small catalog of real module datasheets, used to drive the "Panel
// configuration" picker (make -> model) instead of free-form sliders.
// tempCoeffVoc is %/°C (negative - Voc rises as it gets colder).
// width/height are in meters, portrait orientation (short edge x long edge).
//
// Sourced from manufacturer datasheets (STC values):
// - Adani: adanisolar.com Eternal Shine ASM-M10-144 series datasheet
// - Waaree: Elite Series N-Type BiN-03 series datasheet (WEL/E&PD/680-715/132/BiN-03/HC)
// - Vikram Solar: Somera VSMH.72.AAA.05 series datasheet (VSL/ENG/SC/269-R01)
// - Trina Solar: Vertex S+ NEG9R.28 datasheet (TSM_EN_2024_C)
export const MODULE_CATALOG = [
  {
    make: 'Adani',
    model: 'ASM-M10-144-550',
    wattage: 550,
    width: 1.133,
    height: 2.266,
    voc: 49.67,
    vmp: 42.09,
    isc: 13.85,
    imp: 13.07,
    tempCoeffVoc: -0.28,
  },
  {
    make: 'Adani',
    model: 'ASM-M10-144-535',
    wattage: 535,
    width: 1.133,
    height: 2.266,
    voc: 49.12,
    vmp: 41.64,
    isc: 13.63,
    imp: 12.86,
    tempCoeffVoc: -0.28,
  },
  {
    make: 'Waaree',
    model: 'BiN-03-700',
    wattage: 700,
    width: 1.303,
    height: 2.384,
    voc: 48.58,
    vmp: 40.49,
    isc: 18.31,
    imp: 17.29,
    tempCoeffVoc: -0.26,
  },
  {
    make: 'Vikram Solar',
    model: 'Somera VSMH.72.545.05',
    wattage: 545,
    width: 1.134,
    height: 2.274,
    voc: 49.6,
    vmp: 41.8,
    isc: 13.73,
    imp: 13.04,
    tempCoeffVoc: -0.27,
  },
  {
    make: 'Trina Solar',
    model: 'Vertex S+ TSM-440NEG9R.28',
    wattage: 440,
    width: 1.134,
    height: 1.762,
    voc: 51.4,
    vmp: 43.2,
    isc: 10.59,
    imp: 9.96,
    tempCoeffVoc: -0.24,
  },
];

export const CUSTOM_MODULE_MAKE = 'Custom';

export function moduleCatalogMakes() {
  return [...new Set(MODULE_CATALOG.map((m) => m.make))];
}

export function moduleCatalogModels(make) {
  return MODULE_CATALOG.filter((m) => m.make === make);
}

export function findModule(make, model) {
  return MODULE_CATALOG.find((m) => m.make === make && m.model === model) ?? null;
}
