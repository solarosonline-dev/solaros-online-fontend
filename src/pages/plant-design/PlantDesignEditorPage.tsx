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
import ConfirmDialog from "../../components/ConfirmDialog";
import { getEntity, type Entity } from "../../api/entity";
import { getEntityPreferences, type EntityPreferences } from "../../api/entityPreferences";
import type { LeadDetail } from "../../api/leads";
import type { PlantDesignEditorProps } from "./types";

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

  // Design Report context (see PlantDesignEditorProps.reportContext): the
  // entity's branding, plus client name/contact/address from the design's
  // linked lead - the ?leadId= one for a new design, or the saved design's
  // own lead_id. Best-effort: a failed fetch just leaves that part of the
  // report blank rather than blocking the editor.
  const [entity, setEntity] = useState<Entity | null>(null);
  const [preferences, setPreferences] = useState<EntityPreferences | null>(null);
  const [reportLeadId, setReportLeadId] = useState<number | null>(leadIdParam ? Number(leadIdParam) : null);
  const [reportLead, setReportLead] = useState<LeadDetail | null>(null);
  const [designAddress, setDesignAddress] = useState<string | null>(null);

  useEffect(() => {
    getEntity(entityId).then(setEntity).catch((err) => console.warn("Failed to load entity for report", err));
    getEntityPreferences(entityId).then(setPreferences).catch((err) => console.warn("Failed to load branding for report", err));
  }, [entityId]);

  useEffect(() => {
    // The ?leadId= path already fetched this lead in the load effect below.
    if (reportLeadId == null || reportLead?.lead_id === reportLeadId) return;
    getLead(entityId, reportLeadId).then(setReportLead).catch((err) => console.warn("Failed to load lead for report", err));
  }, [entityId, reportLeadId, reportLead]);

  const reportContext: PlantDesignEditorProps["reportContext"] = {
    branding: {
      entityName: entity?.name ?? "SolarOS",
      primaryColor: preferences?.branding.primary_color,
      logoUrl: preferences?.branding.logo_url,
      tagline: preferences?.branding.company_tagline,
      footerTag: preferences?.branding.footer_tag,
      gstno: entity?.gstno,
      taxIdLabel: entity?.tax_id_label,
      address: entity?.address,
      businessPhone: entity?.business_phone,
      businessEmail: entity?.business_email,
    },
    client: reportLead
      ? { name: reportLead.name, mobile: reportLead.mobile, email: reportLead.email, address: reportLead.address, discom: reportLead.discom }
      : null,
    siteAddress: reportLead?.address ?? designAddress,
  };

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
          setDesignAddress(detail.address);
          if (detail.lead_id) setReportLeadId(detail.lead_id);
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
          setReportLead(lead);
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

  // Set once a report has been attached - drives the success dialog below,
  // which offers a jump to the work order but lets the user stay put (it
  // used to navigate away to the project automatically).
  const [attachedToWorkOrderId, setAttachedToWorkOrderId] = useState<number | string | null>(null);

  async function handleAttachPdf(pdf: Blob, filename: string) {
    if (!linkedWorkOrderId) return;
    const file = new File([pdf], filename, { type: "application/pdf" });
    await uploadWorkOrderDocument(entityId, linkedWorkOrderId, file);
    setAttachedToWorkOrderId(linkedWorkOrderId);
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
    <>
      <PlantDesignEditor
        initialDesignData={initialDesignData}
        onSave={handleSave}
        onCaptureSiteImage={handleCaptureSiteImage}
        linkedWorkOrderId={linkedWorkOrderId}
        onAttachPdf={handleAttachPdf}
        onRefreshSiteImages={savedId != null ? async () => (await getPlantDesign(entityId, savedId)).design_data.siteImages : undefined}
        reportContext={reportContext}
      />
      <ConfirmDialog
        open={attachedToWorkOrderId != null}
        title="PDF attached"
        message="The design report was attached to the work order. You'll find it with the work order's documents."
        confirmLabel="Go to work order"
        cancelLabel="Stay here"
        danger={false}
        onConfirm={() => {
          const id = attachedToWorkOrderId;
          setAttachedToWorkOrderId(null);
          navigate(`/app/work-orders/${id}`);
        }}
        onCancel={() => setAttachedToWorkOrderId(null)}
      />
    </>
  );
}
