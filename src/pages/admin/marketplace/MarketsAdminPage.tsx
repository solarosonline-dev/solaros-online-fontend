import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../../api/client";
import {
  addCoverage,
  addParticipant,
  createMarket,
  getReadiness,
  importPincodes,
  listCoverage,
  listMarkets,
  listParticipants,
  removeCoverage,
  removeParticipant,
  setMarketStatus,
  type Coverage,
  type Market,
  type MarketStatus,
  type Participant,
  type PincodeRow,
  type Readiness,
} from "../../../api/marketplaceAdmin";
import "../../marketplace/mp.css";

const STATUSES: MarketStatus[] = ["DRAFT", "PILOT", "LIVE", "PAUSED"];

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function MarketsAdminPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMarkets()
      .then((r) => setMarkets(r.items))
      .catch((e) => setError(errMsg(e, "Failed to load markets")));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const m = await createMarket({ code: code.trim().toUpperCase(), name: name.trim() });
      setCode("");
      setName("");
      setSelected(m.market_id);
      load();
    } catch (err) {
      setError(errMsg(err, "Could not create the market"));
    }
  }

  const market = markets.find((m) => m.market_id === selected) ?? null;

  return (
    <div className="mp-page">
      <h1>Markets</h1>
      <p className="mp-intro">
        A market is a territory where the marketplace is switched on. Add coverage (states, districts or pincodes) and participants,
        then move it DRAFT → PILOT → LIVE.
      </p>
      <form className="mp-card" onSubmit={create} noValidate>
        <div className="mp-grid">
          <div className="mp-field">
            <label htmlFor="mCode">Code *</label>
            <input id="mCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PUNE" />
          </div>
          <div className="mp-field">
            <label htmlFor="mName">Name *</label>
            <input id="mName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="mp-row">
          <button type="submit" className="mp-btn primary" disabled={!code.trim() || !name.trim()}>
            Create market
          </button>
        </div>
      </form>
      {error && <p className="mp-error">{error}</p>}
      <div className="mp-card mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {markets.length === 0 && (
              <tr>
                <td colSpan={4}>No markets yet.</td>
              </tr>
            )}
            {markets.map((m) => (
              <tr key={m.market_id}>
                <td>{m.code}</td>
                <td>{m.name}</td>
                <td>
                  <span className={`mp-badge ${m.status === "LIVE" || m.status === "PILOT" ? "ok" : ""}`}>{m.status}</span>
                </td>
                <td>
                  <div className="mp-actions-cell">
                    <button className="mp-btn" onClick={() => setSelected(selected === m.market_id ? null : m.market_id)}>
                      {selected === m.market_id ? "Close" : "Manage"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {market && <MarketDetail key={market.market_id} market={market} onChanged={load} />}
      <PincodeImport />
    </div>
  );
}

function MarketDetail({ market, onChanged }: { market: Market; onChanged: () => void }) {
  const id = market.market_id;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [parts, setParts] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<"STATE" | "DISTRICT" | "PINCODE">("STATE");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [pincode, setPincode] = useState("");
  const [entityId, setEntityId] = useState("");
  const [role, setRole] = useState<Participant["role"]>("VENDOR");

  const refresh = useCallback(() => {
    getReadiness(id).then(setReadiness).catch(() => setReadiness(null));
    listCoverage(id).then((r) => setCoverage(r.items)).catch(() => setCoverage([]));
    listParticipants(id).then((r) => setParts(r.items)).catch(() => setParts([]));
  }, [id]);
  useEffect(refresh, [refresh]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      refresh();
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Action failed"));
    }
  }

  return (
    <div className="mp-card mp-panel">
      <h2 style={{ marginTop: 0 }}>
        {market.name} <span className="mp-badge">{market.status}</span>
      </h2>
      {error && <p className="mp-error">{error}</p>}

      <h2>Status</h2>
      <div className="mp-row" style={{ marginTop: 0 }}>
        {STATUSES.filter((s) => s !== market.status).map((s) => (
          <button key={s} className="mp-btn" onClick={() => act(() => setMarketStatus(id, s))}>
            Move to {s}
          </button>
        ))}
      </div>
      {readiness && (
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {readiness.checks.map((c) => (
            <li key={c.key}>
              {c.passed ? "✓" : "✗"} {c.label} {!c.enforced && <span className="mp-hint">(advisory)</span>}
            </li>
          ))}
        </ul>
      )}

      <h2>Coverage</h2>
      <div className="mp-grid">
        <div className="mp-field">
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option>STATE</option>
            <option>DISTRICT</option>
            <option>PINCODE</option>
          </select>
        </div>
        {kind !== "PINCODE" && (
          <div className="mp-field">
            <label>State</label>
            <input value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        )}
        {kind === "DISTRICT" && (
          <div className="mp-field">
            <label>District</label>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
        )}
        {kind === "PINCODE" && (
          <div className="mp-field">
            <label>Pincode</label>
            <input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} />
          </div>
        )}
      </div>
      <div className="mp-row">
        <button
          className="mp-btn primary"
          onClick={() =>
            act(async () => {
              await addCoverage(id, {
                kind,
                ...(kind === "PINCODE" ? { pincode: pincode.trim() } : { state: state.trim() }),
                ...(kind === "DISTRICT" ? { district: district.trim() } : {}),
              });
              setPincode("");
            })
          }
        >
          Add coverage
        </button>
      </div>
      <div className="mp-chips">
        {coverage.length === 0 && <span className="mp-hint">No coverage yet.</span>}
        {coverage.map((c) => (
          <span className="mp-chip" key={c.coverage_id}>
            {c.kind}: {c.value}
            <button aria-label="Remove" onClick={() => act(() => removeCoverage(id, c.coverage_id))}>
              ×
            </button>
          </span>
        ))}
      </div>

      <h2>Participants</h2>
      <div className="mp-grid">
        <div className="mp-field">
          <label>Entity ID</label>
          <input type="number" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Participant["role"])}>
            <option>BUYER</option>
            <option>VENDOR</option>
            <option>LOGISTICS</option>
          </select>
        </div>
      </div>
      <div className="mp-row">
        <button
          className="mp-btn primary"
          disabled={!entityId}
          onClick={() =>
            act(async () => {
              await addParticipant(id, { entity_id: Number(entityId), role });
              setEntityId("");
            })
          }
        >
          Add participant
        </button>
      </div>
      <div className="mp-chips">
        {parts.length === 0 && <span className="mp-hint">No participants yet.</span>}
        {parts.map((p) => (
          <span className="mp-chip" key={p.participant_id}>
            {p.role}: {p.entity_name ?? `#${p.entity_id}`} (#{p.entity_id})
            <button aria-label="Remove" onClick={() => act(() => removeParticipant(id, p.participant_id))}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function PincodeImport() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    const rows: PincodeRow[] = [];
    for (const line of text.split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (!parts[0] || /^pincode$/i.test(parts[0])) continue;
      rows.push({ pincode: parts[0], state: parts[1] ?? "", district: parts[2] ?? "", city: parts[3] || undefined });
    }
    if (rows.length === 0) return setMsg({ ok: false, text: "Paste at least one row." });
    try {
      const r = await importPincodes(rows);
      setMsg({ ok: true, text: `${r.created} created, ${r.updated} updated.` });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Import failed") });
    }
  }

  return (
    <div className="mp-card">
      <h2 style={{ marginTop: 0 }}>Import pincodes</h2>
      <div className="mp-field">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"pincode,state,district,city\n411001,Maharashtra,Pune,Pune"} />
        <span className="mp-hint">One per line. Coverage by state/district only works for pincodes imported here.</span>
      </div>
      <div className="mp-row">
        <button className="mp-btn primary" onClick={run}>
          Import
        </button>
      </div>
      {msg && <p className={msg.ok ? "mp-ok" : "mp-error"}>{msg.text}</p>}
    </div>
  );
}
