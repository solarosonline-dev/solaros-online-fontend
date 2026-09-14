import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { createPlantDesign, getPlantDesign, updatePlantDesign } from "../../api/plantDesign";
import { ApiError } from "../../api/client";
import PlantDesignEditor from "./PlantDesignEditor";
import type { PlantDesignData } from "./types";

// Thin route-level wrapper: loads an existing design (or starts blank for
// /new), and turns PlantDesignEditor's onSave into a POST (first save) or
// PATCH (every save after). The editor itself owns all the wizard state and
// knows nothing about HTTP - see types.ts's PlantDesignEditorProps.
export default function PlantDesignEditorPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { plantDesignId } = useParams<{ plantDesignId: string }>();
  const navigate = useNavigate();

  const [initialDesignData, setInitialDesignData] = useState<PlantDesignData | undefined>(undefined);
  const [loading, setLoading] = useState(plantDesignId != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tracks the id across the POST -> PATCH transition without waiting for
  // the route param to catch up (navigate() below is async-ish from
  // React's perspective within the same tick).
  const [savedId, setSavedId] = useState<number | null>(plantDesignId ? Number(plantDesignId) : null);

  useEffect(() => {
    if (!plantDesignId) return;
    setLoading(true);
    setLoadError(null);
    getPlantDesign(entityId, Number(plantDesignId))
      .then((detail) => {
        setInitialDesignData(detail.design_data);
        setSavedId(detail.plant_design_id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load plant design"))
      .finally(() => setLoading(false));
  }, [entityId, plantDesignId]);

  async function handleSave(
    data: PlantDesignData,
    meta: { name: string; capacityKw: number | null; latitude: number | null; longitude: number | null },
  ) {
    const body = {
      name: meta.name,
      capacity_kw: meta.capacityKw,
      latitude: meta.latitude,
      longitude: meta.longitude,
      design_data: data,
    };
    if (savedId == null) {
      const created = await createPlantDesign(entityId, body);
      setSavedId(created.plant_design_id);
      // Replace, not push - the /new URL shouldn't stay in history once a
      // real id exists, so back-navigation doesn't return to a stale "new"
      // form that would create a second design on the next save.
      navigate(`/app/plant-design/${created.plant_design_id}`, { replace: true });
      return created.design_data;
    }
    const updated = await updatePlantDesign(entityId, savedId, body);
    return updated.design_data;
  }

  if (loading) return <div style={{ padding: 32, fontSize: 14, color: "var(--app-text-muted)" }}>Loading…</div>;
  if (loadError) {
    return (
      <div style={{ padding: 32, fontSize: 14, color: "var(--app-danger)" }}>{loadError}</div>
    );
  }

  return <PlantDesignEditor initialDesignData={initialDesignData} onSave={handleSave} />;
}
