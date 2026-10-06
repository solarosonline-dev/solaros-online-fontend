import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import {
  changeStock,
  listMovements,
  setListingActive,
  setTiers,
  updateListing,
  type Listing,
  type Movement,
} from "../../api/vendorListings";
import "../marketplace/mp.css";

type TierRow = { min_qty: string; unit_price: string };

/** Edit panel for one listing: commercial terms, price tiers, stock + ledger. */
export default function ListingPanel({
  entityId,
  listing,
  onChange,
}: {
  entityId: number;
  listing: Listing;
  onChange: (l: Listing) => void;
}) {
  const [price, setPrice] = useState(listing.base_price);
  const [moq, setMoq] = useState(String(listing.moq));
  const [pack, setPack] = useState(String(listing.pack_size));
  const [lead, setLead] = useState(String(listing.lead_time_days));
  const [pin, setPin] = useState(listing.dispatch_pincode);
  const [tiers, setTierRows] = useState<TierRow[]>(
    listing.tiers.map((t) => ({ min_qty: String(t.min_qty), unit_price: t.unit_price })),
  );
  const [stockType, setStockType] = useState<"RECEIPT" | "ADJUST">("RECEIPT");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [moves, setMoves] = useState<Movement[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMoves = useCallback(() => {
    listMovements(entityId, listing.listing_id)
      .then((r) => setMoves(r.items))
      .catch(() => setMoves([]));
  }, [entityId, listing.listing_id]);
  useEffect(loadMoves, [loadMoves]);

  async function run(label: string, fn: () => Promise<Listing>, after?: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      const l = await fn();
      onChange(l);
      setMsg({ ok: true, text: `${label} done.` });
      after?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : `${label} failed` });
    } finally {
      setBusy(false);
    }
  }

  const id = listing.listing_id;
  const active = listing.status === "ACTIVE";

  return (
    <div className="mp-card mp-panel">
      <h2 style={{ marginTop: 0 }}>Terms</h2>
      <div className="mp-grid">
        <div className="mp-field">
          <label>Base price (₹)</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>MOQ</label>
          <input type="number" value={moq} onChange={(e) => setMoq(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>Pack size</label>
          <input type="number" value={pack} onChange={(e) => setPack(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>Lead time (days)</label>
          <input type="number" value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>Dispatch pincode</label>
          <input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} />
        </div>
      </div>
      <div className="mp-row">
        <button
          className="mp-btn primary"
          disabled={busy}
          onClick={() =>
            run("Save", () =>
              updateListing(entityId, id, {
                base_price: Number(price),
                moq: Number(moq),
                pack_size: Number(pack),
                lead_time_days: Number(lead),
                dispatch_pincode: pin.trim(),
              }),
            )
          }
        >
          Save terms
        </button>
        <button className="mp-btn" disabled={busy} onClick={() => run(active ? "Deactivate" : "Activate", () => setListingActive(entityId, id, !active))}>
          {active ? "Deactivate listing" : "Activate listing"}
        </button>
        {!active && <span className="mp-hint">Activating needs verified KYC and an active catalog product.</span>}
      </div>

      <h2>Volume price tiers</h2>
      <p className="mp-hint">Cheaper unit prices for larger quantities. Each tier must be below the base price and fall as quantity rises.</p>
      {tiers.map((t, i) => (
        <div className="mp-tier-row" key={i}>
          <input
            className="mp-inline-input"
            type="number"
            placeholder="Min qty"
            value={t.min_qty}
            onChange={(e) => setTierRows(tiers.map((x, j) => (j === i ? { ...x, min_qty: e.target.value } : x)))}
          />
          <input
            className="mp-inline-input"
            type="number"
            step="0.01"
            placeholder="Unit ₹"
            value={t.unit_price}
            onChange={(e) => setTierRows(tiers.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))}
          />
          <button className="mp-btn danger" onClick={() => setTierRows(tiers.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="mp-row" style={{ marginTop: 4 }}>
        <button className="mp-btn" onClick={() => setTierRows([...tiers, { min_qty: "", unit_price: "" }])}>
          + Add tier
        </button>
        <button
          className="mp-btn primary"
          disabled={busy}
          onClick={() =>
            run("Tiers", () =>
              setTiers(entityId, id, tiers.map((t) => ({ min_qty: Number(t.min_qty), unit_price: Number(t.unit_price) }))),
            )
          }
        >
          Save tiers
        </button>
      </div>

      <h2>Stock</h2>
      <p className="mp-hint">
        On hand {Number(listing.stock.on_hand)} · reserved {Number(listing.stock.reserved)} · available {Number(listing.stock.available)}
      </p>
      <div className="mp-grid">
        <div className="mp-field">
          <label>Change</label>
          <select value={stockType} onChange={(e) => setStockType(e.target.value as "RECEIPT" | "ADJUST")}>
            <option value="RECEIPT">Add stock (receipt)</option>
            <option value="ADJUST">Correct count (+/− adjust)</option>
          </select>
        </div>
        <div className="mp-field">
          <label>Quantity</label>
          <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="mp-field">
          <label>Note {stockType === "ADJUST" ? "*" : ""}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mp-row">
        <button
          className="mp-btn primary"
          disabled={busy || qty === ""}
          onClick={() =>
            run(
              "Stock update",
              () => changeStock(entityId, id, { type: stockType, qty: Number(qty), note: note.trim() || undefined }),
              () => {
                setQty("");
                setNote("");
                loadMoves();
              },
            )
          }
        >
          Apply
        </button>
      </div>

      <div className="mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th className="num">Δ On hand</th>
              <th className="num">Δ Reserved</th>
              <th className="num">On hand after</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 && (
              <tr>
                <td colSpan={6}>No stock movements yet.</td>
              </tr>
            )}
            {moves.map((m) => (
              <tr key={m.movement_id}>
                <td>{new Date(m.created_at).toLocaleString()}</td>
                <td>{m.type}</td>
                <td className="num">{Number(m.on_hand_delta)}</td>
                <td className="num">{Number(m.reserved_delta)}</td>
                <td className="num">{Number(m.on_hand_after)}</td>
                <td>{m.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && (
        <p className={msg.ok ? "mp-ok" : "mp-error"} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
