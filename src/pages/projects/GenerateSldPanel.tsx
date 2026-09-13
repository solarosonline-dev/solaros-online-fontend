import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProjectWorkOrder, type SldInverterLayout } from "../../api/workOrders";
import { ApiError } from "../../api/client";

/**
 * Dedicated entry point for creating an SLD_GENERATION work order --
 * deliberately separate from the fixed-phase panel in ProjectWorkOrders
 * (Site survey -> Installation -> Documentation), since generating a Single
 * Line Diagram isn't a funnel phase and can be done at any point in a
 * project's life (mirrors how AMC_SERVICE work orders are created outside
 * that panel too). Always visible, not gated on project status.
 *
 * Captures panel wattage plus the actual per-inverter/per-string layout --
 * one or more inverters, each with its own capacity and its own list of DC
 * strings (each string just needs its panel count, since panel wattage is
 * shared). Total panel count and string count are derived from this, not
 * asked separately, so they can never disagree with what's actually wired up
 * -- see sld_layout on the backend.
 *
 * On success, navigates straight to the new work order's detail page, where
 * WorkOrderDetailPage renders the entered specs, the diagram preview, and
 * the "Generate PDF" action.
 */

type StringRow = { id: number; panels: string };
type InverterRow = { id: number; capacityKw: string; strings: StringRow[] };

function newStringRow(nextId: () => number): StringRow {
  return { id: nextId(), panels: "" };
}

function newInverterRow(nextId: () => number): InverterRow {
  return { id: nextId(), capacityKw: "", strings: [newStringRow(nextId)] };
}

export default function GenerateSldPanel({ entityId, projectId }: { entityId: number; projectId: number }) {
  const navigate = useNavigate();
  const idCounter = useRef(0);
  const nextId = () => ++idCounter.current;

  const [panelWattageW, setPanelWattageW] = useState("");
  // Seeded with fixed literal ids (nextId() starts at 1) rather than calling
  // nextId() here -- that would touch the idCounter ref during render, which
  // React/lint rightly flag even inside a useState lazy initializer.
  const [inverters, setInverters] = useState<InverterRow[]>(() => [{ id: 0, capacityKw: "", strings: [{ id: 0, panels: "" }] }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addInverter() {
    setInverters((prev) => [...prev, newInverterRow(nextId)]);
  }

  function removeInverter(inverterId: number) {
    setInverters((prev) => prev.filter((inv) => inv.id !== inverterId));
  }

  function updateInverterCapacity(inverterId: number, capacityKw: string) {
    setInverters((prev) => prev.map((inv) => (inv.id === inverterId ? { ...inv, capacityKw } : inv)));
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
  const invertersValid =
    inverters.length > 0 &&
    inverters.every(
      (inv) =>
        inv.capacityKw !== "" &&
        Number(inv.capacityKw) > 0 &&
        inv.strings.length > 0 &&
        inv.strings.every((s) => s.panels !== "" && Number(s.panels) > 0),
    );
  const canSubmit = panelWattageValid && invertersValid;

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
        strings: inv.strings.map((s) => Number(s.panels)),
      }));
      const res = await createProjectWorkOrder(entityId, projectId, {
        type: "SLD_GENERATION",
        panel_wattage_w: panelWattageNum,
        sld_layout,
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
                onChange={(e) => updateInverterCapacity(inv.id, e.target.value)}
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
