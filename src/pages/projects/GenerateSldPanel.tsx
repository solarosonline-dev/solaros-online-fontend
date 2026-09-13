import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProjectWorkOrder, type SldInverterLayout, type SldSystemSpecs } from "../../api/workOrders";
import { ApiError } from "../../api/client";

/**
 * Dedicated entry point for creating an SLD_GENERATION work order --
 * deliberately separate from the fixed-phase panel in ProjectWorkOrders
 * (Site survey -> Installation -> Documentation), since generating a Single
 * Line Diagram isn't a funnel phase and can be done at any point in a
 * project's life (mirrors how AMC_SERVICE work orders are created outside
 * that panel too). Always visible, not gated on project status.
 *
 * Captures panel wattage/make/model, system-level cable/protection/rating
 * specs (entered once -- they repeat identically across arrays on a real
 * DISCOM SLD), and the actual per-inverter/per-string layout -- one or more
 * inverters, each with its own capacity, make/model, AC cable/breaker spec,
 * and its own list of DC strings (each string just needs its panel count,
 * since panel wattage is shared). Total panel count and string count are
 * derived from this, not asked separately, so they can never disagree with
 * what's actually wired up -- see sld_layout/sld_specs on the backend.
 *
 * All cable/protection/rating fields are free-text (installers type ratings
 * like "3P 32A MCB" as a string, not a structured picker) -- mirrors how the
 * reference DISCOM diagram itself just prints free-text ratings, and avoids
 * inventing a fake enum of every breaker/cable spec on the market.
 *
 * On success, navigates straight to the new work order's detail page, where
 * WorkOrderDetailPage renders the entered specs and the "Generate PDF"
 * action (server-rendered via app/services/sld_diagram.py).
 */

type StringRow = { id: number; panels: string };
type InverterRow = {
  id: number;
  capacityKw: string;
  make: string;
  model: string;
  acCable: string;
  acBreaker: string;
  strings: StringRow[];
};

function newStringRow(nextId: () => number): StringRow {
  return { id: nextId(), panels: "" };
}

function newInverterRow(nextId: () => number): InverterRow {
  return {
    id: nextId(),
    capacityKw: "",
    make: "",
    model: "",
    acCable: "",
    acBreaker: "",
    strings: [newStringRow(nextId)],
  };
}

export default function GenerateSldPanel({ entityId, projectId }: { entityId: number; projectId: number }) {
  const navigate = useNavigate();
  const idCounter = useRef(0);
  const nextId = () => ++idCounter.current;

  const [panelWattageW, setPanelWattageW] = useState("");
  const [panelMake, setPanelMake] = useState("");
  const [panelModel, setPanelModel] = useState("");

  const [dcStringCable, setDcStringCable] = useState("");
  const [dcCombinerProtection, setDcCombinerProtection] = useState("");
  const [dcEarthingCable, setDcEarthingCable] = useState("");
  const [lightningArrestor, setLightningArrestor] = useState(true);
  const [busbarRatingA, setBusbarRatingA] = useState("");
  const [mainIncomerProtection, setMainIncomerProtection] = useState("");
  const [meterCable, setMeterCable] = useState("");

  // Seeded with fixed literal ids (nextId() starts at 1) rather than calling
  // nextId() here -- that would touch the idCounter ref during render, which
  // React/lint rightly flag even inside a useState lazy initializer.
  const [inverters, setInverters] = useState<InverterRow[]>(() => [
    { id: 0, capacityKw: "", make: "", model: "", acCable: "", acBreaker: "", strings: [{ id: 0, panels: "" }] },
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addInverter() {
    setInverters((prev) => [...prev, newInverterRow(nextId)]);
  }

  function removeInverter(inverterId: number) {
    setInverters((prev) => prev.filter((inv) => inv.id !== inverterId));
  }

  function updateInverter<K extends keyof InverterRow>(inverterId: number, field: K, value: InverterRow[K]) {
    setInverters((prev) => prev.map((inv) => (inv.id === inverterId ? { ...inv, [field]: value } : inv)));
  }

  function addString(inverterId: number) {
    setInverters((prev) =>
      prev.map((inv) => (inv.id === inverterId ? { ...inv, strings: [...inv.strings, newStringRow(nextId)] } : inv)),
    );
  }

  function removeString(inverterId: number, stringId: number) {
    setInverters((prev) =>
      prev.map((inv) =>
        inv.id === inverterId ? { ...inv, strings: inv.strings.filter((s) => s.id !== stringId) } : inv,
      ),
    );
  }

  function updateStringPanels(inverterId: number, stringId: number, panels: string) {
    setInverters((prev) =>
      prev.map((inv) =>
        inv.id === inverterId
          ? { ...inv, strings: inv.strings.map((s) => (s.id === stringId ? { ...s, panels } : s)) }
          : inv,
      ),
    );
  }

  const panelWattageNum = Number(panelWattageW);
  const panelWattageValid = panelWattageW !== "" && panelWattageNum > 0;
  const panelIdentityValid = panelMake.trim() !== "" && panelModel.trim() !== "";
  const invertersValid =
    inverters.length > 0 &&
    inverters.every(
      (inv) =>
        inv.capacityKw !== "" &&
        Number(inv.capacityKw) > 0 &&
        inv.make.trim() !== "" &&
        inv.model.trim() !== "" &&
        inv.acCable.trim() !== "" &&
        inv.acBreaker.trim() !== "" &&
        inv.strings.length > 0 &&
        inv.strings.every((s) => s.panels !== "" && Number(s.panels) > 0),
    );
  const busbarRatingNum = Number(busbarRatingA);
  const specsValid =
    dcStringCable.trim() !== "" &&
    dcCombinerProtection.trim() !== "" &&
    dcEarthingCable.trim() !== "" &&
    busbarRatingA !== "" &&
    busbarRatingNum > 0 &&
    mainIncomerProtection.trim() !== "" &&
    meterCable.trim() !== "";
  const canSubmit = panelWattageValid && panelIdentityValid && invertersValid && specsValid;

  const totalPanels = inverters.reduce(
    (sum, inv) => sum + inv.strings.reduce((s, str) => s + (Number(str.panels) || 0), 0),
    0,
  );
  const totalStrings = inverters.reduce((sum, inv) => sum + inv.strings.length, 0);
  const totalCapacityKw = inverters.reduce((sum, inv) => sum + (Number(inv.capacityKw) || 0), 0);

  async function handleCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const sld_layout: SldInverterLayout[] = inverters.map((inv) => ({
        capacity_kw: Number(inv.capacityKw),
        make: inv.make.trim(),
        model: inv.model.trim(),
        ac_cable: inv.acCable.trim(),
        ac_breaker: inv.acBreaker.trim(),
        strings: inv.strings.map((s) => Number(s.panels)),
      }));
      const sld_specs: SldSystemSpecs = {
        dc_string_cable: dcStringCable.trim(),
        dc_combiner_protection: dcCombinerProtection.trim(),
        dc_earthing_cable: dcEarthingCable.trim(),
        lightning_arrestor: lightningArrestor,
        busbar_rating_a: busbarRatingNum,
        main_incomer_protection: mainIncomerProtection.trim(),
        meter_cable: meterCable.trim(),
      };
      const res = await createProjectWorkOrder(entityId, projectId, {
        type: "SLD_GENERATION",
        panel_wattage_w: panelWattageNum,
        panel_make: panelMake.trim(),
        panel_model: panelModel.trim(),
        sld_layout,
        sld_specs,
      });
      navigate(`/app/work-orders/${res.work_order_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create work order");
      setCreating(false);
    }
  }

  return (
    <>
      <p className="projects-section-label">Single line diagram</p>
      <div className="sld-generate-panel">
        <div className="amc-field sld-panel-wattage-field">
          <label>Panel wattage (W)</label>
          <input
            type="number"
            min="1"
            placeholder="e.g. 540"
            value={panelWattageW}
            onChange={(e) => setPanelWattageW(e.target.value)}
          />
        </div>
        <div className="amc-field">
          <label>Panel make</label>
          <input type="text" placeholder="e.g. Waaree" value={panelMake} onChange={(e) => setPanelMake(e.target.value)} />
        </div>
        <div className="amc-field">
          <label>Panel model</label>
          <input type="text" placeholder="e.g. WSM-540" value={panelModel} onChange={(e) => setPanelModel(e.target.value)} />
        </div>

        <p className="work-order-type-hint">System-wide cable/protection/rating specs -- entered once:</p>
        <div className="sld-system-specs-card">
          <div className="amc-field">
            <label>DC string cable</label>
            <input
              type="text"
              placeholder="e.g. 1C x 6 sqmm (Cu)"
              value={dcStringCable}
              onChange={(e) => setDcStringCable(e.target.value)}
            />
          </div>
          <div className="amc-field">
            <label>DC combiner protection</label>
            <input
              type="text"
              placeholder="e.g. SPD + string fuses"
              value={dcCombinerProtection}
              onChange={(e) => setDcCombinerProtection(e.target.value)}
            />
          </div>
          <div className="amc-field">
            <label>DC earthing cable</label>
            <input
              type="text"
              placeholder="e.g. 6 sqmm Cu / 25x3mm GI strip"
              value={dcEarthingCable}
              onChange={(e) => setDcEarthingCable(e.target.value)}
            />
          </div>
          <label className="sld-checkbox-field">
            <input type="checkbox" checked={lightningArrestor} onChange={(e) => setLightningArrestor(e.target.checked)} />
            Lightning arrestor fitted
          </label>
          <div className="amc-field">
            <label>Busbar rating (A)</label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 200"
              value={busbarRatingA}
              onChange={(e) => setBusbarRatingA(e.target.value)}
            />
          </div>
          <div className="amc-field">
            <label>Main incomer protection</label>
            <input
              type="text"
              placeholder="e.g. MCCB + ELCB"
              value={mainIncomerProtection}
              onChange={(e) => setMainIncomerProtection(e.target.value)}
            />
          </div>
          <div className="amc-field">
            <label>Meter cable</label>
            <input
              type="text"
              placeholder="e.g. 4C x 70 sqmm (Al)"
              value={meterCable}
              onChange={(e) => setMeterCable(e.target.value)}
            />
          </div>
        </div>

        {inverters.map((inv, invIdx) => (
          <div key={inv.id} className="sld-inverter-card">
            <div className="sld-inverter-card-header">
              <span>Inverter {invIdx + 1}</span>
              {inverters.length > 1 && (
                <button type="button" className="projects-btn danger" onClick={() => removeInverter(inv.id)}>
                  Remove inverter
                </button>
              )}
            </div>
            <div className="amc-field">
              <label>Inverter capacity (kW)</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g. 5"
                value={inv.capacityKw}
                onChange={(e) => updateInverter(inv.id, "capacityKw", e.target.value)}
              />
            </div>
            <div className="amc-field">
              <label>Make</label>
              <input type="text" placeholder="e.g. Growatt" value={inv.make} onChange={(e) => updateInverter(inv.id, "make", e.target.value)} />
            </div>
            <div className="amc-field">
              <label>Model</label>
              <input
                type="text"
                placeholder="e.g. MOD 5000TL3-X"
                value={inv.model}
                onChange={(e) => updateInverter(inv.id, "model", e.target.value)}
              />
            </div>
            <div className="amc-field">
              <label>AC cable</label>
              <input
                type="text"
                placeholder="e.g. 4C x 16 sqmm (Cu)"
                value={inv.acCable}
                onChange={(e) => updateInverter(inv.id, "acCable", e.target.value)}
              />
            </div>
            <div className="amc-field">
              <label>AC breaker</label>
              <input
                type="text"
                placeholder="e.g. 3P 32A MCB"
                value={inv.acBreaker}
                onChange={(e) => updateInverter(inv.id, "acBreaker", e.target.value)}
              />
            </div>

            <p className="work-order-type-hint">Strings feeding this inverter -- panels in each string:</p>
            {inv.strings.map((str, strIdx) => (
              <div key={str.id} className="sld-string-row">
                <span className="sld-string-row-label">String {strIdx + 1}</span>
                <input
                  type="number"
                  min="1"
                  placeholder="No. of panels"
                  value={str.panels}
                  onChange={(e) => updateStringPanels(inv.id, str.id, e.target.value)}
                />
                {inv.strings.length > 1 && (
                  <button type="button" className="projects-btn danger" onClick={() => removeString(inv.id, str.id)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="projects-btn" onClick={() => addString(inv.id)}>
              + Add string
            </button>
          </div>
        ))}

        <button type="button" className="projects-btn" onClick={addInverter}>
          + Add inverter
        </button>

        {invertersValid && (
          <p className="work-order-type-hint">
            Total: {totalPanels} panels · {totalStrings} string{totalStrings === 1 ? "" : "s"} ·{" "}
            {totalCapacityKw.toFixed(1)} kW across {inverters.length} inverter{inverters.length === 1 ? "" : "s"}.
          </p>
        )}

        <button className="projects-btn primary" disabled={!canSubmit || creating} onClick={handleCreate}>
          {creating ? "Creating…" : "Generate SLD"}
        </button>
        {error && (
          <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
            {error}
          </span>
        )}
      </div>
    </>
  );
}
