import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  deletePlantDesign,
  listPlantDesigns,
  type PlantDesignListItem,
} from "../../api/plantDesign";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import Pagination from "../../lib/Pagination";
import "./PlantDesignListPage.css";

const PAGE_SIZE = 20;

export default function PlantDesignListPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [designs, setDesigns] = useState<PlantDesignListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<PlantDesignListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(null);
    listPlantDesigns(entityId, { page, page_size: PAGE_SIZE })
      .then((res) => {
        setDesigns(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load plant designs"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, page]);

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    deletePlantDesign(entityId, deleteTarget.plant_design_id)
      .then(() => {
        setDeleteTarget(null);
        load();
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to delete plant design"))
      .finally(() => setDeleting(false));
  }

  return (
    <div className="plant-design-list-page">
      <div className="plant-design-list-header">
        <h1>Plant Design</h1>
        <button className="plant-design-new-btn" onClick={() => navigate("/app/plant-design/new")}>
          + New Design
        </button>
      </div>

      {loadError && <div className="plant-design-list-error">{loadError}</div>}

      {loading ? (
        <div className="plant-design-list-empty">Loading…</div>
      ) : designs.length === 0 ? (
        <div className="plant-design-list-empty">
          No plant designs yet. Click "New Design" to lay out a rooftop and generate a single-line diagram.
        </div>
      ) : (
        <div className="plant-design-table-wrap">
          <table className="plant-design-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Address</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {designs.map((d) => (
                <tr key={d.plant_design_id}>
                  <td>
                    <button
                      className="plant-design-open-link"
                      onClick={() => navigate(`/app/plant-design/${d.plant_design_id}`)}
                    >
                      {d.name}
                    </button>
                  </td>
                  <td>
                    <span className={`plant-design-status plant-design-status-${d.status.toLowerCase()}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.capacity_kw != null ? `${d.capacity_kw.toFixed(1)} kW` : "—"}</td>
                  <td>{d.address || "—"}</td>
                  <td>{new Date(d.updated_at).toLocaleDateString()}</td>
                  <td className="plant-design-row-actions">
                    <button onClick={() => navigate(`/app/plant-design/${d.plant_design_id}`)}>Open</button>
                    <button className="plant-design-delete-btn" onClick={() => setDeleteTarget(d)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete plant design"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
        confirmLabel="Delete"
        confirming={deleting}
        confirmingLabel="Deleting…"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
