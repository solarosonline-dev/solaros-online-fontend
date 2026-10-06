import type { AttributeField } from "../../api/marketplaceCatalog";

/** Renders inputs for a category's effective attribute schema. Values are held
 * as strings/booleans in `values`; `coerceAttributes` turns them into the typed
 * JSON the backend validates. */
export type AttrValues = Record<string, string | boolean>;

export function coerceAttributes(schema: AttributeField[], values: AttrValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema) {
    const v = values[f.key];
    if (f.type === "boolean") {
      if (v !== undefined) out[f.key] = v === true;
      continue;
    }
    if (v === undefined || v === "") continue;
    out[f.key] = f.type === "number" || f.type === "integer" ? Number(v) : v;
  }
  return out;
}

export default function AttributeFields({
  schema,
  values,
  onChange,
}: {
  schema: AttributeField[];
  values: AttrValues;
  onChange: (v: AttrValues) => void;
}) {
  if (schema.length === 0) return null;
  const set = (k: string, v: string | boolean) => onChange({ ...values, [k]: v });
  return (
    <>
      {schema.map((f) => {
        const id = `attr_${f.key}`;
        const label = `${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`;
        return (
          <div className="mp-field" key={f.key}>
            <label htmlFor={id}>{label}</label>
            {f.type === "enum" ? (
              <select id={id} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <select
                id={id}
                value={values[f.key] === undefined ? "" : String(values[f.key])}
                onChange={(e) => (e.target.value === "" ? onChange(omit(values, f.key)) : set(f.key, e.target.value === "true"))}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                id={id}
                type={f.type === "string" ? "text" : "number"}
                step={f.type === "integer" ? 1 : "any"}
                min={f.min}
                max={f.max}
                value={String(values[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function omit(v: AttrValues, k: string): AttrValues {
  const { [k]: _drop, ...rest } = v;
  void _drop;
  return rest;
}
