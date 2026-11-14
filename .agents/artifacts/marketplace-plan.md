# SolarOS Marketplace: Build Plan

## Confirmed by product owner
- Payments: SolarOS collects and pays sellers, and the seller is hidden from the buyer (see 6a).
  - Buyers: **everyone**, consumers and businesses. Buyer account has `type(INDIVIDUAL|BUSINESS)` with an optional GSTIN for B2B invoices. Tiered pricing and MOQ are likely needed later.
  - Listings go live **immediately**. Admin can take them down, and the optional per-seller `requires_review` flag stays.
  - Sellers are **registered Entities only**. There is no individual seller signup.

## 0. Key decisions and assumptions (confirm before building)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Who is a "seller"? | An existing **Entity**, with a new product module `MARKETPLACE` next to `CRM` and `DESIGN`. This reuses entity approval, users, roles, branding and the `hasFeature` / `RequireFeature` gating. Sellers who are not installers get an entity with only `MARKETPLACE` on. |
| 2 | Who is a buyer? | A separate lightweight `buyer` account with phone-OTP login. Guests can browse. Login is needed at checkout. Buyers are not entity users. |
| 3 | Scope of v1 | Catalog, seller listing, bulk upload and pincode-wise browse come first. Cart, orders and payments are a separate phase. A **enquiry / "request quote"** button can bridge the gap. |
| 4 | Does a listing need moderation? | Brand and category are admin-controlled. Individual listings go live immediately by default, and admin can take them down. A per-seller `requires_review` flag can force pre-approval. |
| 5 | Regionality | Sellers declare the **pincodes they serve**. A buyer sets a pincode and sees only products from sellers who serve it. |
| 6 | Pricing | One price per product, with MRP, GST rate and HSN. Stored as Decimal and serialized as a string, as elsewhere in the repo. |

## 1. Entity model (Postgres)

### Catalog (admin-owned)
- **category**: `id, parent_id, name, slug, path` (materialized, e.g. `/1/4/9/`), `depth, is_leaf, sort_order, status(ACTIVE|INACTIVE), icon_key`.
  - Adjacency list plus materialized path. Max depth is 5, enforced in code.
  - Products attach to **leaf** categories only.
  - Reparenting is blocked once products exist beneath a node.
  - **category_attribute** (the spec schema): `id, category_id, key, label, data_type(TEXT|NUMBER|ENUM|BOOL), unit, enum_options jsonb, is_required, is_filterable, sort_order`.
    - **Inherited down the tree.** The effective spec form for a leaf is the union of its ancestors' attributes and its own.
    - This single definition drives three things: the listing form, the CSV template columns and the buyer filters.
  - **brand**: `id, name, slug, logo_key, status`.
  - **brand_category**: `(brand_id, category_id)`. Defines which brands may be listed under which category. Approving a brand for a category inserts a row. An approval on a parent category covers descendants (resolved through `path`).

### Seller side
- **catalog_request**: `id, seller_entity_id, requested_by_user_id, type(BRAND|CATEGORY|BRAND_CATEGORY), payload jsonb, status(PENDING|APPROVED|REJECTED), review_note, reviewed_by, reviewed_at, resulting_brand_id, resulting_category_id`.
  - Payload holds the brand name, website and proof URL, or the proposed parent category and name.
  - Approval can create the brand or category and `brand_category` rows in one transaction.
  - **seller_service_area**: `(seller_entity_id, pincode, delivery_days, shipping_fee nullable)`.
  - **pincode** (master data): `pincode, district, state, lat, lng`. Seeded from the India Post dataset.
    - Optional later: a 3-digit prefix shorthand such as "serve all 3020xx".
  - **product**: `id, seller_entity_id, category_id, brand_id, sku, title, description, spec jsonb, price, mrp, gst_rate, hsn_code, unit, status(ACTIVE|INACTIVE|TAKEN_DOWN), created_at, updated_at`.
    - Unique on `(seller_entity_id, sku)`.
    - The `spec` keys are `category_attribute.key`. Validate them on write against the effective attributes.
    - GIN index on `spec`. Index on `(category_id, status)`.
    - FK validation: a `brand_category` row must exist for (brand, category or an ancestor).
  - **product_image**: `id, product_id, storage_key, position(1..3), size_bytes, content_type`. Max 3 per product.
  - **inventory**: `product_id (PK), quantity, low_stock_threshold, updated_at`.
    - v1 is one stock number per product.
    - Later it becomes `(product_id, warehouse_id)` with pincode mapping.
  - **bulk_job**: `id, seller_entity_id, category_id, kind(UPDATE), file_key, status(VALIDATING|READY|APPLIED|FAILED), total_rows, ok_rows, error_rows, error_report_key, created_at`.

### Buyer and commerce (phase 6, listed for completeness)
`buyer, buyer_address, cart_item, order` (one per seller, split at checkout), `order_item` (snapshotted price, spec, title), `payment`, `commission_rule`, `payout`.

## 2. Rules for images, specs and CSV

### Images (max 3, each under 300 KB)
- **Client:** the `<input type=file>` pre-checks size and type and offers an optional canvas re-compress. This is the same pre-check pattern as `WorkOrderDocuments`. The user sees the error before any network call.
  - **Server (the real enforcement):** reject if over 300 KB, if the MIME type is not JPEG, PNG or WEBP (sniff magic bytes, not just the header), or if the product already has 3.
  - Stored in object storage. List responses return presigned view URLs resolved server-side.
  - Use the **staged and batch-save** pattern from `LeadSiteImages`: local previews, reorder, one save call.

### Spec capture
The listing form is generated from `GET /categories/{id}/attributes?effective=true`. The backend validates types, enums and required fields again.

### Bulk CSV (update-only)
- **Template:** `GET /seller/categories/{id}/bulk-template.csv?prefill=true`.
  - Fixed columns: `product_id, sku, title, brand, price, mrp, gst_rate, stock_qty, status`.
  - Dynamic columns: one per effective attribute, as `spec.<key>`.
  - `prefill=true` fills in the seller's existing products in that category, so they only edit values. `prefill=false` gives an empty template with a header and example row.
  - Read-only columns (`product_id`, `brand`, category) are marked in a header comment, and any changes to them are ignored or rejected.
  - **Upload flow:**
    1. `POST /seller/bulk-jobs` (multipart) creates the job and validates asynchronously.
    2. The seller reviews the dry-run: counts, row-level errors and a downloadable error CSV.
    3. `POST /seller/bulk-jobs/{id}/apply` commits. It is all-or-nothing per job, or valid rows only if the seller picks "skip bad rows".
  - Limits: 5,000 rows and 5 MB per file. Rows are matched by `product_id`, falling back to `sku`. Unknown rows are errors. Creating new products via CSV is a later option.
  - Images are not part of the CSV.

## 3. API surface (`/api/v1`, error shape as today)

**Admin (system admin)**
- `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/{id}`, `POST /admin/categories/{id}/move`
  - `GET/POST/PATCH/DELETE /admin/categories/{id}/attributes`
  - `GET/POST/PATCH /admin/brands`, `PUT /admin/brands/{id}/categories`
  - `GET /admin/catalog-requests?status=`, `POST .../{id}/approve` (optional edits), `POST .../{id}/reject`
  - `POST /admin/products/{id}/take-down`, `PUT /admin/entities/{id}/features` (add `MARKETPLACE`)
  - `POST /admin/pincodes/import`

**Seller (`MARKETPLACE` feature, entity admin)**
- `GET /marketplace/categories/tree`, `GET /marketplace/categories/{id}/attributes?effective=true`, `GET /marketplace/brands?category_id=`
  - `POST/GET /entities/{eid}/catalog-requests`
  - `GET/PUT /entities/{eid}/service-areas`
  - `POST /entities/{eid}/products`, `GET` (list, paginated, `page/page_size/total`), `GET/PATCH/DELETE /entities/{eid}/products/{id}`
  - `POST /entities/{eid}/products/{id}/images/batch` (new files and the final order, one call)
  - `PATCH /entities/{eid}/products/{id}/inventory`
  - `GET /entities/{eid}/categories/{id}/bulk-template.csv`, `POST/GET /entities/{eid}/bulk-jobs`, `GET .../{id}`, `POST .../{id}/apply`, `GET .../{id}/errors.csv`

**Buyer (public, no auth for browsing)**
- `GET /shop/pincodes/{pin}` (validate and resolve city)
  - `GET /shop/categories/tree`
  - `GET /shop/products?pincode=&category_id=&brand_id=&q=&min_price=&max_price=&spec.<key>=&sort=&page=`. Category filtering includes descendants through `path`. Returns facets for the filterable attributes.
  - `GET /shop/products/{id}?pincode=` returns the detail, the seller card and delivery estimate (or "not serviceable at this pincode").
  - Phase 6: `/shop/cart`, `/shop/checkout`, `/shop/orders`, a payment webhook (Razorpay, with Route for seller splits), and `/entities/{eid}/orders` for sellers.

**Region filter query:** `product JOIN seller_service_area ON seller_entity_id AND pincode = :pin WHERE product.status='ACTIVE' AND inventory.quantity > 0 AND category.path LIKE ...`. Use Postgres full-text search for `q`. Move to Meilisearch or OpenSearch only when needed. Keep the query behind one service function so that swap is easy.

## 4. Frontend plan (this repo)

Follow the existing conventions: one `src/api/<domain>.ts` per domain, co-located CSS, `AccordionSection` for long forms, `Pagination.tsx`, string-array style list editors, and route guards in `App.tsx`.

```
src/api/catalog.ts        categories, attributes, brands, catalog requests
src/api/marketplace.ts    seller products, images, inventory, bulk jobs, service areas
src/api/shop.ts           public browse/detail
src/pages/admin/catalog/  CategoryTreePage (tree editor + attribute editor), BrandsPage, CatalogRequestsPage
src/pages/marketplace/    SellerProductsPage, ListProductPage (hierarchy picker -> form), ProductImages (staged),
                          BulkUploadPage (download template -> upload -> dry-run -> apply), ServiceAreaPage, CatalogRequestPage
src/pages/shop/           ShopHomePage (pincode gate), ProductListPage (filters/facets), ProductDetailPage
src/components/           CategoryPicker (cascading selects/breadcrumb), SpecForm (renders from attribute defs)
```

- Routes:
  - `/app/admin/catalog/*` sits under `RequireSystemAdmin`.
  - `/app/marketplace/*` sits under `RequireEntityAdmin` plus `<RequireFeature feature="MARKETPLACE" />`.
  - `/shop/*` is public.
  - Gate the sidebar links the same way, and add `MARKETPLACE` to the `hasFeature` and Entities-page toggles.
  - The buyer pincode is stored in localStorage and passed on every shop call.
  - Draft-autosave (`drafts.ts`) can cover the list-product form. Add a new `draftKeys` variant, and gate it on dirtiness as the repo requires.
  - Mobile cards: copy the `*-table-action-cell` pattern for the products table.

## 5. Delivery phases

| Phase | Scope | Notes |
|---|---|---|
| M0 | Decisions above, pincode master data, object storage bucket, `MARKETPLACE` feature flag | |
| M1 | Admin catalog: category tree, attribute schema, brands, brand-category mapping | Foundation for everything else |
| M2 | Seller onboarding and catalog requests, plus the admin review queue | |
| M3 | List product: category picker, dynamic spec form, 3 images, price, service areas, product management | |
| M4 | Bulk: prefilled template, upload, dry-run, apply, error report | Reuses M1's attribute schema |
| M5 | Buyer browse: pincode gate, category and facet filters, search, detail page, enquiry button | First public launch point |
| M6 | Cart, checkout, payments, order split per seller, seller order screens | Largest risk: payments, GST invoices, returns |
| M7 | Warehouse-level stock, ratings, seller payouts, search engine upgrade | |

## 6a. Update: SolarOS collects payment, pays the seller, and hides the seller from the buyer

This **overrides** earlier parts of the plan: the "seller card" on product detail, the single `price` field, and the Razorpay Route note in M6.

### Legal and tax shape (needs a CA / lawyer before M6)
Hiding the seller means SolarOS must be the **seller of record**, a principal/reseller model. A facilitator marketplace must show the supplier on the invoice and disclose seller details under the E-Commerce Rules 2020, so that model can't hide the seller.
- Leg 1: seller to SolarOS. This is a B2B purchase with the seller's GSTIN invoice.
  - Leg 2: SolarOS to buyer. This is SolarOS's own sales invoice.
  - Consequences: SolarOS owns returns, refunds and warranty handling toward the buyer. It charges GST on the full sale value and manages brand-warranty claims itself.
  - Upside: the payments side is simpler. Money owed to sellers is ordinary vendor payables. SolarOS is not holding third-party funds, so the RBI payment-aggregator concern mostly goes away.

### Data model changes
- `product`: replace `price` with `seller_price` (the payout basis). Add `buyer_price`, computed from a rule or admin-overridden. The `mrp`, `gst_rate` and `hsn_code` fields stay.
  - **commission_rule** (new): `scope(GLOBAL|CATEGORY|BRAND|SELLER), scope_id, type(PERCENT|FLAT), value, priority`. This computes `buyer_price = seller_price + markup`. Recompute when the rule or price changes.
  - **order / order_item**: buyer-facing, SolarOS-branded. Buyer-facing tables never carry `seller_entity_id`.
  - **fulfillment_order** (new, internal): one per seller per order, with `seller_entity_id, order_id, status(NEW|ACCEPTED|PACKED|HANDED_OVER|DELIVERED|REJECTED), seller_price_total`.
  - **shipment** (new): AWB, carrier, label key, pickup address (seller), return address (SolarOS).
  - **return_request** (new): `RMA`, reason, status, inspection result, and whether the seller is charged back.
  - **seller_ledger_entry** (new): append-only `CREDIT|DEBIT|HOLD|RELEASE`, with `fulfillment_order_id`, `amount`, `reason`.
  - **payout** (new): batch settlement to the seller's bank account, with UTR and status. **seller_bank_account** is stored on the entity, encrypted, and verified by penny-drop.
  - **payment**: one gateway account (SolarOS merchant). Do not use Razorpay Route. All collections go to SolarOS, and sellers are paid by payout. Store the gateway order and payment IDs, and refunds.

### Anonymity rules (enforced in the API layer, not just the UI)
- Every `/shop/*` response uses explicit allow-list serializers with no seller fields: no id, name, address, logo or branding. Product ids are opaque.
  - Product detail says "Fulfilled by SolarOS". Ratings and reviews attach to the **product**, never to a seller.
  - **Blind shipping:** SolarOS generates the labels, with a SolarOS return address and SolarOS invoice. The seller never prints their own branding on packages sent to the buyer.
  - **Listing content scanning:** titles and descriptions are checked for phone numbers, emails, URLs and "WhatsApp"-style text, which are rejected or flagged. Strip image EXIF. Add watermark/logo checks to the admin moderation queue.
  - The seller sees ship-from details and the label. Whether they also see the buyer's name and address is an open question below.
  - The category filter, search and facets must not expose seller-derived facets.

### Revised API additions
- Buyer: `POST /shop/checkout` (creates order and gateway order), `POST /shop/payments/webhook`, `GET /shop/orders`, `POST /shop/orders/{id}/returns`.
  - Seller: `GET /entities/{eid}/fulfillments`, `POST .../{id}/accept|reject|pack`, `GET /entities/{eid}/ledger`, `GET /entities/{eid}/payouts`, `PUT /entities/{eid}/bank-account`.
  - Admin: `CRUD /admin/commission-rules`, `GET /admin/orders`, `POST /admin/returns/{id}/resolve`, `POST /admin/payouts/run` (batch, with approval step), `GET /admin/ledger`.

### Settlement
Seller payable is released after delivery plus a return window (suggest 7 days; the number is a business choice). Refunds and returns create a debit entry or cancel the hold. A payout run sums released credits per seller and pays them out. Pay out through RazorpayX or a bank file. Check TDS (s.194-O/194Q) and GST handling with the CA, since the right treatment depends on the model chosen above.

### Phase 6 is now three phases
- **6a** Cart, checkout, payment capture, refunds, order and invoice generation.
  - **6b** Fulfillment: seller accept/pack, label and pickup (logistics aggregator such as Shiprocket or Delhivery), tracking, delivery confirmation.
  - **6c** Ledger, returns/RMA, payout runs, seller statements.

## 6b. Final commercial policy (**overrides 6a where they conflict**)

### Pricing
- The seller sets `seller_price`. SolarOS adds a **markup % configured per category**.
  - `commission_rule` is simplified to `category_id, markup_percent, effective_from`. A category with no rule inherits the nearest ancestor's rule, and a root-level default is required.
  - `buyer_price = seller_price * (1 + markup%)`, rounded to 2 decimals. The markup used is **snapshotted** on `order_item` (`seller_price, markup_percent, buyer_price`), so later rule changes never alter past orders or payouts.
  - The seller UI shows only the seller price, and the buyer UI only the buyer price. Sellers never see the markup.
  - Changing a markup recomputes `buyer_price` through a background job, with an audit log of who changed what.

### No return, no refund
- **Removed:** `return_request` / RMA, the returns APIs, the return window and the post-delivery debit logic. Seller payout releases on delivery confirmation, or a fixed N days after dispatch if delivery is never disputed. Put N in config.
  - The product page, cart and checkout carry an explicit policy block: "No returns, no refunds. Loading photos and video are shared on WhatsApp before dispatch. Transit insurance is optional and costs extra."
  - A **mandatory consent checkbox** at checkout is stored on the order as `policy_accepted_at` and `policy_version`. Policy text is versioned in a `policy_document` table.
  - **Delivery only after 100% payment.** An order moves to `PAID` only after the payment webhook confirms the full amount. Only `PAID` creates a `fulfillment_order`. There is no COD and no partial payment or advance.
  - **Technical refunds still need to exist, internally only** (admin-only, no buyer-facing flow). They are required whenever goods are never delivered:
    - duplicate or failed-capture payments,
    - seller rejects or can't fulfil the order (`REJECTED`),
    - the pincode turns out unserviceable,
    - an admin cancel before dispatch.
    Add `payment.refund` records and an admin `POST /admin/orders/{id}/cancel-refund`. The policy wording should say "no refund after dispatch", not "never".

### Loading proof (photos and video shared on WhatsApp)
- **loading_proof** (new): `fulfillment_order_id, media_key, media_type(PHOTO|VIDEO), size_bytes, uploaded_at`. The seller must upload at least N photos and 1 video before the order can move to `HANDED_OVER`. Caps are config (for example 10 photos, 1 video of up to 50 MB).
  - On `HANDED_OVER`, a background job sends the media to the buyer's WhatsApp number through the WhatsApp Business API (approved templates plus media). Delivery status is stored on `whatsapp_message` (`order_id, template, status, provider_message_id`). Needs a registered Meta WhatsApp Business account, templates and buyer opt-in captured at checkout.
  - **Anonymity check on proof media:** an admin review or auto-flag is needed, because loading videos are likely to show stickers, logos or phone numbers. The default flow is admin quick-review before it is sent, or the send happens automatically and an admin can flag afterward. Pick one.
  - Buyer-facing `/shop/orders/{id}` shows the proof media gallery too.

### Transit insurance (optional, extra cost)
- At checkout, the buyer sees a shipping quote from the logistics provider API with an optional insurance line ("Insure this shipment: ₹X"). The insurance premium is quoted on the declared value (`buyer_price` total).
  - Store `order.insurance_selected, insurance_premium, insurance_provider_ref`. The premium is added to the 100% payment total, passed through to the logistics provider, and **excluded from seller payout and from markup**.
  - Shipping charge is also quoted per pincode and weight. It follows the same pass-through treatment. This needs the dimensions and weight fields on `product` (`weight_kg, length_cm, width_cm, height_cm`, required for listing). Add them to the list-product form and the CSV template.
  - Claim handling for insured transit damage is between the buyer, SolarOS and the logistics provider. It is an admin workflow, not a returns flow.

### Seller anonymity, breach and de-listing
- The seller agreement, accepted at onboarding and stored with version and timestamp, states: no stickers, logos, invoices, cards or contact info in or on packages or in listing/proof media. A violation is a **breach of trust that leads to de-listing**.
  - **seller_breach** (new): `seller_entity_id, order_id nullable, source(ADMIN_REVIEW|BUYER_REPORT|AUTO_SCAN), evidence_keys, status(REPORTED|CONFIRMED|DISMISSED), decided_by, decided_at`.
  - A confirmed breach sets `entity.marketplace_status = DELISTED`. Effects, all in one transaction:
    - the seller's products go `TAKEN_DOWN` and vanish from search and the shop,
    - no new orders are accepted,
    - in-flight orders go to an admin decision,
    - held payouts go to admin hold (policy decision: forfeit or release),
    - the `MARKETPLACE` module is locked for that entity.
  - Buyers can flag "seller branding seen" on a delivered order, which creates a `REPORTED` breach. Include that link in the post-delivery WhatsApp message.
  - Seller-side warning at every upload: listing images, spec text, proof media and the pack step carry the "no branding" notice with an acknowledgement checkbox.

### Revised phase 6
- **6a** Cart, shipping and insurance quote, consent, 100% payment, webhook, invoice, internal cancel-and-refund.
  - **6b** Fulfillment: seller accept/reject, packing, loading proof upload, label and pickup, `HANDED_OVER`, WhatsApp send, tracking, delivery confirmation.
  - **6c** Seller ledger, payout runs, breach management and de-listing.

### Legal flags (not blockers, but get legal advice before launch)
- The Consumer Protection (E-Commerce) Rules 2020 require an e-commerce entity to display its return/refund/exchange policy and grant remedies for defective, wrong or not-as-described goods. A blanket "no return, no refund" for **consumer** buyers is a real exposure. It is far safer for B2B. Consider limiting the no-return policy wording to cases of change of mind, plus a short, admin-handled window for transit damage (insurance), wrong item or shortage, proven by the loading proof.
  - Hiding the seller is compatible with this only because SolarOS is the seller of record (see 6a).
  - WhatsApp Business messaging requires explicit buyer opt-in and approved templates.

## 6c. Correction: branding checks are internal only (**overrides 6b breach sources**)

- **Buyers have no way to report seller branding.** Remove the "seller branding seen" link from the post-delivery WhatsApp message and any buyer-side flag, report endpoint, or UI. Nothing in `/shop/*` mentions sellers or breaches.
  - **SolarOS admin team checks offline, on a random basis.** Offline means physical inspection (for example at pickup or at a hub) or review of the packed goods, outside the app. The app only needs to support the audit record.
  - `seller_breach.source` becomes `ADMIN_AUDIT` only (drop `BUYER_REPORT`). Drop the auto-scan source unless content scanning of listings is wanted separately (listing text/image scans remain a listing-time check, not a breach source).
  - **seller_audit** (new, admin-only): `id, seller_entity_id, fulfillment_order_id nullable, audited_by, audited_at, result(PASS|FAIL), notes, evidence_keys`.
    - `POST /admin/audits` records the result, and `GET /admin/audits` lists them with filters.
    - A `FAIL` can open a `seller_breach` for the decision step. The existing confirmed-breach de-listing flow then applies unchanged.
  - **Random selection:** `GET /admin/audits/suggestions?count=N` returns a random sample of recent `HANDED_OVER` fulfillments, weighted toward sellers with no recent audit or past failures. An admin works through the list offline and records results.
  - The admin pages are a Breach/Audit queue plus a Seller detail page showing audit history and delisting. These are in `/app/admin/*`, with no buyer or seller exposure, apart from the seller seeing a de-listed status.
  - Proof media (loading photos and video) is still shown to the buyer, so the earlier open question about checking it before sending remains.

## 6d. Order flow: request, admin confirmation, offline bank payment (**replaces the gateway checkout in 6a/6b**)

### What is removed
No payment gateway, no card/UPI/netbanking capture on the platform, no webhook, no Razorpay/Route/RazorpayX dependency for collection. Phase 6a's "checkout and payment capture" is replaced by the flow below.

### Order state machine (`order.status`)
```
DRAFT (cart)
  -> SUBMITTED          buyer sends order request; consent + WhatsApp opt-in stored
  -> UNDER_REVIEW       admin picks it up
  -> CONFIRMED          admin verified availability + price; quote locked; payment link issued
  -> PAYMENT_SUBMITTED  buyer enters UTR (+ optional proof upload)
  -> PAID               admin verifies the full amount credited in the bank
  -> in fulfillment     (fulfillment_order created; see 6b/6c)
Side exits: REJECTED (admin: unavailable/price changed), EXPIRED (payment window lapsed), CANCELLED (buyer before CONFIRMED, or admin)
```
- Only `PAID` creates the `fulfillment_order`s and notifies sellers. Delivery happens only after **100%** receipt. Short payments stay in `CONFIRMED` / `PAYMENT_SUBMITTED` with `amount_received` recorded and the balance due shown.
  - **Price rule:** the buyer sees `buyer_price` (seller price + category markup) while browsing. On review, the admin checks that the seller's current price and stock still match. If so, the order is `CONFIRMED` at that price, which is **locked** on the order items. If not, the admin either `REJECTS` it with a reason or sends a **revised quote** that the buyer accepts or declines (`quote_revision`); this is an assumption, so confirm whether you want revised quotes or reject-only.
  - **Availability check:** an admin can open an internal `availability_check` with the seller (`fulfillment_order` in `PENDING_CONFIRMATION`: seller taps Available / Not available / New price). This is invisible to the buyer. Stock is not reserved at cart time.

### Data model additions and changes
- **order**: add `submitted_at, reviewed_by, confirmed_at, payment_due_at, payment_reference` (unique, e.g. `SOS-ORD-0826-XXXX`, which the buyer must put in the NEFT/RTGS remarks), `shipping_amount, insurance_selected, insurance_premium, grand_total, amount_received, rejection_reason, policy_version, policy_accepted_at`.
  - **order_status_history**: append-only `(order_id, from, to, actor, note, at)`.
  - **bank_payment** (replaces gateway `payment`): `order_id, utr, amount, paid_on, proof_key nullable, entered_by(BUYER|ADMIN), verified_by, verified_at, status(SUBMITTED|VERIFIED|REJECTED)`. One order can have several rows for short payments or corrections. UTR is unique.
  - **company_bank_account** (config): SolarOS's collection account details, IFSC and instructions. The payment link page shows these.
  - **proforma / tax_invoice**: a proforma invoice is generated at `CONFIRMED`, and the tax invoice at `PAID`.
  - Shipping charge and insurance are fixed by the admin in the confirmation step, using the logistics provider's quote. The buyer chooses insurance (yes/no) on the payment page **before paying**, and the total updates. The insurance choice locks when the buyer submits the UTR.
  - Remove: gateway fields on `payment`, `payment.refund` records via gateway. Refunds (cancel or unfulfillable after payment) are **manual bank transfers by admin**, recorded as `refund_record(order_id, amount, utr, reason, by)`.

### The "payment link"
A tokenized, expiring page on the public site, `/pay/{token}`, that does not require buyer login. It shows the order summary, the grand total, insurance choice, SolarOS bank details, the payment reference to quote, supported modes (**NEFT / RTGS only**, with RTGS suggested for amounts of ₹2 lakh and above because RTGS has that minimum), and a form for the UTR and optional proof screenshot. The admin sends the link by WhatsApp or email from the order screen. Tokens are single-order, expire at `payment_due_at`, and are never guessable.

### Reconciliation
v1 is manual: the finance admin checks the bank statement, matches UTR and reference, and marks `VERIFIED`, which moves the order to `PAID` once verified total >= `grand_total`. A CSV import of the bank statement (match on reference text and UTR, with suggested matches) is a good phase 2 add-on. A dedicated virtual account per order (via a bank or gateway) would automate this and still be NEFT/RTGS-only, but it reintroduces a third-party payment product, so it is left out of v1 on purpose.

### API changes
- Buyer: `POST /shop/cart` (items), `POST /shop/orders` (submit the request with consent), `GET /shop/orders`, `GET /shop/orders/{id}`, `POST /shop/orders/{id}/cancel` (only before `CONFIRMED`), `POST /shop/orders/{id}/quote/accept|decline`.
  - Public: `GET /pay/{token}`, `POST /pay/{token}/insurance`, `POST /pay/{token}/payment` (UTR + proof upload).
  - Admin: `GET /admin/orders?status=`, `POST /admin/orders/{id}/start-review`, `.../availability-check`, `.../confirm` (set shipping and insurance quote and payment window), `.../reject`, `.../revise-quote`, `.../resend-link`, `POST /admin/bank-payments/{id}/verify|reject`, `POST /admin/orders/{id}/cancel`, `POST /admin/orders/{id}/refund`.
  - Removed: `POST /shop/checkout`, `POST /shop/payments/webhook`.

### Frontend
- Buyer: cart page, "Send order request" with the policy and consent block, an Orders list with a status tracker, and the public `/pay/:token` page.
  - Admin: an **Order desk** under `/app/admin/orders`, with a queue by status, a detail view that shows each line's seller price, markup and current stock side by side, a confirm/reject/revise form, a bank-payment verification panel and a refund form.
  - Seller: order screens appear only from `PAID` (and for availability checks). The seller never sees buyer prices or markup.

### Phase 6 now
- **6a** Cart, order request, consent, admin Order desk (review, confirm, reject, quote revision), payment link page, manual bank verification, invoices, manual refund record.
  - **6b** Fulfillment: seller accept/reject, loading proof, label and pickup, WhatsApp proof send, tracking, delivery confirmation.
  - **6c** Seller ledger and payouts, audits, breach and de-listing.

### Caveats
- Moving payment off the platform removes the RBI payment-aggregator and gateway concerns. It does **not** remove the Consumer Protection (E-Commerce) Rules 2020 (policy disclosure, grievance officer, consumer remedies), which apply to the business operating the e-commerce platform whatever the payment mode. Treat this as a risk to verify with a lawyer, not as resolved.
  - Manual confirmation does not scale past a certain order volume. The admin order desk is the bottleneck, so keep review fast (SLA targets, assignment, status filters) and plan the bank-statement import early.
  - Payment terms and exact NEFT/RTGS timing (RTGS has operating hours; NEFT is 24x7 now) go on the payment page so buyers know what to expect.

## 6e. Seller (EPC) bank account capture and verification

### Provider choice
Do **not** use the Tata Power vendor-portal `verifyBankDetails` endpoint. It's a third-party internal, unauthenticated-for-us API with no contract. Use a licensed bank-account verification provider behind one adapter (`BankVerificationProvider`), so it can be swapped. Candidates to evaluate: Cashfree, Razorpay (penny-drop / "fund account validation"), Digio, Setu, Surepass, Signzy. Compare price per check, whether they verify by **penny-drop** (₹1 test credit, returns the registered holder name) or **penny-less** (IMPS name lookup), and failure rates. IFSC to bank/branch lookup can use Razorpay's open IFSC dataset (`ifsc.razorpay.com`) or the RBI list, cached, at no per-call cost.

### Data model
- **seller_bank_account**: `id, seller_entity_id, account_number_enc, account_last4, ifsc, bank_name, branch, holder_name_registered (from provider), holder_name_declared, name_match_score, status(PENDING|VERIFIED|FAILED|SUPERSEDED), verification_ref, verified_at, is_active`.
  - One active verified account per seller. Changing it creates a new row, and the old one becomes `SUPERSEDED`.
  - Account numbers are **encrypted at rest** (app-level encryption with a KMS key). Never logged, and never returned in full by any API: responses return `account_last4`, `ifsc`, `bank_name` and `status` only.
  - Entity business details (PAN, GSTIN, legal name) are already on the entity's Business Info tab. Check that the registered holder name matches the entity's legal name, with a fuzzy match, and send low-confidence matches to an admin.

### Flow
1. Seller enters account number (entered twice) and IFSC. The IFSC is looked up live, and the form shows bank and branch.
   2. `POST /entities/{eid}/bank-account` creates `PENDING` and calls the provider.
   3. The registered holder name comes back. A name match above the threshold sets `VERIFIED`. Otherwise `FAILED` or an admin review.
   4. **Payouts go only to the active `VERIFIED` account.** No account means payouts stay on hold, and the seller sees a banner.
   5. **Changing an account** needs re-verification, a notification to the entity admins, and a cooling-off period (suggest 48 hours) before payouts use it. This blocks account-takeover fraud. An admin can approve it earlier.

### APIs
- Seller: `GET /entities/{eid}/bank-account` (masked), `PUT /entities/{eid}/bank-account`, `GET /ifsc/{code}`.
  - Admin: `GET /admin/bank-accounts?status=`, `POST .../{id}/approve|reject`, with audit logging on every view or change.

### Frontend
A "Bank account" tab in Entity Settings, shown for entities with `MARKETPLACE` enabled. Fields are account number with confirm, IFSC with bank and branch preview, and a status chip. Never prefill or echo the full number after save. Use `PasswordInput`-style masking for the number field.

### Compliance
Account numbers and PAN are sensitive personal data under the DPDP Act. Keep the collection purpose limited to payouts, with restricted admin access and audit logs. Penny-drop sends real money, which is trivial in cost but needs the provider's wallet funded.

## 6. Risks and open questions
1. **Seller identity:** reuse Entity, or a separate seller account type? Reuse is far cheaper.
   2. **Payments model:** does SolarOS collect and settle (marketplace, commission, payouts, RBI/PA rules), or only connect buyers to sellers? This changes M6 completely.
   3. **B2B vs B2C:** GST invoicing, quantity-tier pricing and MOQ matter much more for B2B.
   4. **Attribute schema changes:** editing or removing an attribute after products exist needs a rule. Recommended: soft-deprecate, never hard-delete, and treat new required attributes as optional for existing products.
   5. **Spec-in-JSONB vs columns:** JSONB is flexible and indexed with GIN. Heavy numeric range filters may later need generated columns.
   6. **Abuse:** image content moderation, duplicate listings and fake brand claims. The admin take-down and brand-proof requirement cover the basics.
   7. **Backend repo:** this plan needs matching work in `../solaros-online-backend`, and its `openapi.json` stays the source of truth for field names once built.
