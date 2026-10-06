import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { listKyc, rejectKyc, verifyKyc, type AdminKyc, type KycStatus } from "../../api/marketplaceKyc";
import Pagination from "../../lib/Pagination";
import "./EntitiesPage.css";

const FILTERS: { label: string; value: KycStatus }[] = [
  { label: "Pending review", value: "SUBMITTED" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Rejected", value: "REJECTED" },
];
const PAGE_SIZE = 20;

export default function KycReviewPage() {
  const [status, setStatus] = useState<KycStatus>("SUBMITTED");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminKyc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listKyc({ status, page, page_size: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load KYC"))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(load, [load]);

  // Filter change resets to page 1 in the same update (no second request).
  function changeStatus(s: KycStatus) {
    setStatus(s);
    setPage(1);
  }

  async function act(entityId: number, fn: () => Promise<unknown>) {
    setBusyId(entityId);
    setRowErrors((p) => ({ ...p, [entityId]: "" }));
    try {
      await fn();
      setRejectingId(null);
      setReason("");
      load();
    } catch (err) {
      setRowErrors((p) => ({ ...p, [entityId]: err instanceof ApiError ? err.message : "Action failed" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="entities-page">
      <h1>Vendor KYC</h1>
      <div className="entities-filters">
        {FILTERS.map((f) => (
          <button key={f.value} className={status === f.value ? "active" : ""} onClick={() => changeStatus(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="entities-table-wrap">
        {loading ? (
          <div className="entities-loading">Loading…</div>
        ) : loadError ? (
          <div className="entities-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="entities-empty">Nothing here.</div>
        ) : (
          <table className="entities-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>GSTIN</th>
                <th>PAN</th>
                <th>Bank</th>
                <th>UPI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((k) => (
                <tr key={k.entity_id}>
                  <td>
                    {k.entity_name}
                    <div>{k.legal_name}</div>
                    <div>{k.entity_kind}</div>
                  </td>
                  <td>{k.gstno}</td>
                  <td>{k.pan}</td>
                  <td>
                    {k.bank_account_name}
                    <div>{k.bank_account_number}</div>
                    <div>{k.bank_ifsc}</div>
                  </td>
                  <td>{k.upi_id || "—"}</td>
                  <td>
                    {k.status === "SUBMITTED" && rejectingId !== k.entity_id && (
                      <>
                        <button
                          className="entities-action-btn primary"
                          disabled={busyId === k.entity_id}
                          onClick={() => act(k.entity_id, () => verifyKyc(k.entity_id))}
                        >
                          Verify
                        </button>{" "}
                        <button className="entities-action-btn" onClick={() => setRejectingId(k.entity_id)}>
                          Reject
                        </button>
                      </>
                    )}
                    {rejectingId === k.entity_id && (
                      <>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason"
                          aria-label="Rejection reason"
                        />{" "}
                        <button
                          className="entities-action-btn"
                          disabled={busyId === k.entity_id || !reason.trim()}
                          onClick={() => act(k.entity_id, () => rejectKyc(k.entity_id, reason.trim()))}
                        >
                          Confirm
                        </button>
                      </>
                    )}
                    {k.status === "REJECTED" && k.reject_reason}
                    {rowErrors[k.entity_id] && <p className="entities-row-error">{rowErrors[k.entity_id]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
