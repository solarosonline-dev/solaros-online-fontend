# SolarOS for Government Solar Schemes & Grants
### *Powering Bulk Rooftop & Solar Pump Deployments at Scale*

---

## Executive Summary

Solar EPC Installers executing government contracts (e.g., **PM-KUSUM** for agricultural solar pumps or **PM Surya Ghar** for subsidized rooftop installations) face complex operational and logistics challenges that differ fundamentally from private consumer sales:
1. **Bulk Ingest:** Managing thousands of prospective beneficiaries rather than single inbound leads.
2. **Strict Feasibility Gates:** Weeding out ineligible sites via rapid, structured field surveys.
3. **Logistical Dispersion:** Coordinating material supply across multiple rural warehouses to minimize transit costs.
4. **Field Execution at Scale:** Dispatching teams to remote areas, tracking real-time installation progress, and securing audit-compliant customer signatures.
5. **Staggered Multi-Party Financials:** Tracking 5-40% customer co-pays alongside 60-95% government milestone-based disbursements.

**SolarOS** is a modern, responsive, high-performance platform engineered specifically for solar installers. By extending the existing core modules of SolarOS—Leads, Site Surveys, Warehouses, Inventory, Procurement, Work Orders, and Financial Tracking—we can provide an end-to-end digital command center tailored for government contract execution.

---

## The 9-Step Scheme Workflow supported by SolarOS

Here is how the standard government solar deployment workflow maps beautifully into SolarOS’s functional architecture:

```
[ Government Work Order ] ──(Bulk CSV Import)──> [ X Leads Ingested ]
                                                       │
                                              (Bulk Work Order Gen)
                                                       ▼
[ Y Eligible Projects ] <──(Feasibility Check)─── [ SITE_SURVEY WOs ]
         │
         ├───> [ Geo-Clustering & Map Dashboard ] ──> Assign to Nearest Warehouses
         │
         ├───> [ Bulk Procurement ] ──> Procure & Stock Warehouse Inventories
         │
         └───> [ Team Assignment ] ──> Bulk-assign Work Orders to Field Teams
                                                    │
                                                    ▼
[ Government Claims ] <──(Milestone Verify)─── [ Mobile Signature & Geotag Proof ]
```

### 1. Scheme Ingest (Work Order for X Plants Received)
* **How SolarOS Supports It:** Instead of entering leads one-by-one, admins use a **Bulk Scheme Import** module. They upload a CSV containing the list of $X$ government-allotted beneficiaries.
* **Metadata Fields captured:** Beneficiary ID, Aadhaar/Khasra number, scheme name, target capacity (HP or kW), contact details, and pre-allotted coordinates.

### 2. Conduct Feasibility Survey for the X Plants
* **How SolarOS Supports It:** On CSV import, SolarOS automatically bulk-generates `SITE_SURVEY` Work Orders.
* **On-field Execution:** Field surveyors receive these on their mobile-responsive dashboards (`MyWorkOrdersPage`). They open the survey, which prompts them for critical feasibility metrics:
  * *Pump:* Water source depth, daily water requirement, casing size, and clear solar path.
  * *Rooftop:* Shade-free shadow layout, roof type (RCC/tin/ground-mount), and electricity board (DISCOM) connectivity.

### 3. Identify the Y Eligible Plants
* **How SolarOS Supports It:** Based on survey data, the SolarOS rules engine flags eligibility. Eligible sites ($Y$) are marked with a green badge and transitioned to `SITE_DESIGN_IN_PROGRESS`. Ineligible ones are logged with explicit rejection reasons (e.g., "Insufficient roof strength" or "Dry borewell") to provide clean audit reports back to the government.

### 4. Cluster the Y Eligible Plants
* **How SolarOS Supports It:** SolarOS leverages its geospatial features. Using the embedded `SiteMap.tsx` dashboard, eligible installations are plotted on an interactive map. 
* **Manager Controls:** Managers can filter by village/district, draw bounding circles around high-density pockets, and group them into **Logistics Clusters** (e.g., "Mandsaur Pump Cluster A - 50 Pumps").

### 5. Map & Identify Warehouses
* **How SolarOS Supports It:** Using warehouse location markers, SolarOS automatically calculates the centroid of each cluster and recommends the nearest active Warehouse or temporary regional storage yard. This minimizes transit times and transportation costs for heavy equipment like panels, steel structures, and pump controllers.

### 6. Purchase & Receive Z Units of Material
* **How SolarOS Supports It:** Traditional solar software handles procurement per customer. SolarOS’s bulk procurement groups the bill of materials (BoM) for the entire cluster (e.g., 50 pumps = 50 submersibles, 200kW panels, 50 structural mounts). 
* **Fulfillment:** It generates a unified Procurement Order (`procurement.ts`) to purchase in bulk from approved vendors, receiving materials directly into the assigned Warehouse inventory (`warehouses.ts`), ready for dispatch.

### 7. Team Assignment & Dispatch
* **How SolarOS Supports It:** A dedicated **Bulk Assignment Panel** lets managers select $n$ customer sites in a cluster and assign them to an installation team with one click.
* **Capacity Tracking:** Teams are loaded based on proximity and daily capability, attaching the active `INSTALLATION` Work Orders directly to their user accounts.

### 8. Installation & Mobile Signature Pad
* **How SolarOS Supports It:** Once on-site, the team installs the solar pump or rooftop system. Using the mobile field interface, they:
  1. Capture **geotagged & timestamped photos** of the running pump/lit panels (via `geotagPhoto.ts`).
  2. Take pictures of the controller serial numbers.
  3. Open the **Signature Pad** directly on their mobile/tablet screens. The farmer or homeowner signs on the screen to confirm successful installation, which is permanently embedded in the digital installation report.

### 9. Upload Complete details & Mark Done
* **How SolarOS Supports It:** With the signature and photos uploaded, the team marks the Work Order completed. This automatically transitions the master Project status in SolarOS to `INSTALLATION_COMPLETED`, updating regional warehouse inventory quantities to reflect the consumed materials and notifying the accounts team to trigger government billing.

---

## Staggered Government Grant Financial Model

Unlike standard retail solar, government schemes involve split-payment ledgers and staggered subsidy releases. SolarOS supports this complexity seamlessly:

| Stage | Milestone | Customer Share (5-40%) | Government Grant (60-95%) | System Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 1: Booking** | Scheme Registration | **100% of Co-pay due** (e.g., ₹20,000) | None | Tracked via `payments.ts` (Inbound Payment) |
| **Stage 2: Feasibility** | Eligibility Approved | Paid | **20% Subsidy Disbursed** (from Govt) | Survey marked "Eligible" in SolarOS |
| **Stage 3: Delivery** | Material dispatched | Paid | **50% Subsidy Disbursed** (from Govt) | Procurement Fulfill + Delivery WO marked done |
| **Stage 4: Commission** | Signed off & Running | Paid | **30% Final Subsidy** (from Govt) | Uploaded Customer Signature + Commissioning WO |

### Key Financial Dashboards:
* **The Beneficiary Invoice:** Clearly shows the total project cost (e.g., ₹2,50,000), the massive government subsidy (e.g., ₹2,25,000), and the small remaining farmer contribution (₹25,000), providing high-transparency documents that encourage farmer trust.
* **The Govt Accounts Receivable Dashboard:** Provides the EPC installer with a birds-eye view of all pending government grant parts grouped by milestone—instantly showing which projects have completed installation but are awaiting the government's 50% milestone release.

---

## Why SolarOS is the Ideal Platform

* **No Heavy Infrastructure Cost:** SolarOS runs entirely in the browser as a fast, light-weight React app, making it fully usable on low-bandwidth mobile networks in deep rural areas.
* **Optimized Mobile UX:** Tailored specifically for on-field technicians, with simple list-based designs, large touch-friendly buttons, and quick-loading offline capability for signature captures.
* **Unified Workspace:** No separate apps for CRM, procurement, and field workers. System admins, regional warehouse managers, and rural field teams all log into the same interface with customized role-based visibility.

*SolarOS turns complex government deployments into a highly coordinated, transparent, and paperless logistics engine.*
