import { useState, useRef, useEffect } from "react";
import SignaturePad from "../../components/SignaturePad";
import type { SignaturePadHandle } from "../../components/SignaturePad";
import Modal from "../../components/Modal";
import { formatMoney } from "../../lib/money";
import "./GovtSchemesDemoPage.css";

interface FarmerLead {
  id: string;
  name: string;
  location: string;
  type: "PUMP" | "ROOFTOP";
  capacity: string;
  surveyStatus: "PENDING" | "COMPLETED";
  eligibility: "PENDING" | "ELIGIBLE" | "INELIGIBLE";
  rejectionReason?: string;
  coords: { x: number; y: number };
  serialNumber?: string;
  installStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  geotagPhoto?: string;
  signatureData?: string;
}

const SEEDED_LEADS: FarmerLead[] = [
  { id: "BEN-101", name: "Sohan Singh", location: "Jabalpur", type: "PUMP", capacity: "5 HP", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 100, y: 120 }, installStatus: "PENDING" },
  { id: "BEN-102", name: "Ramesh Patel", location: "Jabalpur", type: "PUMP", capacity: "5 HP", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 80, y: 150 }, installStatus: "PENDING" },
  { id: "BEN-103", name: "Devendra Lodhi", location: "Jabalpur", type: "PUMP", capacity: "5 HP", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 140, y: 90 }, installStatus: "PENDING" },
  { id: "BEN-104", name: "Kamlesh Yadav", location: "Jabalpur", type: "PUMP", capacity: "5 HP", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 120, y: 170 }, installStatus: "PENDING" },
  { id: "BEN-105", name: "Rajendra Sharma", location: "Neemuch", type: "ROOFTOP", capacity: "3 kW", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 310, y: 280 }, installStatus: "PENDING" },
  { id: "BEN-106", name: "Gopal Patidar", location: "Neemuch", type: "ROOFTOP", capacity: "3 kW", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 350, y: 240 }, installStatus: "PENDING" },
  { id: "BEN-107", name: "Harakchand Jain", location: "Neemuch", type: "ROOFTOP", capacity: "3 kW", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 290, y: 210 }, installStatus: "PENDING" },
  { id: "BEN-108", name: "Shyam Lal", location: "Neemuch", type: "ROOFTOP", capacity: "3 kW", surveyStatus: "COMPLETED", eligibility: "ELIGIBLE", coords: { x: 370, y: 290 }, installStatus: "PENDING" },
  { id: "BEN-109", name: "Bhupendra Baghel", location: "Jabalpur", type: "PUMP", capacity: "5 HP", surveyStatus: "COMPLETED", eligibility: "INELIGIBLE", rejectionReason: "Survey Fail: Borewell water discharge < 50 LPM", coords: { x: 60, y: 70 }, installStatus: "PENDING" },
  { id: "BEN-110", name: "Manoj Mishra", location: "Neemuch", type: "ROOFTOP", capacity: "3 kW", surveyStatus: "COMPLETED", eligibility: "INELIGIBLE", rejectionReason: "Survey Fail: Structural shading on RCC slab", coords: { x: 410, y: 220 }, installStatus: "PENDING" },
];

export default function GovtSchemesDemoPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "ingest" | "clustering" | "dispatch" | "finances">("overview");
  const [leads, setLeads] = useState<FarmerLead[]>([]);
  const [ingestState, setIngestState] = useState<"idle" | "loading" | "done">("idle");
  const [clusteringDone, setClusteringDone] = useState(false);
  const [assignedTeam, setAssignedTeam] = useState<Record<string, string>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string>("BEN-101");
  const [serialInput, setSerialInput] = useState("");
  const [installPhoto, setInstallPhoto] = useState<string | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [selectedDossierLead, setSelectedDossierLead] = useState<FarmerLead | null>(null);

  const sigPadRef = useRef<SignaturePadHandle>(null);

  // Inbound simulation
  function handleRunIngest() {
    setIngestState("loading");
    setTimeout(() => {
      setLeads(SEEDED_LEADS);
      setIngestState("done");
    }, 2000);
  }

  // Pre-seed if user clicks straight to sections
  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "ingest" && leads.length === 0) {
      setLeads(SEEDED_LEADS);
      setIngestState("done");
    }
  }, [activeTab, leads.length]);

  // Bulk assignment helper
  function handleAssignAllTeams() {
    setAssignedTeam({
      "cluster-jabalpur": "TEAM_ALPHA",
      "cluster-neemuch": "TEAM_BETA",
    });
  }

  // Handle installer submission inside Mobile Preview
  function handleMobileSubmit() {
    const dataUrl = sigPadRef.current?.toDataUrl();
    
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === selectedLeadId) {
          return {
            ...l,
            installStatus: "COMPLETED",
            serialNumber: serialInput || `SN-${l.id}-8276`,
            geotagPhoto: installPhoto || (l.type === "PUMP" ? "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=400&q=80" : "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=80"),
            signatureData: dataUrl || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='30'><path d='M10 20 Q 30 5, 60 20 T 90 20' stroke='black' fill='transparent'/></svg>"
          };
        }
        return l;
      })
    );
    
    alert(`Handover report submitted successfully for ${leads.find(l => l.id === selectedLeadId)?.name}! Customer signature recorded.`);
    sigPadRef.current?.clear();
    setSerialInput("");
    setInstallPhoto(null);
  }

  // Preset photo simulations
  function handleAddPresetPhoto(type: "PUMP" | "ROOFTOP") {
    if (type === "PUMP") {
      setInstallPhoto("https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=400&q=80"); // beautiful solar pump photo
    } else {
      setInstallPhoto("https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=80"); // solar rooftop photo
    }
  }

  // Open Claims dossier
  function handleOpenDossier(leadId: string) {
    const matchingLead = leads.find((l) => l.id === leadId);
    if (matchingLead) {
      setSelectedDossierLead(matchingLead);
      setIsDossierOpen(true);
    }
  }

  const eligibleLeads = leads.filter((l) => l.eligibility === "ELIGIBLE");
  const completedLeads = leads.filter((l) => l.installStatus === "COMPLETED");

  return (
    <div className="govt-demo-container">
      <div className="govt-demo-header">
        <h1>Government Schemes <em>Workspace</em> <span className="govt-demo-badge">Demo Hub</span></h1>
        <p className="subtitle">Simulating and managing bulk solar pump schemes and grant subsidized rooftop pipelines end-to-end.</p>
      </div>

      <div className="govt-demo-tabs">
        <button className={`govt-demo-tab-btn ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>Scheme Overview</button>
        <button className={`govt-demo-tab-btn ${activeTab === "ingest" ? "active" : ""}`} onClick={() => setActiveTab("ingest")}>1. Bulk Ingest & Surveys</button>
        <button className={`govt-demo-tab-btn ${activeTab === "clustering" ? "active" : ""}`} onClick={() => setActiveTab("clustering")}>2. Geospatial Clusters</button>
        <button className={`govt-demo-tab-btn ${activeTab === "dispatch" ? "active" : ""}`} onClick={() => setActiveTab("dispatch")}>3. Mobile Dispatch & Handover</button>
        <button className={`govt-demo-tab-btn ${activeTab === "finances" ? "active" : ""}`} onClick={() => setActiveTab("finances")}>4. Grant Milestones</button>
      </div>

      <div className="govt-demo-panel">
        {/* Tab 1: Scheme Overview */}
        {activeTab === "overview" && (
          <div className="govt-overview-grid">
            <div className="govt-overview-main">
              <h2>Deploying Government Solar Schemes at Scale</h2>
              <p>
                SolarOS has been adapted to solve the heavy operational complexity of mass-scale government solar pump (e.g. <strong>PM-KUSUM</strong>) and residential rooftop programs (e.g. <strong>PM Surya Ghar</strong>). By migrating manual workflows onto our digitized framework, installers can deploy up to 3x faster, achieve perfect audit clearance, and track payments seamlessly.
              </p>
              
              <div className="govt-steps-outline">
                <div className="govt-step-card">
                  <span className="govt-step-num">1</span>
                  <div className="govt-step-info">
                    <h3>Bulk Ingestion & Feasibility</h3>
                    <p>Load scheme allocation files as a single CSV, instantly auto-generating SITE_SURVEY tasks for field estimators to screen eligibility on-site.</p>
                  </div>
                </div>
                <div className="govt-step-card">
                  <span className="govt-step-num">2</span>
                  <div className="govt-step-info">
                    <h3>Map-Clustering & Regional Warehousing</h3>
                    <p>Geospatially group eligible installations. Calculate aggregates to order in bulk and deliver to nearest warehouse centroids, slashing logistics costs.</p>
                  </div>
                </div>
                <div className="govt-step-card">
                  <span className="govt-step-num">3</span>
                  <div className="govt-step-info">
                    <h3>Mobile Dispatch & Verified Handover</h3>
                    <p>Field workers mechanical-install systems, capture serial keys, upload geotagged proof-of-work photos, and lock down farmer on-screen touch signatures.</p>
                  </div>
                </div>
                <div className="govt-step-card">
                  <span className="govt-step-num">4</span>
                  <div className="govt-step-info">
                    <h3>Milestone Claim Release</h3>
                    <p>Generate digital claims containing signature certificates and photo coordinates directly from SolarOS, unlocking staggered subsidy claims.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="govt-overview-sidebar">
              <h3>Active Scheme Summary</h3>
              <div className="govt-scheme-metric">
                <span className="m-label">Govt Scheme Name</span>
                <span className="m-val text-success">PM-KUSUM (Pumps) & Surya Ghar (Rooftops)</span>
              </div>
              <div className="govt-scheme-metric">
                <span className="m-label">Allocated Work Order Size</span>
                <span className="m-val">500 Installations Allotted</span>
              </div>
              <div className="govt-scheme-metric">
                <span className="m-label">Payment Split Structure</span>
                <span className="m-val" style={{ fontSize: "14px" }}>90% Govt Grant  |  10% Farmers Co-Pay</span>
              </div>
              <div className="govt-scheme-metric">
                <span className="m-label">Total Contract Value (Est.)</span>
                <span className="m-val" style={{ color: "var(--app-accent)" }}>₹12,50,00,000</span>
              </div>
              <div style={{ marginTop: 24 }}>
                <button className="govt-demo-btn" style={{ width: "100%" }} onClick={() => setActiveTab("ingest")}>Launch Demo Walkthrough</button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Bulk Ingest & Surveys */}
        {activeTab === "ingest" && (
          <div>
            {ingestState === "idle" && (
              <div className="govt-ingest-uploader" onClick={handleRunIngest}>
                <span className="govt-ingest-icon">📥</span>
                <h3>Drag & Drop Scheme Allocation Files Here</h3>
                <p>Supports .CSV, .XLSX beneficiary lists from Nodal Government Agencies (e.g., MEDA, GEDA, MPUVN)</p>
                <button className="govt-demo-btn">Load Demo Scheme File (10 Beneficiaries)</button>
              </div>
            )}

            {ingestState === "loading" && (
              <div className="govt-loader-overlay">
                <div className="govt-spinner"></div>
                <p className="govt-loader-text">Parsing Beneficiary Coordinates & Registering Scheme Leads...</p>
              </div>
            )}

            {ingestState === "done" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Allotted Beneficiary Survey Roster ({leads.length} Records)</h3>
                  <div>
                    <button className="govt-demo-btn sec" onClick={() => setLeads([])}>Reset Demo</button>
                    <button className="govt-demo-btn" onClick={() => setActiveTab("clustering")} style={{ marginLeft: 8 }}>Proceed to Clustering Map →</button>
                  </div>
                </div>
                <div className="govt-leads-table-container">
                  <table className="govt-table">
                    <thead>
                      <tr>
                        <th>Beneficiary ID</th>
                        <th>Farmer Name</th>
                        <th>District Region</th>
                        <th>Scheme Type</th>
                        <th>Target Capacity</th>
                        <th>Feasibility Survey</th>
                        <th>Eligibility Status</th>
                        <th>Survey Audit Log</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: "700" }}>{l.id}</td>
                          <td>{l.name}</td>
                          <td>{l.location}</td>
                          <td>{l.type === "PUMP" ? "💧 Solar Pump" : "🏠 Rooftop Grid"}</td>
                          <td>{l.capacity}</td>
                          <td>
                            <span style={{ color: "#059669", fontWeight: "600" }}>✓ Survey Conducted</span>
                          </td>
                          <td>
                            <span className={`govt-status-badge ${l.eligibility.toLowerCase()}`}>
                              {l.eligibility}
                            </span>
                          </td>
                          <td style={{ color: "var(--app-text-muted)", fontSize: "12px" }}>
                            {l.eligibility === "ELIGIBLE" && `✓ Feasible. Location verified (${l.coords.x}, ${l.coords.y})`}
                            {l.eligibility === "INELIGIBLE" && `${l.rejectionReason}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Geospatial Clusters */}
        {activeTab === "clustering" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Cluster Map: Spatial Logistics Optimization</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--app-text-muted)" }}>
                  Aggregating the 8 eligible consumer locations into high-density local clusters matching local regional warehouses.
                </p>
              </div>
              <button className="govt-demo-btn" onClick={() => setActiveTab("dispatch")}>Proceed to Field Dispatch →</button>
            </div>

            <div className="govt-split-layout">
              {/* Left Panel: SVG Map Simulation */}
              <div className="govt-map-panel">
                <div className="govt-svg-map" style={{ position: "relative" }}>
                  <svg width="100%" height="100%" viewBox="0 0 500 380" style={{ background: "#eef2f7" }}>
                    {/* Grid lines */}
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Jabalpur Cluster Radius (North) */}
                    {clusteringDone && (
                      <circle cx="110" cy="130" r="65" fill="rgba(37, 99, 235, 0.12)" stroke="rgba(37, 99, 235, 0.4)" strokeDasharray="4 4" />
                    )}

                    {/* Neemuch Cluster Radius (West) */}
                    {clusteringDone && (
                      <circle cx="340" cy="255" r="65" fill="rgba(245, 158, 11, 0.12)" stroke="rgba(245, 158, 11, 0.4)" strokeDasharray="4 4" />
                    )}

                    {/* Plot Warehouses (Warehouse Centers) */}
                    <g transform="translate(140, 150)">
                      <rect x="-10" y="-10" width="20" height="20" fill="var(--app-accent)" rx="3" />
                      <text y="-14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1e3a8a">Jabalpur Nodal Hub</text>
                    </g>
                    <g transform="translate(320, 240)">
                      <rect x="-10" y="-10" width="20" height="20" fill="var(--app-accent)" rx="3" />
                      <text y="-14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1e3a8a">Neemuch Depot</text>
                    </g>

                    {/* Plot Farmer Pins */}
                    {eligibleLeads.map((l) => (
                      <g key={l.id} transform={`translate(${l.coords.x}, ${l.coords.y})`}>
                        <circle cx="0" cy="0" r="7" fill={l.type === "PUMP" ? "var(--app-accent-hover)" : "var(--app-accent)"} />
                        <circle cx="0" cy="0" r="3" fill="#fff" />
                        <text y="14" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#334155">{l.name.split(" ")[0]}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="govt-map-controls">
                  <span className="govt-map-info">
                    {clusteringDone ? "✓ 2 Logistic Clusters mapped to 2 Warehouse Centroids." : "Eligible Coordinates loaded. Click Group Clusters to optimize."}
                  </span>
                  <button className="govt-demo-btn" onClick={() => setClusteringDone(true)}>
                    Group into Logistics Clusters
                  </button>
                </div>
              </div>

              {/* Right Panel: Warehouse aggregates */}
              <div className="govt-info-side">
                {clusteringDone ? (
                  <>
                    <div className="govt-cluster-summary-card">
                      <h4>
                        <span>📦 Jabalpur Regional Hub (Cluster 1)</span>
                        <span style={{ color: "var(--app-accent)" }}>4 Pumps Mapped</span>
                      </h4>
                      <p style={{ fontSize: "12.5px", color: "var(--app-text-muted)", margin: "4px 0 0 0" }}>
                        Aggregated Bill of Materials (BoM) for: Sohan S, Ramesh P, Devendra L, Kamlesh Y.
                      </p>
                      <ul className="govt-cluster-bom-list">
                        <li>5 HP Submersible Pumps <span>4 units</span></li>
                        <li>5 HP Controllers <span>4 units</span></li>
                        <li>335 Wp Poly Panels <span>48 units</span></li>
                        <li>Structural Mounts <span>4 units</span></li>
                        <li>6 Sqmm Copper Cable <span>400 m</span></li>
                        <li>HDPE Pipe 10kg/sqcm <span>240 m</span></li>
                      </ul>
                      <button className="govt-demo-btn" style={{ width: "100%", marginTop: 12, fontSize: "11px", padding: "6px" }}>Issue Bulk Procurement Order</button>
                    </div>

                    <div className="govt-cluster-summary-card">
                      <h4>
                        <span>📦 Neemuch Regional Depot (Cluster 2)</span>
                        <span style={{ color: "var(--app-accent)" }}>4 Rooftops Mapped</span>
                      </h4>
                      <p style={{ fontSize: "12.5px", color: "var(--app-text-muted)", margin: "4px 0 0 0" }}>
                        Aggregated Bill of Materials (BoM) for: Rajendra S, Gopal P, Harakchand J, Shyam L.
                      </p>
                      <ul className="govt-cluster-bom-list">
                        <li>3 kW On-Grid Inverter <span>4 units</span></li>
                        <li>535 Wp Mono Panels <span>24 units</span></li>
                        <li>AC/DC Distribution Box <span>4 units</span></li>
                        <li>Elevated Structure <span>4 units</span></li>
                        <li>Earthing Rods <span>12 units</span></li>
                        <li>Lightning Arresters <span>4 units</span></li>
                      </ul>
                      <button className="govt-demo-btn" style={{ width: "100%", marginTop: 12, fontSize: "11px", padding: "6px" }}>Issue Bulk Procurement Order</button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--app-bg)", borderRadius: "var(--app-radius)", border: "1px solid var(--app-border)" }}>
                    <span style={{ fontSize: "40px" }}>🗺️</span>
                    <h4>Warehouse Mappings Locked</h4>
                    <p style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>Please click "Group into Logistics Clusters" on the left to calculate optimal warehouse routes and aggregate material demands.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Mobile Dispatch & Handover */}
        {activeTab === "dispatch" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Cluster Dispatch Control & Handover</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--app-text-muted)" }}>
                  Once materials hit warehouses, bulk dispatch clusters of farmers to field teams. Test the real-time mobile worker flow below.
                </p>
              </div>
              <div>
                {Object.keys(assignedTeam).length === 0 ? (
                  <button className="govt-demo-btn" onClick={handleAssignAllTeams}>Bulk Assign Clusters to Teams</button>
                ) : (
                  <button className="govt-demo-btn sec" onClick={() => setAssignedTeam({})}>Reset Assignments</button>
                )}
                <button className="govt-demo-btn" onClick={() => setActiveTab("finances")} style={{ marginLeft: 8 }}>Go to Finances & Claims →</button>
              </div>
            </div>

            <div className="govt-dispatch-grid">
              {/* Left Panel: Regional Clusters list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ padding: "16px", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", background: "var(--app-bg)" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>🎯 Cluster 1 (Jabalpur) - 4 Pumps</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span>Assignee Team: <strong>{assignedTeam["cluster-jabalpur"] ? "TEAM ALPHA (Sanjay & Ramesh)" : "UNASSIGNED"}</strong></span>
                    <span style={{ color: assignedTeam["cluster-jabalpur"] ? "#2563eb" : "#d97706", fontWeight: "bold" }}>
                      {assignedTeam["cluster-jabalpur"] ? "In Progress" : "Awaiting Dispatch"}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "16px", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", background: "var(--app-bg)" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>🎯 Cluster 2 (Neemuch) - 4 Rooftops</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span>Assignee Team: <strong>{assignedTeam["cluster-neemuch"] ? "TEAM BETA (Vijay & Amit)" : "UNASSIGNED"}</strong></span>
                    <span style={{ color: assignedTeam["cluster-neemuch"] ? "#2563eb" : "#d97706", fontWeight: "bold" }}>
                      {assignedTeam["cluster-neemuch"] ? "In Progress" : "Awaiting Dispatch"}
                    </span>
                  </div>
                </div>

                {/* Simulated Device Selector */}
                {Object.keys(assignedTeam).length > 0 && (
                  <div style={{ padding: "16px", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>📱 Choose Active Field Work Order to Demo:</h4>
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid var(--app-border)", fontSize: "13px" }}
                    >
                      {eligibleLeads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id} - {l.name} ({l.location} - {l.installStatus === "COMPLETED" ? "✓ Done" : "In Progress"})
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: "12px", color: "var(--app-text-muted)", marginTop: "8px" }}>
                      Selecting a beneficiary loads their specific active Work Order on the simulated mobile screen on the right.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Panel: Simulated Mobile App Shell */}
              <div>
                {Object.keys(assignedTeam).length > 0 ? (
                  <div className="govt-phone-shell">
                    <div className="govt-phone-top">
                      <div className="govt-phone-speaker"></div>
                    </div>
                    <div className="govt-phone-screen">
                      <div className="govt-phone-header">
                        SolarOS Field Worker App
                      </div>
                      <div className="govt-phone-content">
                        {(() => {
                          const currentLead = leads.find((l) => l.id === selectedLeadId);
                          if (!currentLead) return null;

                          return (
                            <>
                              <div style={{ fontWeight: "700", fontSize: "11px", textTransform: "uppercase", color: "var(--app-accent)" }}>
                                Active Installation Work Order
                              </div>
                              <div className="govt-phone-card">
                                <div className="govt-phone-field">
                                  <label>Beneficiary ID / Name</label>
                                  <div>{currentLead.id} - {currentLead.name}</div>
                                </div>
                                <div className="govt-phone-field">
                                  <label>Capacity Allotted</label>
                                  <div>{currentLead.capacity} {currentLead.type === "PUMP" ? "Solar Pump" : "Rooftop Solar"}</div>
                                </div>
                                <div className="govt-phone-field">
                                  <label>Field Address</label>
                                  <div>Region: {currentLead.location}, Madhya Pradesh</div>
                                </div>
                              </div>

                              {currentLead.installStatus === "COMPLETED" ? (
                                <div className="govt-phone-card" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", textAlign: "center" }}>
                                  <span style={{ fontSize: "24px" }}>✓</span>
                                  <h4 style={{ margin: "4px 0", color: "#065f46" }}>Installation Completed</h4>
                                  <p style={{ margin: 0, fontSize: "11px", color: "#047857" }}>Upload verification details received. Claims generated.</p>
                                </div>
                              ) : (
                                <>
                                  <div className="govt-phone-card">
                                    <div className="govt-phone-field">
                                      <label>Confirm Component Serial Key</label>
                                      <input
                                        type="text"
                                        className="govt-phone-input"
                                        placeholder={currentLead.type === "PUMP" ? "e.g. PUMP-8276" : "e.g. INV-9281"}
                                        value={serialInput}
                                        onChange={(e) => setSerialInput(e.target.value)}
                                      />
                                    </div>
                                    <div className="govt-phone-field">
                                      <label>On-Site Proof-of-Work Geotagged Photo</label>
                                      <div className="govt-photo-upload-grid">
                                        <div className="govt-photo-box" onClick={() => handleAddPresetPhoto(currentLead.type)}>
                                          {installPhoto ? (
                                            <img src={installPhoto} className="govt-photo-img" alt="Geotag install" />
                                          ) : (
                                            <>
                                              <span style={{ fontSize: "14px" }}>📸</span>
                                              <span style={{ fontSize: "9px" }}>Simulate Photo</span>
                                            </>
                                          )}
                                        </div>
                                        <div style={{ fontSize: "10px", color: "var(--app-text-muted)", display: "flex", alignItems: "center" }}>
                                          Click the grey box to simulate uploading a geotagged install photo.
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="govt-phone-card" style={{ display: "flex", flexDirection: "column" }}>
                                    <label style={{ fontWeight: "700", color: "var(--app-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
                                      Farmer / Homeowner Digital Signature
                                    </label>
                                    <div className="govt-phone-sig-area govt-sigpad-mini">
                                      <SignaturePad ref={sigPadRef} />
                                    </div>
                                    <button className="govt-demo-btn" style={{ width: "100%", marginTop: "10px" }} onClick={handleMobileSubmit}>
                                      Complete Installation & Submit Proofs
                                    </button>
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "100px 20px", background: "var(--app-bg)", borderRadius: "var(--app-radius)", border: "1px solid var(--app-border)" }}>
                    <span style={{ fontSize: "40px" }}>📱</span>
                    <h4>Field App Simulator Offline</h4>
                    <p style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>Please click "Bulk Assign Clusters to Teams" above to dispatch projects and open the worker touchscreen view.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Grant Milestones */}
        {activeTab === "finances" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Split Scheme Ledger & Claim Pipeline</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--app-text-muted)" }}>
                  Tracking the split payment structure: ₹2,50,000 Total pump installation cost (e.g. 10% farmer co-pay ₹25,000 + 90% government subsidy ₹2,25,000).
                </p>
              </div>
            </div>

            <div className="govt-finances-summary">
              <div className="govt-fin-card success">
                <h4>Farmers Co-pay Received</h4>
                <div className="amount">{formatMoney(completedLeads.length * 25000, "INR")}</div>
                <div style={{ fontSize: "11px", color: "var(--app-text-muted)", marginTop: "4px" }}>₹25,000 collected per completed site ({completedLeads.length}/8 sites)</div>
              </div>

              <div className="govt-fin-card accent">
                <h4>Government Subsidy Outstanding</h4>
                <div className="amount">{formatMoney(eligibleLeads.length * 225000 - completedLeads.length * 225000, "INR")}</div>
                <div style={{ fontSize: "11px", color: "var(--app-text-muted)", marginTop: "4px" }}>₹2,25,000 government subsidy portion per site</div>
              </div>

              <div className="govt-fin-card">
                <h4>Government Grant Cash-in</h4>
                <div className="amount">{formatMoney(completedLeads.length * 225000, "INR")}</div>
                <div style={{ fontSize: "11px", color: "var(--app-text-muted)", marginTop: "4px" }}>Subsidy claims approved / received to date</div>
              </div>
            </div>

            <h4 style={{ margin: "24px 0 12px 0" }}>Staggered Government Claim Cards ({completedLeads.length} Available for Claim)</h4>
            
            {completedLeads.length > 0 ? (
              <div className="govt-milestones-list">
                {completedLeads.map((l) => (
                  <div key={l.id} className="govt-m-card cleared">
                    <div className="govt-m-header">
                      <h5>{l.id} - {l.name}</h5>
                      <span className="govt-status-badge eligible">Ready</span>
                    </div>
                    <div className="govt-m-body">
                      <div>Type: <strong>{l.type === "PUMP" ? "5HP Solar Pump" : "3kW Rooftop"}</strong></div>
                      <div>Co-pay: <strong>Collected (₹25,000)</strong></div>
                      <div>Serial No: <code>{l.serialNumber}</code></div>
                      <div>Claim Value: <strong>₹2,25,000</strong></div>
                    </div>
                    <button className="govt-demo-btn" style={{ width: "100%" }} onClick={() => handleOpenDossier(l.id)}>
                      Open Claims Dossier
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--app-bg)", borderRadius: "var(--app-radius)", border: "1px solid var(--app-border)" }}>
                <span style={{ fontSize: "32px" }}>💰</span>
                <h4>No Subsidy Claims Generated Yet</h4>
                <p style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>Go to the <strong>3. Mobile Dispatch</strong> tab and submit a mobile handover signature. That will automatically trigger a claim release here!</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Claims Dossier Modal containing Digital Handover */}
      {isDossierOpen && selectedDossierLead && (
        <Modal
          open={isDossierOpen}
          onClose={() => setIsDossierOpen(false)}
        >
          <div className="govt-claims-dossier-wrapper">
            <div className="govt-claims-header">
              <span className="govt-claims-seal">🏛️</span>
              <h2>Government of Madhya Pradesh</h2>
              <p>Nodal Energy Agency  |  Renewable Energy Subsidy Claim & Completion Dossier</p>
            </div>

            <div className="govt-claims-section-title">I. Project Parameters</div>
            <div className="govt-claims-grid">
              <div className="govt-claims-field">
                <span>Beneficiary ID:</span>
                <span>{selectedDossierLead.id}</span>
              </div>
              <div className="govt-claims-field">
                <span>Name of Farmer:</span>
                <span>{selectedDossierLead.name}</span>
              </div>
              <div className="govt-claims-field">
                <span>District Region:</span>
                <span>{selectedDossierLead.location}, MP</span>
              </div>
              <div className="govt-claims-field">
                <span>Allotted Technology:</span>
                <span>{selectedDossierLead.type === "PUMP" ? "Solar Pump (5 HP)" : "Subsidized Rooftop (3 kW)"}</span>
              </div>
            </div>

            <div className="govt-claims-section-title">II. On-Site Technical Sign-Off</div>
            <div className="govt-claims-grid">
              <div className="govt-claims-field">
                <span>Component Serial:</span>
                <code>{selectedDossierLead.serialNumber}</code>
              </div>
              <div className="govt-claims-field">
                <span>Farmer Co-Pay Paid:</span>
                <span>YES (₹25,000)</span>
              </div>
              <div className="govt-claims-field">
                <span>Claim Release Amount:</span>
                <strong>₹2,25,000 (90%)</strong>
              </div>
              <div className="govt-claims-field">
                <span>GPS Location Match:</span>
                <span>✓ Verified ({selectedDossierLead.coords.x}, {selectedDossierLead.coords.y})</span>
              </div>
            </div>

            <div className="govt-claims-section-title">III. Completion Verification (Handover Proof)</div>
            
            <div className="govt-claims-media-grid">
              <div>
                <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>GPS-Geotagged Photo</div>
                <div className="govt-claims-photo-box">
                  {selectedDossierLead.geotagPhoto ? (
                    <img src={selectedDossierLead.geotagPhoto} alt="Install proof" />
                  ) : (
                    <span>[Geotagged Photo]</span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>Beneficiary Digital Signature</div>
                <div className="govt-claims-signature-box">
                  {selectedDossierLead.signatureData ? (
                    <img src={selectedDossierLead.signatureData} alt="Handover Signature" />
                  ) : (
                    <span>[Signature Not Found]</span>
                  )}
                  <span>Signed on Smartphone screen</span>
                </div>
              </div>
            </div>

            <div className="govt-claims-footer-seal">
              <div>
                <p style={{ margin: 0 }}>Verified & Uploaded by:</p>
                <strong style={{ display: "block", marginTop: "4px" }}>SolarOS Dispatch Engine</strong>
                <span style={{ fontSize: "9px", color: "#666" }}>Date: {new Date().toLocaleDateString()}</span>
              </div>
              <div className="govt-seal-circle">
                CLAIM<br />APPROVED
              </div>
            </div>

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button className="govt-demo-btn" onClick={() => {
                alert("Claim Dossier exported to Government Nodal Agency Portal successfully!");
                setIsDossierOpen(false);
              }}>
                Submit Claims Dossier to Nodal Agency Portal
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
