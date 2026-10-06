import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../../api/client";
import {
  adminCreateCategory,
  adminCreateProduct,
  adminListCategories,
  adminListProducts,
  adminProductAction,
  adminRejectProduct,
  adminSetCategoryActive,
  adminUpdateCategory,
  type AttributeField,
  type Category,
  type HandlingClass,
  type Product,
  type ProductStatus,
} from "../../../api/marketplaceCatalog";
import Pagination from "../../../lib/Pagination";
import ProductForm from "../../marketplace/ProductForm";
import "../../marketplace/mp.css";

const PAGE_SIZE = 20;
const HANDLING: HandlingClass[] = ["STANDARD", "FRAGILE", "HEAVY", "FRAGILE_HEAVY"];
const STATUS_FILTERS: { label: string; value: ProductStatus | "" }[] = [
  { label: "Proposed (review queue)", value: "PROPOSED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Retired", value: "RETIRED" },
  { label: "All", value: "" },
];
const SCHEMA_EXAMPLE = `[
  {"key": "power_wp", "label": "Power", "type": "number", "unit": "Wp", "required": true},
  {"key": "cell_type", "label": "Cell type", "type": "enum", "options": ["Mono PERC", "TOPCon"]}
]`;

export default function CatalogAdminPage() {
  const [tab, setTab] = useState<"products" | "categories">("products");
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadCats = useCallback(() => {
    adminListCategories()
      .then((r) => setCats(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load categories"));
  }, []);
  useEffect(loadCats, [loadCats]);

  return (
    <div className="mp-page">
      <h1>Marketplace catalog</h1>
      <p className="mp-intro">The master list of products vendors can sell. Vendors list against these; proposals land in the review queue.</p>
      <div className="mp-tabs">
        <button className={`mp-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>
          Products
        </button>
        <button className={`mp-tab ${tab === "categories" ? "active" : ""}`} onClick={() => setTab("categories")}>
          Categories
        </button>
      </div>
      {error && <p className="mp-error">{error}</p>}
      {tab === "products" ? <ProductsTab cats={cats} /> : <CategoriesTab cats={cats} reload={loadCats} />}
    </div>
  );
}

function ProductsTab({ cats }: { cats: Category[] }) {
  const [status, setStatus] = useState<ProductStatus | "">("PROPOSED");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    adminListProducts({ status: status ? [status] : undefined, q: q.trim() || undefined, page, page_size: PAGE_SIZE })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load products"));
  }, [status, q, page]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      setRejecting(null);
      setReason("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }
  const catName = (id: number) => cats.find((c) => c.category_id === id)?.name ?? id;

  return (
    <>
      <div className="mp-row" style={{ marginTop: 0 }}>
        <select
          className="mp-inline-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ProductStatus | "");
            setPage(1);
          }}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          className="mp-inline-input"
          placeholder="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <button className="mp-btn primary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Close" : "+ New product"}
        </button>
      </div>
      {showNew && (
        <div style={{ marginTop: 12 }}>
          <ProductForm
            categories={cats}
            submitLabel="Create product"
            allowDraft
            onSubmit={async (input) => {
              await adminCreateProduct(input);
              load();
            }}
          />
        </div>
      )}
      {error && <p className="mp-error">{error}</p>}
      <div className="mp-card mp-table-wrap" style={{ marginTop: 12 }}>
        <table className="mp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Attributes</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5}>Nothing here.</td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.product_id}>
                <td>
                  {p.name}
                  {p.proposed_by_entity_id != null && <div className="mp-hint">proposed by entity #{p.proposed_by_entity_id}</div>}
                  {p.reject_reason && <div className="mp-hint">Rejected: {p.reject_reason}</div>}
                </td>
                <td>{catName(p.category_id)}</td>
                <td>{Object.entries(p.attributes).map(([k, v]) => `${k}: ${String(v)}`).join(", ") || "—"}</td>
                <td>
                  <span className={`mp-badge ${p.status === "ACTIVE" ? "ok" : p.status === "REJECTED" ? "bad" : ""}`}>{p.status}</span>
                </td>
                <td>
                  <div className="mp-actions-cell">
                    {(p.status === "PROPOSED" || p.status === "DRAFT") && (
                      <button className="mp-btn primary" onClick={() => act(() => adminProductAction(p.product_id, "approve"))}>
                        Approve
                      </button>
                    )}
                    {p.status === "PROPOSED" && rejecting !== p.product_id && (
                      <button className="mp-btn danger" onClick={() => setRejecting(p.product_id)}>
                        Reject
                      </button>
                    )}
                    {p.status === "ACTIVE" && (
                      <button className="mp-btn" onClick={() => act(() => adminProductAction(p.product_id, "retire"))}>
                        Retire
                      </button>
                    )}
                    {p.status === "RETIRED" && (
                      <button className="mp-btn" onClick={() => act(() => adminProductAction(p.product_id, "reactivate"))}>
                        Reactivate
                      </button>
                    )}
                  </div>
                  {rejecting === p.product_id && (
                    <div className="mp-row">
                      <input className="mp-inline-input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button className="mp-btn danger" disabled={!reason.trim()} onClick={() => act(() => adminRejectProduct(p.product_id, reason.trim()))}>
                        Confirm reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </>
  );
}

function CategoriesTab({ cats, reload }: { cats: Category[]; reload: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parent, setParent] = useState<number | "">("");
  const [handling, setHandling] = useState<HandlingClass>("STANDARD");
  const [schemaText, setSchemaText] = useState("[]");
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseSchema(): AttributeField[] | null {
    try {
      const v = JSON.parse(schemaText || "[]");
      if (!Array.isArray(v)) throw new Error();
      return v;
    } catch {
      setError("Attribute schema must be a JSON list of field definitions.");
      return null;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const schema = parseSchema();
    if (!schema) return;
    try {
      if (editing) {
        await adminUpdateCategory(editing.category_id, { name: name.trim(), attribute_schema: schema, handling_class: handling });
      } else {
        await adminCreateCategory({
          code: code.trim(),
          name: name.trim(),
          parent_id: parent === "" ? null : parent,
          attribute_schema: schema,
          handling_class: handling,
        });
      }
      reset();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the category");
    }
  }

  function reset() {
    setEditing(null);
    setCode("");
    setName("");
    setParent("");
    setHandling("STANDARD");
    setSchemaText("[]");
  }

  function edit(c: Category) {
    setEditing(c);
    setName(c.name);
    setHandling(c.handling_class);
    setSchemaText(JSON.stringify(c.attribute_schema, null, 2));
    setError(null);
  }

  const nameOf = (id: number | null) => (id == null ? "—" : (cats.find((c) => c.category_id === id)?.name ?? id));

  return (
    <>
      <form className="mp-card" onSubmit={submit} noValidate>
        <h2 style={{ marginTop: 0 }}>{editing ? `Edit ${editing.code}` : "New category"}</h2>
        <div className="mp-grid">
          {!editing && (
            <div className="mp-field">
              <label htmlFor="cCode">Code *</label>
              <input id="cCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SOLAR_PANEL" />
            </div>
          )}
          <div className="mp-field">
            <label htmlFor="cName">Name *</label>
            <input id="cName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!editing && (
            <div className="mp-field">
              <label htmlFor="cParent">Parent</label>
              <select id="cParent" value={parent} onChange={(e) => setParent(e.target.value ? Number(e.target.value) : "")}>
                <option value="">None (top level)</option>
                {cats.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mp-field">
            <label htmlFor="cHandling">Handling</label>
            <select id="cHandling" value={handling} onChange={(e) => setHandling(e.target.value as HandlingClass)}>
              {HANDLING.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="mp-field full">
            <label htmlFor="cSchema">Attribute schema (JSON)</label>
            <textarea id="cSchema" value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} />
            <span className="mp-hint">Fields for products in this category; children inherit them. Types: string, number, integer, boolean, enum. Example:</span>
            <pre className="mp-hint" style={{ margin: 0 }}>
              {SCHEMA_EXAMPLE}
            </pre>
          </div>
        </div>
        {error && (
          <p className="mp-error" role="alert">
            {error}
          </p>
        )}
        <div className="mp-row">
          <button type="submit" className="mp-btn primary">
            {editing ? "Save changes" : "Create category"}
          </button>
          {editing && (
            <button type="button" className="mp-btn" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="mp-card mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Parent</th>
              <th>Handling</th>
              <th className="num">Fields</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.category_id}>
                <td>{c.code}</td>
                <td>{c.name}</td>
                <td>{nameOf(c.parent_id)}</td>
                <td>{c.handling_class}</td>
                <td className="num">{c.effective_schema.length}</td>
                <td>
                  <span className={`mp-badge ${c.is_active ? "ok" : ""}`}>{c.is_active ? "Active" : "Inactive"}</span>
                </td>
                <td>
                  <div className="mp-actions-cell">
                    <button className="mp-btn" onClick={() => edit(c)}>
                      Edit
                    </button>
                    <button
                      className="mp-btn"
                      onClick={() =>
                        adminSetCategoryActive(c.category_id, !c.is_active)
                          .then(reload)
                          .catch((e) => setError(e instanceof ApiError ? e.message : "Failed"))
                      }
                    >
                      {c.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
