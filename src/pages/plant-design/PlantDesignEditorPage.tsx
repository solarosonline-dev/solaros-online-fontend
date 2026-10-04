import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getLead } from "../../api/leads";
import { createPlantDesign, getPlantDesign, updatePlantDesign, uploadPlantDesignSiteImage } from "../../api/plantDesign";
import { ApiError } from "../../api/client";
import PlantDesignEditor from "./PlantDesignEditor";
import type { PlantDesignData } from "./types";

// Thin route-level wrapper: loads an existing design (or starts blank for
// /new), and turns PlantDesignEditor's onSave into a POST (first save) or
// PATCH (every save after). The editor itself owns all the wizard state and
// knows nothing about HTTP - see types.ts's PlantDesignEditorProps.
import { useSearchParams } from "react-router-dom";
import { uploadWorkOrderDocument } from "../../api/workOrders";
import { buildDesignReportPdf, PDF_ROOT_CLASS } from "./designReportPdf";

export default function PlantDesignEditorPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { plantDesignId } = useParams<{ plantDesignId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const workOrderIdParam = searchParams.get("workOrderId");
  const projectIdParam = searchParams.get("projectId");
  const leadIdParam = searchParams.get("leadId");

  const [initialDesignData, setInitialDesignData] = useState<PlantDesignData | undefined>(undefined);
  const [loading, setLoading] = useState(plantDesignId != null || leadIdParam != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tracks the id across the POST -> PATCH transition without waiting for
  // the route param to catch up (navigate() below is async-ish from
  // React's perspective within the same tick).
  const [savedId, setSavedId] = useState<number | null>(plantDesignId ? Number(plantDesignId) : null);

  // Id of a design this page just created (first save). Navigating from
  // /new to /:id changes the route param, which would otherwise re-run the
  // load effect below - showing "Loading…" (unmounting the whole editor:
  // undo history, open panels, view mode) and refetching what the editor
  // already has, which also reloaded every site image.
  const justCreatedIdRef = useRef<number | null>(null);

  const [linkedWorkOrderId, setLinkedWorkOrderId] = useState<number | null>(workOrderIdParam ? Number(workOrderIdParam) : null);

  useEffect(() => {
    if (plantDesignId && justCreatedIdRef.current === Number(plantDesignId)) {
      justCreatedIdRef.current = null;
      return;
    }
    if (plantDesignId) {
      setLoading(true);
      setLoadError(null);
      getPlantDesign(entityId, Number(plantDesignId))
        .then((detail) => {
          setInitialDesignData(detail.design_data);
          setSavedId(detail.plant_design_id);
          if (detail.work_order_id) {
            setLinkedWorkOrderId(detail.work_order_id);
          }
        })
        .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load plant design"))
        .finally(() => setLoading(false));
    } else if (leadIdParam) {
      setLoading(true);
      setLoadError(null);
      getLead(entityId, Number(leadIdParam))
        .then((lead) => {
          if (lead.latitude != null && lead.longitude != null) {
            setInitialDesignData({
              location: { lat: lead.latitude, lon: lead.longitude, tz: 5.5 },
            } as any);
          }
        })
        .catch((err) => console.warn("Failed to load lead location", err))
        .finally(() => setLoading(false));
    }
  }, [entityId, plantDesignId, leadIdParam]);

  async function handleGeneratePdf() {
    if (!linkedWorkOrderId) return;
    
    // Captures whichever of these the editor is currently showing - the
    // plan/3D view (`.pde-map-container`, design steps) and/or the SLD
    // (PDF_ROOT_CLASS, SLD step) - see designReportPdf.ts.
    const viewContainer = document.querySelector(".pde-map-container") as HTMLElement;
    const sldContainer = document.querySelector(`.${PDF_ROOT_CLASS}`) as HTMLElement;
    
    if (!viewContainer && !sldContainer) {
       alert("Nothing to capture. Please ensure you have a design or SLD generated.");
       return;
    }

    try {
      const pdfBlob = await buildDesignReportPdf({ viewContainer, sldContainer });
      const file = new File([pdfBlob], "Site_Design_Report.pdf", { type: "application/pdf" });

      await uploadWorkOrderDocument(entityId, linkedWorkOrderId, file);
      
      alert("Design Document generated and attached to Work Order successfully!");
      
      // Navigate back if we were created explicitly for a project
      if (projectIdParam) {
        navigate(`/app/projects/${projectIdParam}`);
      } else {
        navigate(`/app/work-orders/${linkedWorkOrderId}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate or upload the design document.");
      throw err; // bubble up to stop the button's loading state
    }
  }

  async function handleSave(
    data: PlantDesignData,
    meta: { name: string; capacityKw: number | null; latitude: number | null; longitude: number | null },
  ) {
    const body: any = {
      name: meta.name,
      capacity_kw: meta.capacityKw,
      latitude: meta.latitude,
      longitude: meta.longitude,
      design_data: data,
    };
    if (savedId == null) {
      if (workOrderIdParam) body.work_order_id = Number(workOrderIdParam);
      if (projectIdParam) body.project_id = Number(projectIdParam);
      if (leadIdParam) body.lead_id = Number(leadIdParam);

      const created = await createPlantDesign(entityId, body);
      setSavedId(created.plant_design_id);
      justCreatedIdRef.current = created.plant_design_id;
      
      // Preserve the query params if we came from a work order so the UI knows we are still linked
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
      
      // Replace, not push - the /new URL shouldn't stay in history once a
      // real id exists, so back-navigation doesn't return to a stale "new"
      // form that would create a second design on the next save.
      navigate(`/app/plant-design/${created.plant_design_id}${qs}`, { replace: true });
      return created.design_data;
    }
    const updated = await updatePlantDesign(entityId, savedId, body);
    return updated.design_data;
  }

  async function handleCaptureSiteImage(blob: Blob, contentType: string) {
    const result = await uploadPlantDesignSiteImage(entityId, blob, contentType);
    return { s3Key: result.s3_key, url: result.url };
  }

  if (loading) return <div style={{ padding: 32, fontSize: 14, color: "var(--app-text-muted)" }}>Loading…</div>;
  if (loadError) {
    return (
      <div style={{ padding: 32, fontSize: 14, color: "var(--app-danger)" }}>{loadError}</div>
    );
  }

  return (
    <PlantDesignEditor
      initialDesignData={initialDesignData}
      onSave={handleSave}
      onCaptureSiteImage={handleCaptureSiteImage}
      linkedWorkOrderId={linkedWorkOrderId}
      onGeneratePdf={handleGeneratePdf}
    />
  );
}
