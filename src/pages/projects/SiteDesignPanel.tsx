import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listPlantDesigns, type PlantDesignListItem } from "../../api/plantDesign";

export default function SiteDesignPanel({
  entityId,
  workOrderId,
  projectId,
  leadId,
}: {
  entityId: number;
  workOrderId: number;
  projectId: number | null;
  leadId: number;
}) {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<PlantDesignListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPlantDesigns(entityId, { work_order_id: workOrderId })
      .then((res) => setDesigns(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entityId, workOrderId]);

  if (loading) return <div className="text-muted">Loading site designs...</div>;

  const handleCreateNew = () => {
    const params = new URLSearchParams({
      workOrderId: String(workOrderId),
      leadId: String(leadId)
    });
    if (projectId) params.set("projectId", String(projectId));
    navigate(`/app/plant-design/new?${params.toString()}`);
  };

  return (
    <div style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "1.25rem", marginBottom: "1.5rem" }}>
      <h3 style={{ margin: "0 0 1rem" }}>Site Design</h3>
      {designs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {designs.map(design => (
            <div key={design.plant_design_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--app-bg-hover)", borderRadius: "var(--app-radius)" }}>
              <div>
                <strong>{design.name}</strong>
                <div style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>
                  {design.status} {design.capacity_kw ? `· ${design.capacity_kw} kWp` : ""}
                </div>
              </div>
              <button 
                type="button" 
                className="projects-btn primary"
                onClick={() => navigate(`/app/plant-design/${design.plant_design_id}`)}
              >
                Open Design Tool
              </button>
            </div>
          ))}
          <div style={{ marginTop: "8px" }}>
             <button type="button" className="projects-btn" onClick={handleCreateNew}>
               + Start another design
             </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-muted" style={{ margin: "0 0 1rem", fontSize: "14px" }}>
            No site design has been created for this work order yet.
          </p>
          <button type="button" className="projects-btn primary" onClick={handleCreateNew}>
            Start New Site Design
          </button>
        </div>
      )}
    </div>
  );
}
