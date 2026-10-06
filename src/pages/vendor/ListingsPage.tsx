import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { vendorListProducts, type Product } from "../../api/marketplaceCatalog";
import { createListing, listListings, type Listing } from "../../api/vendorListings";
import { useAuth } from "../../lib/AuthContext";
import Pagination from "../../lib/Pagination";
import ListingPanel from "./ListingPanel";
import "../marketplace/mp.css";

const PAGE_SIZE = 20;
const STATUSES = ["", "DRAFT", "ACTIVE", "INACTIVE"];

export default function ListingsPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id ?? null;

  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [prodQ, setProdQ] = useState("");
  const [prodResults, setProdResults] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [moq, setMoq] = useState("1");
  const [pack, setPack] = useState("1");
  const [lead, setLead] = useState("2");
  const [pin, setPin] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (entityId == null) return;
    listListings(entityId, { status: status || undefined, q: q.trim() || undefined, page, page_size: PAGE_SIZE })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Failed to load listings"));
  }, [entityId, status, q, page]);
  useEffect(load, [load]);

  useEffect(() => {
    if (entityId == null || !showNew) return;
    const t = setTimeout(() => {
      vendorListProducts(entityId, { q: prodQ.trim() || undefined, page_size: 30 })
        .then((r) => setProdResults(r.items))
        .catch(() => setProdResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [entityId, showNew, prodQ]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (entityId == null) return;
    setFormError(null);
    if (productId === "") return setFormError("Choose a product.");
    if (!price || Number(price) <= 0) return setFormError("Enter a price above zero.");
    if (!/^[1-9][0-9]{5}$/.test(pin.trim())) return setFormError("Enter a 6-digit dispatch pincode.");
    setSaving(true);
    try {
      const l = await createListing(entityId, {
        product_id: productId,
        vendor_sku: sku.trim(),
        base_price: Number(price),
        moq: Number(moq),
        pack_size: Number(pack),
        lead_time_days: Number(lead),
        dispatch_pincode: pin.trim(),
      });
      setShowNew(false);
      setProductId("");
      setSku("");
      setPrice("");
      setOpenId(l.listing_id);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the listing");
    } finally {
      setSaving(false);
    }
  }

  if (entityId == null) return null;

  return (
    <div className="mp-page">
      <h1>My listings</h1>
      <p className="mp-intro">
        Products you sell to Solaros, with your price, minimum order and stock. Buyers never see who you are.
      </p>
      <div className="mp-row" style={{ marginTop: 0 }}>
        <button className="mp-btn primary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Close" : "+ New listing"}
        </button>
        <Link className="mp-btn" to="/app/vendor/bulk">
          Bulk upload (CSV)
        </Link>
        <Link className="mp-btn" to="/app/vendor/products">
          Propose a product
        </Link>
      </div>

      {showNew && (
        <form className="mp-card" style={{ marginTop: 12 }} onSubmit={submit} noValidate>
          <div className="mp-grid">
            <div className="mp-field full">
              <label htmlFor="nlSearch">Find product</label>
              <input id="nlSearch" value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Brand, model or name" />
            </div>
            <div className="mp-field full">
              <label htmlFor="nlProd">Product *</label>
              <select id="nlProd" value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select…</option>
                {prodResults.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="nlSku">Your SKU</label>
              <input id="nlSku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="mp-field">
              <label htmlFor="nlPrice">Base price (₹) *</label>
              <input id="nlPrice" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="mp-field">
              <label htmlFor="nlMoq">MOQ</label>
              <input id="nlMoq" type="number" value={moq} onChange={(e) => setMoq(e.target.value)} />
            </div>
            <div className="mp-field">
              <label htmlFor="nlPack">Pack size</label>
              <input id="nlPack" type="number" value={pack} onChange={(e) => setPack(e.target.value)} />
            </div>
            <div className="mp-field">
              <label htmlFor="nlLead">Lead time (days)</label>
              <input id="nlLead" type="number" value={lead} onChange={(e) => setLead(e.target.value)} />
            </div>
            <div className="mp-field">
              <label htmlFor="nlPin">Dispatch pincode *</label>
              <input id="nlPin" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} inputMode="numeric" />
            </div>
          </div>
          {formError && (
            <p className="mp-error" role="alert">
              {formError}
            </p>
          )}
          <div className="mp-row">
            <button type="submit" className="mp-btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create listing"}
            </button>
          </div>
        </form>
      )}

      <div className="mp-row">
        <select
          className="mp-inline-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <input
          className="mp-inline-input"
          placeholder="Search product or SKU"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {loadError && <p className="mp-error">{loadError}</p>}

      <div className="mp-card mp-table-wrap" style={{ marginTop: 12 }}>
        <table className="mp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th className="num">Base ₹</th>
              <th className="num">MOQ</th>
              <th className="num">Available</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7}>No listings yet.</td>
              </tr>
            )}
            {items.map((l) => (
              <tr key={l.listing_id}>
                <td>{l.product_name}</td>
                <td>{l.vendor_sku || "—"}</td>
                <td className="num">{Number(l.base_price).toFixed(2)}</td>
                <td className="num">{l.moq}</td>
                <td className="num">{Number(l.stock.available)}</td>
                <td>
                  <span className={`mp-badge ${l.status === "ACTIVE" ? "ok" : ""}`}>{l.status}</span>
                </td>
                <td>
                  <div className="mp-actions-cell">
                    <button className="mp-btn" onClick={() => setOpenId(openId === l.listing_id ? null : l.listing_id)}>
                      {openId === l.listing_id ? "Close" : "Manage"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {items
        .filter((l) => l.listing_id === openId)
        .map((l) => (
          <ListingPanel
            key={`${l.listing_id}-${l.status}-${l.base_price}`}
            entityId={entityId}
            listing={l}
            onChange={(u) => setItems((cur) => cur.map((x) => (x.listing_id === u.listing_id ? u : x)))}
          />
        ))}
    </div>
  );
}
