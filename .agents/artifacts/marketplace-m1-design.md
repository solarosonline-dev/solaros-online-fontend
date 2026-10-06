# Marketplace — M1 Design (Vendors, Catalog, Listings, Inventory, Markets)

Status: plan only, nothing implemented. Grounded in a read-only survey of `../solaros-online-backend` (FastAPI 0.115, SQLAlchemy 2 sync, psycopg3, Alembic) and this repo's conventions.

## 0. Decisions carried over
- Fulfilment: DIRECT_PICKUP and HUB_CROSSDOCK both selectable (config, AUTO strategy later).
- Price: indicative ceiling at order, final after pooling, savings shared. Buyers prepay.
- Delivery: 3PL + individual drivers, fixed rate cards, no auction.
- Scale: all-India, ~5k vendors, ~1k orders/day. Launch gated by market/pincode/state; cross-state via lanes.
- Backend in scope.

## 1. Backend findings that shape the design
| Finding | Design consequence |
|---|---|
| `entities.type` is a free-text customer segment (e.g. `RESIDENTIAL`), NOT an entity kind (corrected during slice 1) | Added a separate `entities.kind` column (`EPC` default / `VENDOR` / `LOGISTICS`, enum `EntityKind`). `type` is untouched. |
| `EntityFeature` has only CRM, DESIGN; `features` is `ARRAY(String)`; enums are plain strings (no migration to add) | Add `MARKETPLACE_BUY`, `MARKETPLACE_SELL`, `DELIVERY`. Gate routers with `require_feature` in `router.py`. |
| Registration (`POST /entities/register`) defaults features to `[CRM]`; admin `PUT .../features` rejects empty set | Register accepts `type`; vendor/logistics sign-up sets default features by type, still PENDING_APPROVAL until a system admin approves. |
| All entity routes are `/entities/{entity_id}/...` with `require_entity_scope`; no cross-tenant pattern | Buyer-browsing-vendor data needs new "authenticated, any entity with MARKETPLACE_BUY" dependencies and DTOs that never expose vendor identity. |
| Existing `Vendor`, `Warehouse`, `InventoryItem`, `ProcurementOrder`, `Payment` are tenant-private, `Float`-based, mutable qty | Do NOT reuse. Marketplace tables get an `mp_` prefix, `Numeric`, ledger-based inventory. Later optional bridge: marketplace order -> tenant procurement record. |
| No background jobs, no Redis, Lightsail nano, uvicorn with 2 workers | Pool-closing/assignment timers needed from M3. Plan a single `worker` process (DB-backed jobs, `SELECT ... FOR UPDATE SKIP LOCKED`), no Redis at launch. Decide before M3. |
| No PostGIS, no pincode data; lat/lng are plain Float; `routing_engine.haversine_distance` exists | Do not require PostGIS. Pincode master with centroid lat/lng + geohash/H3 cell columns; bounding-box prefilter + haversine. Revisit PostGIS if managed DB allows. |
| No payment gateway; Payment model is manual and Float | Gateway + wallet ledger is M2 new work (integration under `app/integrations/<gateway>/client.py`). |
| Pagination `page`/`page_size` with `(items,total)` repos; errors via `ApiError`; bodies via `body: dict = Body(...)` + `model_validate` | Follow exactly. Copy `leads.py`/`teams.py`/`amc_plans.py` style, not the looser procurement/payments files. |
| Audit via `record_audit_event` with `EntityType` enum | Add MARKET, LISTING, MP_ORDER, PO, SHIPMENT etc. members. |
| Work order assignment code is hard-wired to WorkOrder | Template only; delivery assignment gets its own tables (M4). |

## 2. Identity and roles
- Vendor org = Entity(kind=VENDOR, features=[MARKETPLACE_SELL]). Staff use existing ENTITY_SUPER_ADMIN / ENTITY_ADMIN / WORKER roles.
- Logistics org = Entity(kind=LOGISTICS, features=[DELIVERY]). Add role `DRIVER` (ENTITY scope, rank 10) in `RoleName` + `seed.py` for 3PL drivers; individual driver = a LOGISTICS entity with one DRIVER user.
- EPC buyer = existing entity + feature `MARKETPLACE_BUY`.
- KYC fields on entity (or `entity_kyc` table): PAN, GSTIN (exists as `gstno`), bank/UPI, docs via S3 pattern from work-order documents. System-admin approval reuses `PATCH /admin/entities/{id}/state`, with a KYC-verified flag as an extra gate.

## 3. M1 data model (all `mp_` prefixed, Alembic migrations, `TimestampMixin`, int PKs)
**Geography / markets**
- `mp_pincode(pincode PK, state, district, city, lat, lng, geo_cell)` — seeded from India Post data.
- `mp_market(market_id, code, name, status DRAFT|PILOT|LIVE|PAUSED, launch_at)`.
- `mp_market_coverage(market_id, kind STATE|DISTRICT|PINCODE, value)` — most-specific wins.
- `mp_market_participant(market_id, entity_id, role BUYER|VENDOR|LOGISTICS, status)`.
- `mp_lane(origin_market_id, dest_market_id, status, config_json)` — schema in M1, enforcement M2/M3.
- `mp_waitlist(pincode, email/phone, entity_id null, created_at)`.

**Catalog**
- `mp_category(category_id, parent_id, name, attribute_schema JSONB, handling_class)`.
- `mp_product(product_id, category_id, brand, model, name, attributes JSONB, hsn_code, gst_rate Numeric(5,2), weight_kg, volume_cc, equivalence_group null, status DRAFT|ACTIVE|RETIRED, proposed_by_entity_id null)`.
- Attributes validated against category JSON Schema in the service layer.

**Listings and inventory**
- `mp_vendor_listing(listing_id, vendor_entity_id, product_id, vendor_sku, base_price Numeric(12,2), moq, pack_size, lead_time_days, dispatch_pincode, status, unique(vendor_entity_id, product_id, vendor_sku) partial on active)`.
- `mp_price_tier(listing_id, min_qty, unit_price)`.
- `mp_stock_movement(movement_id, listing_id, type RECEIPT|ADJUST|RESERVE|RELEASE|DISPATCH|RETURN, qty Numeric(14,3), ref_type, ref_id, actor_user_id, created_at)` — append-only.
- `mp_stock_level(listing_id PK, on_hand, reserved)` updated in the same transaction as movements under row lock; `available = on_hand - reserved`.

**Config engine (needed by M1 only for vendor/market settings; full use in M2+)**
- `mp_config_rule(rule_id, key, scope_type GLOBAL|MARKET|LANE|CATEGORY|VENDOR|ENTITY, scope_id, value JSONB, effective_from, effective_to, priority)`.
- Resolver service `resolve_config(key, context)`: most specific scope, then latest effective, cached per request.

## 4. M1 endpoints (sketch)
Vendor (`/entities/{entity_id}/mp/...`, `require_entity_admin_scope` + `MARKETPLACE_SELL`)
- `GET/POST /mp/listings`, `GET/PATCH /mp/listings/{id}`, activate/deactivate (409 ALREADY_ACTIVE/INACTIVE).
- `PUT /mp/listings/{id}/tiers`.
- `POST /mp/listings/{id}/stock` (receipt/adjust), `GET .../stock/movements` (paginated).
- `POST /mp/listings/bulk` (CSV upload, returns per-row validation report), `GET /mp/listings/template`.
- `POST /mp/products/propose`.
- `GET /mp/categories`, `GET /mp/products` (search: trigram/FTS).

System admin (`/admin/mp/...`, `require_system_scope`)
- Categories CRUD with attribute schema; products CRUD + proposal approval queue.
- Markets CRUD, coverage, status transitions with readiness checklist, participants, lanes, waitlist views.
- Vendor KYC queue/verification; config rule CRUD with audit.
- Pincode import.

Public/buyer read (M2, specced now): `GET /mp/catalog` filtered by eligibility service (lane + market), vendor identity masked.

Eligibility service: single module `mp_eligibility` used by every gate; unit-tested heavily.

## 5. Frontend M1 (this repo)
- `src/api/marketplaceCatalog.ts`, `vendorListings.ts`, `marketplaceAdmin.ts` (decimals as strings).
- `roles.ts`: add `isVendor`, `hasFeature` cases for new modules; `HomeRedirect` lands vendors at `/app/vendor/listings`.
- `App.tsx` route trees: `/app/vendor/*` (RequireFeature MARKETPLACE_SELL), `/app/admin/marketplace/*` (RequireSystemAdmin). Sidebar links in `AppLayout.tsx` mirrored.
- Pages: `src/pages/vendor/` — ListingsPage, ListingForm (dynamic attribute fields rendered from category schema), StockPanel (movement ledger + add stock), BulkUploadPage, Products proposal. `src/pages/admin/marketplace/` — CategoriesPage, ProductsPage (+approval queue), MarketsPage (coverage picker, readiness checklist), VendorKycPage.
- Register page: entity-type selector (EPC / Vendor / Logistics).
- Follow existing patterns: co-located CSS, shared `Pagination`, add-one-line list editor for string arrays, locked-state disabling, hover rules on button classes.

## 6. Implementation order (M1 slices)
1. Migration + enums: EntityKind, features, DRIVER role, audit EntityType members; backfill `type`.
2. Markets/pincode tables + import script + admin market APIs + eligibility service.
3. Category/product catalog + attribute-schema validation + admin UI.
4. Vendor registration/KYC/approval changes + vendor shell UI.
5. Listings, tiers, stock ledger with locking + concurrency tests.
6. Bulk CSV upload + validation report.
7. Config rule engine + resolver (+ unit tests).
8. End-to-end verification against local backend + `npx tsc -b`; backend `make test`.

## 7. Risks / open items
- Prod DB capability (PostGIS, extensions like pg_trgm) unknown — confirm.
- Worker process/deployment on Lightsail nano needs a decision before M3 (single worker container vs. in-process scheduler with advisory lock).
- Slice 1 (done, uncommitted): `entities.kind` migration `b8d4f2a6c1e3` backfills every existing row to EPC via server default; no audit of `type` needed.
- Payment gateway/escrow choice and legal structure (M0) gate M2.
- Identity masking must be enforced by separate response schemas per audience (tested).
