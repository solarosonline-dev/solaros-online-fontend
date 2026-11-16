import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getPublicPlantDesign, type PublicPlantDesign } from "../../api/plantDesign";
import { getRoofPolygon, roofUsablePolygon, getRoofAzimuth, slopeDirectionAzimuth, obstacleFootprintPoints } from "./geometry.js";
import { computeStructure, resolvedGridPanels, gridDirection } from "./layoutEngine.js";
import { solarPosition } from "./solarMath.js";
import { metersPerPixel } from "../../components/map/geoConvert.js";
import SitePlanSvg, { boundsOf, type SitePlanData } from "./SitePlanSvg";
import "./PublicPlantDesignPage.css";

const Scene3D = React.lazy(() => import("./Scene3D.jsx"));

// View-only page behind a design's share link (/d/:token): the design's
// latest saved state, 3D (orbit/zoom/pan) and 2D plan (zoom/pan), with none
// of the editor mounted - nothing here can change the design. Everything is
// derived from the saved design_data with the same pure functions the
// editor's own Design Report uses.

function placementOf(img: any) {
  if (!img) return null;
  const widthMeters = img.sizePx * metersPerPixel(img.centerLat, img.zoom, 1);
  return { cx: 0, cy: 0, widthMeters, heightMeters: widthMeters, url: img.url };
}

function panelFootprint(p: any, grid: any, roof: any) {
  const gridAz = slopeDirectionAzimuth(gridDirection(grid, roof));
  const a = (((p.rotation || 0) + (grid.rotation || 0) - (gridAz - 180)) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const hw = p.w / 2, hd = p.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
    x: p.x + lx * cos - ly * sin,
    y: p.y + lx * sin + ly * cos,
  }));
}

function ZoomPan({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function zoomAt(factor: number, cx: number, cy: number) {
    setView((v) => {
      const k = Math.min(12, Math.max(0.4, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Proportional to the wheel delta so a trackpad zooms smoothly (a
      // pinch arrives as ctrl+wheel with small deltas) and a mouse notch
      // still steps; line-mode deltas are scaled up to match.
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className="pdv-zoom"
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <div className="pdv-zoom-inner" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>{children}</div>
      <div className="pdv-zoom-btns" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => { const r = ref.current!.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); }} aria-label="Zoom in">+</button>
        <button onClick={() => { const r = ref.current!.getBoundingClientRect(); zoomAt(1 / 1.4, r.width / 2, r.height / 2); }} aria-label="Zoom out">−</button>
        <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset view">⟲</button>
      </div>
    </div>
  );
}

function DesignViews({ design }: { design: PublicPlantDesign }) {
  const [tab, setTab] = useState<"3d" | "2d">("3d");
  // Scene3D reports how far the camera has swung from north, so the dial's
  // needle keeps pointing at true north (same as the editor's 3D compass).
  const [compassDeg, setCompassDeg] = useState(0);
  const data: any = design.design_data;
  const roofs: any[] = data.roofs ?? [];
  const obstacles: any[] = data.obstacles ?? [];
  const location = data.location ?? { lat: design.latitude ?? 0, lon: design.longitude ?? 0, tz: 5.5 };
  const panelSpec = data.panelSpec;
  const images = data.siteImages ?? {};

  const backdrop = useMemo(() => placementOf(images.locationImage), [images.locationImage]);
  const backdropWide = useMemo(() => placementOf(images.locationImageWide), [images.locationImageWide]);

  const sun = useMemo(
    () => solarPosition(location.lat, location.lon, new Date(new Date().getFullYear(), 2, 21), 12, location.tz),
    [location],
  );

  const sceneRoofs = useMemo(
    () => roofs.map((roof) => ({
      id: roof.id,
      polygon: getRoofPolygon(roof),
      usablePolygon: roofUsablePolygon(roof),
      buildingHeight: roof.buildingHeight,
      boundaryHeight: roof.boundaryHeight,
      type: roof.type,
      pitchDeg: roof.pitchDeg,
      slopeDirection: roof.slopeDirection,
      azimuth: getRoofAzimuth(roof, location),
      grids: (roof.grids ?? []).map((g: any) => ({
        id: g.id, selected: false, deleteMode: false, layout: g,
        structure: computeStructure({ roof, layout: g }),
      })),
    })),
    [roofs, location],
  );

  const plan: SitePlanData = useMemo(() => ({
    roofs: roofs.map((r, i) => ({ id: r.id, label: r.label || `Roof ${i + 1}`, polygon: getRoofPolygon(r) })),
    panels: roofs.flatMap((r) => (r.grids ?? []).flatMap((g: any) => resolvedGridPanels(g).map((p: any) => ({ roofId: r.id, corners: panelFootprint(p, g, r) })))),
    obstacles: obstacles
      .filter((o) => o.label !== "Cutout")
      .map((o) => ({ polygon: obstacleFootprintPoints(o).slice(1), round: o.shape !== "box" && o.shape !== "polygon", cx: o.x, cy: o.y, r: o.radius || 0 })),
    backdrop: backdrop ? { dataUrl: backdrop.url, widthMeters: backdrop.widthMeters, heightMeters: backdrop.heightMeters } : null,
  }), [roofs, obstacles, backdrop]);

  const focus = useMemo(() => {
    const pts = roofs.flatMap((r) => getRoofPolygon(r));
    return pts.length ? boundsOf(pts) : { minX: -15, maxX: 15, minY: -15, maxY: 15 };
  }, [roofs]);

  return (
    <>
      <div className="pdv-tabs">
        <button className={tab === "3d" ? "active" : ""} onClick={() => setTab("3d")}>3D view</button>
        <button className={tab === "2d" ? "active" : ""} onClick={() => setTab("2d")}>2D plan</button>
      </div>
      <div className="pdv-stage">
        {tab === "3d" ? (
          <React.Suspense fallback={<div className="pdv-note">Loading 3D view…</div>}>
            <Scene3D
              roofs={sceneRoofs}
              panelSpec={panelSpec}
              obstacles={obstacles}
              sunElevation={sun.elevation}
              sunAzimuth={sun.azimuth}
              mapImagePlacement={backdrop}
              mapImageWidePlacement={backdropWide}
              onCompassAngleChange={setCompassDeg}
            />
          </React.Suspense>
        ) : (
          <ZoomPan>
            <SitePlanSvg data={plan} focus={focus} padFrac={0.25} minPad={6} fitLabels />
          </ZoomPan>
        )}
        {tab === "3d" && (
          <div className="pdv-compass" aria-label="Compass: needle points true north">
            <svg width="46" height="46" viewBox="0 0 36 36">
              <g transform={compassDeg ? `rotate(${compassDeg} 18 18)` : undefined}>
                <circle cx="18" cy="18" r="13" fill="#fafafa" stroke="#ddd" strokeWidth="1" />
                <line x1="18" y1="18" x2="18" y2="11" stroke="#e0873c" strokeWidth="2" />
                <polygon points="18,7 15,12 21,12" fill="#e0873c" />
                <text x="18" y="6" fontSize="6.5" fontWeight="700" textAnchor="middle" fill="#e0873c">N</text>
                <text x="18" y="33" fontSize="6.5" textAnchor="middle" fill="#888">S</text>
                <text x="4" y="20" fontSize="6.5" textAnchor="middle" fill="#888">W</text>
                <text x="32" y="20" fontSize="6.5" textAnchor="middle" fill="#888">E</text>
              </g>
            </svg>
          </div>
        )}
      </div>
      <p className="pdv-hint">{tab === "3d" ? "Drag to rotate · scroll or pinch to zoom · right-drag to pan" : "Scroll or use +/− to zoom · drag to pan"}</p>
    </>
  );
}

export default function PublicPlantDesignPage() {
  const { token } = useParams();
  const [design, setDesign] = useState<PublicPlantDesign | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicPlantDesign(token)
      .then(setDesign)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "This link is invalid or has expired." : "Could not load this design."));
  }, [token]);

  if (error) return <div className="pdv-page"><div className="pdv-note">{error}</div></div>;
  if (!design) return <div className="pdv-page"><div className="pdv-note">Loading…</div></div>;

  return (
    <div className="pdv-page">
      <header className="pdv-header">
        <div>
          <h1>{design.name}</h1>
          <p>
            {design.entity_name}
            {design.capacity_kw != null ? ` · ${design.capacity_kw.toFixed(1)} kW` : ""}
            {design.address ? ` · ${design.address}` : ""}
          </p>
        </div>
      </header>
      <DesignViews design={design} />
    </div>
  );
}
