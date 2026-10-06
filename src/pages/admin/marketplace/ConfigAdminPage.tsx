import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import {
  createConfigRule,
  deleteConfigRule,
  listConfigKeys,
  listConfigRules,
  resolveConfig,
  updateConfigRule,
  type ConfigKey,
  type ConfigRule,
  type ConfigScope,
  type Resolved,
} from "../../../api/marketplaceAdmin";
import "../../marketplace/mp.css";

const errMsg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

function parseValue(k: ConfigKey, raw: string): unknown {
  if (k.kind === "bool") return raw === "true";
  if (k.kind === "enum") return raw;
  return raw.trim() === "" ? NaN : Number(raw);
}

const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

export default function ConfigAdminPage() {
  const [keys, setKeys] = useState<ConfigKey[]>([]);
  const [rules, setRules] = useState<ConfigRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState("");
  const [scope, setScope] = useState<ConfigScope>("GLOBAL");
  const [scopeId, setScopeId] = useState("");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState("0");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [ctx, setCtx] = useState({ market_id: "", category_id: "", vendor_entity_id: "", entity_id: "", lane_id: "" });
  const [resolved, setResolved] = useState<Resolved | null>(null);

  const load = useCallback(() => {
    listConfigRules()
      .then((r) => setRules(r.items))
      .catch((e) => setError(errMsg(e, "Failed to load rules")));
  }, []);

  useEffect(() => {
    listConfigKeys()
      .then((r) => {
        setKeys(r.items);
        if (r.items[0]) setKey(r.items[0].key);
      })
      .catch((e) => setError(errMsg(e, "Failed to load config keys")));
    load();
  }, [load]);

  const ck = keys.find((k) => k.key === key);

  function pickKey(k: string) {
    setKey(k);
    setValue("");
    const next = keys.find((x) => x.key === k);
    if (next && !next.scopes.includes(scope)) setScope(next.scopes[0]);
  }

  async function add() {
    if (!ck) return;
    setError(null);
    const v = parseValue(ck, value);
    if (typeof v === "number" && Number.isNaN(v)) return setError("Enter a value.");
    try {
      await createConfigRule({
        key,
        scope_type: scope,
        scope_id: scope === "GLOBAL" ? null : Number(scopeId),
        value: v,
        priority: Number(priority) || 0,
        note: note.trim() || null,
        effective_from: from ? new Date(from).toISOString() : null,
        effective_to: to ? new Date(to).toISOString() : null,
      });
      setValue("");
      setNote("");
      load();
    } catch (e) {
      setError(errMsg(e, "Could not save the rule"));
    }
  }

  async function explain() {
    setError(null);
    const c: Record<string, number | undefined> = {};
    for (const [k, v] of Object.entries(ctx)) if (v.trim()) c[k] = Number(v);
    try {
      setResolved(await resolveConfig(key, c));
    } catch (e) {
      setResolved(null);
      setError(errMsg(e, "Could not resolve"));
    }
  }

  return (
    <div className="mp-page">
      <h1>Marketplace configuration</h1>
      <p className="mp-intro">
        Every tunable (commission, pooling window, payout delay…) has a default. Add a rule to override it for a market, category,
        vendor or buyer. The most specific rule wins; ties go to higher priority, then the newest.
      </p>
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}

      <div className="mp-card">
        <h2 style={{ marginTop: 0 }}>Add rule</h2>
        <div className="mp-grid">
          <div className="mp-field full">
            <label htmlFor="cfKey">Setting</label>
            <select id="cfKey" value={key} onChange={(e) => pickKey(e.target.value)}>
              {keys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.key} (default {fmt(k.default)})
                </option>
              ))}
            </select>
            {ck && <span className="mp-hint">{ck.description}</span>}
          </div>
          <div className="mp-field">
            <label htmlFor="cfScope">Applies to</label>
            <select id="cfScope" value={scope} onChange={(e) => setScope(e.target.value as ConfigScope)}>
              {(ck?.scopes ?? []).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {scope !== "GLOBAL" && (
            <div className="mp-field">
              <label htmlFor="cfScopeId">{scope} id</label>
              <input id="cfScopeId" type="number" value={scopeId} onChange={(e) => setScopeId(e.target.value)} />
            </div>
          )}
          <div className="mp-field">
            <label htmlFor="cfVal">Value</label>
            {ck?.kind === "bool" ? (
              <select id="cfVal" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">—</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : ck?.kind === "enum" ? (
              <select id="cfVal" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">—</option>
                {ck.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input id="cfVal" type="number" step="any" min={ck?.min ?? undefined} max={ck?.max ?? undefined} value={value} onChange={(e) => setValue(e.target.value)} />
            )}
            {ck && ck.min != null && <span className="mp-hint">{ck.min} – {ck.max}</span>}
          </div>
          <div className="mp-field">
            <label htmlFor="cfPri">Priority</label>
            <input id="cfPri" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <div className="mp-field">
            <label htmlFor="cfFrom">Effective from</label>
            <input id="cfFrom" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="mp-field">
            <label htmlFor="cfTo">Effective until</label>
            <input id="cfTo" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mp-field full">
            <label htmlFor="cfNote">Note</label>
            <input id="cfNote" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="mp-row">
          <button className="mp-btn primary" onClick={add} disabled={!ck}>
            Add rule
          </button>
        </div>
      </div>

      <div className="mp-card mp-table-wrap">
        <h2 style={{ marginTop: 0 }}>Rules</h2>
        <table className="mp-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Scope</th>
              <th>Value</th>
              <th className="num">Priority</th>
              <th>Window</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={7}>No rules — everything uses defaults.</td>
              </tr>
            )}
            {rules.map((r) => (
              <RuleRow key={r.rule_id} rule={r} k={keys.find((x) => x.key === r.key)} onChanged={load} onError={setError} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mp-card">
        <h2 style={{ marginTop: 0 }}>What applies here? (for the setting above)</h2>
        <div className="mp-grid">
          {(Object.keys(ctx) as (keyof typeof ctx)[]).map((c) => (
            <div className="mp-field" key={c}>
              <label>{c}</label>
              <input type="number" value={ctx[c]} onChange={(e) => setCtx({ ...ctx, [c]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mp-row">
          <button className="mp-btn" onClick={explain} disabled={!key}>
            Resolve
          </button>
        </div>
        {resolved && (
          <p>
            <strong>{fmt(resolved.value)}</strong> —{" "}
            {resolved.source === "default" ? "default value" : `rule #${resolved.rule_id} (${resolved.scope_type}${resolved.scope_id != null ? ` #${resolved.scope_id}` : ""})`}
          </p>
        )}
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  k,
  onChanged,
  onError,
}: {
  rule: ConfigRule;
  k: ConfigKey | undefined;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(fmt(rule.value));

  async function save() {
    if (!k) return;
    onError(null);
    try {
      await updateConfigRule(rule.rule_id, { value: parseValue(k, val) });
      setEditing(false);
      onChanged();
    } catch (e) {
      onError(errMsg(e, "Could not update"));
    }
  }

  const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "…");

  return (
    <tr>
      <td>{rule.key}</td>
      <td>
        {rule.scope_type}
        {rule.scope_id != null ? ` #${rule.scope_id}` : ""}
      </td>
      <td>
        {editing ? (
          k?.kind === "bool" ? (
            <select className="mp-inline-input" value={val} onChange={(e) => setVal(e.target.value)}>
              <option>true</option>
              <option>false</option>
            </select>
          ) : k?.kind === "enum" ? (
            <select className="mp-inline-input" value={val} onChange={(e) => setVal(e.target.value)}>
              {k.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input className="mp-inline-input" style={{ width: 90 }} type="number" step="any" value={val} onChange={(e) => setVal(e.target.value)} />
          )
        ) : (
          fmt(rule.value)
        )}
      </td>
      <td className="num">{rule.priority}</td>
      <td>
        {rule.effective_from || rule.effective_to ? `${when(rule.effective_from)} → ${when(rule.effective_to)}` : "Always"}
      </td>
      <td>{rule.note ?? ""}</td>
      <td>
        <div className="mp-actions-cell">
          {editing ? (
            <>
              <button className="mp-btn primary" onClick={save}>
                Save
              </button>
              <button className="mp-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="mp-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                className="mp-btn danger"
                onClick={() =>
                  deleteConfigRule(rule.rule_id)
                    .then(onChanged)
                    .catch((e) => onError(errMsg(e, "Could not delete")))
                }
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
