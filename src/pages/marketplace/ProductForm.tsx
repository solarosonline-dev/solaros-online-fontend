import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import type { Category, ProductInput, ProductUnit } from "../../api/marketplaceCatalog";
import AttributeFields, { coerceAttributes, type AttrValues } from "./AttributeFields";
import "./mp.css";

const UNITS: ProductUnit[] = ["PIECE", "SET", "METER", "KG"];

/** Used by the admin (create ACTIVE/DRAFT) and the vendor (propose). */
export default function ProductForm({
  categories,
  submitLabel,
  allowDraft,
  onSubmit,
}: {
  categories: Category[];
  submitLabel: string;
  allowDraft?: boolean;
  onSubmit: (input: ProductInput) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("PIECE");
  const [hsn, setHsn] = useState("");
  const [gst, setGst] = useState("");
  const [weight, setWeight] = useState("");
  const [volume, setVolume] = useState("");
  const [eqGroup, setEqGroup] = useState("");
  const [draft, setDraft] = useState(false);
  const [attrs, setAttrs] = useState<AttrValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cat = useMemo(() => categories.find((c) => c.category_id === categoryId), [categories, categoryId]);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cat) return setError("Choose a category.");
    if (!brand.trim() || !model.trim()) return setError("Brand and model are required.");
    setBusy(true);
    try {
      await onSubmit({
        category_id: cat.category_id,
        brand: brand.trim(),
        model: model.trim(),
        name: name.trim() || null,
        attributes: coerceAttributes(cat.effective_schema, attrs),
        unit,
        hsn_code: hsn.trim() || null,
        gst_rate: num(gst),
        weight_kg: num(weight),
        volume_cc: num(volume),
        equivalence_group: eqGroup.trim() || null,
        ...(allowDraft ? { status: draft ? ("DRAFT" as const) : ("ACTIVE" as const) } : {}),
      });
      setBrand("");
      setModel("");
      setName("");
      setHsn("");
      setGst("");
      setWeight("");
      setVolume("");
      setEqGroup("");
      setAttrs({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mp-card" onSubmit={submit} noValidate>
      <div className="mp-grid">
        <div className="mp-field">
          <label htmlFor="pfCat">Category *</label>
          <select
            id="pfCat"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value ? Number(e.target.value) : "");
              setAttrs({});
            }}
          >
            <option value="">Select…</option>
            {categories
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div className="mp-field">
          <label htmlFor="pfBrand">Brand *</label>
          <input id="pfBrand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="mp-field">
          <label htmlFor="pfModel">Model *</label>
          <input id="pfModel" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="mp-field">
          <label htmlFor="pfName">Display name</label>
          <input id="pfName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to brand + model" />
        </div>
        <div className="mp-field">
          <label htmlFor="pfUnit">Unit</label>
          <select id="pfUnit" value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="mp-field">
          <label htmlFor="pfHsn">HSN code</label>
          <input id="pfHsn" value={hsn} onChange={(e) => setHsn(e.target.value)} inputMode="numeric" />
        </div>
        <div className="mp-field">
          <label htmlFor="pfGst">GST rate %</label>
          <input id="pfGst" type="number" step="any" value={gst} onChange={(e) => setGst(e.target.value)} />
        </div>
        <div className="mp-field">
          <label htmlFor="pfW">Weight (kg)</label>
          <input id="pfW" type="number" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="mp-field">
          <label htmlFor="pfV">Volume (cc)</label>
          <input id="pfV" type="number" step="any" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </div>
        <div className="mp-field">
          <label htmlFor="pfEq">Equivalence group</label>
          <input id="pfEq" value={eqGroup} onChange={(e) => setEqGroup(e.target.value)} placeholder="Interchangeable products share this" />
        </div>
        {cat && <AttributeFields schema={cat.effective_schema} values={attrs} onChange={setAttrs} />}
      </div>
      {allowDraft && (
        <div className="mp-row">
          <label>
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Save as draft (not purchasable yet)
          </label>
        </div>
      )}
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}
      <div className="mp-row">
        <button type="submit" className="mp-btn primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
