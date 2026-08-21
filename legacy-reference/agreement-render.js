/* ============================================================
   SolarOS — customer agreement renderer
   Pure function: given an agreement payload, render it into a target node.
   Used by both the admin builder (live preview) AND the public viewer.
   Themed to match quote-render.js / quote-style.css (.quote-* classes).
============================================================ */

(function () {

  const fmtINR = (n) => {
    if (!isFinite(n) || n == null) return "₹0";
    const sign = n < 0 ? "-" : "";
    n = Math.round(Math.abs(n));
    const s = n.toString();
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    return sign + "₹" + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3);
  };

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // A blank slot for on-paper fill-in (e.g. a value the admin left empty)
  const orBlank = (v, n = 14) => {
    const s = String(v == null ? "" : v).trim();
    return s ? esc(s) : "_".repeat(n);
  };

  /**
   * Compute derived commercial numbers from the inputs.
   * Pure — no DOM.
   */
  function compute(input) {
    const kw = +input.capacityKw || 0;
    const watts = kw * 1000;
    const ppw = +input.pricePerWatt || 0;
    const gst = (+input.gstRate || 0) / 100;

    const baseCost = watts * ppw;
    const gstAmount = Math.round(baseCost * gst);
    const totalCost = baseCost + gstAmount;

    // PM Surya Ghar subsidy — varies by state, entered by admin.
    // Credited by government to the customer's bank; does not change what
    // is payable to SolarOS, so payment milestones stay on totalCost.
    const subsidy = Math.max(0, +input.subsidyAmount || 0);
    const netCost = Math.max(0, totalCost - subsidy);

    // Payment milestones: 30% advance, 60% structure & fitting, 10% net metering
    const round10 = (n) => Math.round(n / 10) * 10;
    const payAdvance = round10(totalCost * 0.30);
    const payStructure = round10(totalCost * 0.60);
    const payNetMeter = totalCost - payAdvance - payStructure;

    // AMC (annual) = per-kW rate × kW
    const amcBasic = Math.round((+input.amcBasicPerKw || 0) * kw);
    const amcPremium = Math.round((+input.amcPremiumPerKw || 0) * kw);

    return {
      kw, watts, baseCost, gstAmount, totalCost, subsidy, netCost,
      payAdvance, payStructure, payNetMeter,
      amcBasic, amcPremium,
    };
  }

  function equipmentRow(label, e) {
    e = e || {};
    return `
      <tr class="qrow">
        <td><strong>${esc(label)}</strong></td>
        <td>${orBlank(e.make, 18)}</td>
        <td>${orBlank(e.model, 16)}</td>
        <td class="ta-r">${orBlank(e.warranty, 10)}</td>
      </tr>`;
  }

  /**
   * Render the agreement into target.innerHTML.
   * Inputs: { id, customer:{...}, system:{...}, pricing:{...}, equipment:{...}, amc:{...}, meta:{...} }
   */
  function renderAgreement(a, target) {
    a = a || {};
    const customer = a.customer || {};
    const system = a.system || {};
    const pricing = a.pricing || {};
    const eq = a.equipment || {};
    const amc = a.amc || {};
    const meta = a.meta || {};

    const c = compute({
      capacityKw: system.capacityKw,
      pricePerWatt: pricing.pricePerWatt,
      gstRate: pricing.gstRate,
      subsidyAmount: pricing.subsidyAmount,
      amcBasicPerKw: amc.basicPerKw,
      amcPremiumPerKw: amc.premiumPerKw,
    });

    const issuedOn = meta.issuedOn ? new Date(meta.issuedOn) : new Date();
    const fmtDate = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const roofType = system.roofType || "RCC";

    const amcCell = (val) => c.kw > 0 && val > 0
      ? `${fmtINR(val)}<small> / year</small>`
      : `<small>₹______ / year</small>`;

    // EPC branding (if available)
    const epc = a.epc || {};
    const firmName = epc.firmName || "SolarOS";
    const firmAddress = epc.address ?
      `${epc.address.line1}${epc.address.line2 ? ', ' + epc.address.line2 : ''}, ${epc.address.city}, ${epc.address.state} ${epc.address.pincode}` : "";
    const firmContact = [epc.email, epc.mobile].filter(Boolean).join(" · ");
    const primaryColor = epc.branding?.primaryColor || "#ff6b1a";

    // Font customization from EPC settings
    const fontFamily = epc.branding?.fontFamily || "Inter";
    const fontSize = epc.branding?.fontSize || {};
    const fontSizeH1 = fontSize.h1 || 28;
    const fontSizeH2 = fontSize.h2 || 22;
    const fontSizeH3 = fontSize.h3 || 18;
    const fontSizeBody = fontSize.body || 14;
    const fontSizeSmall = fontSize.small || 12;

    const html = `
<style>
  .quote-header__brand .quote-logo { color: ${primaryColor}; }
  .btn.primary { background: ${primaryColor}; }
  .quote { font-family: ${fontFamily}, sans-serif; font-size: ${fontSizeBody}px; }
  .quote-hero h1 { font-size: ${fontSizeH1}px; }
  .quote-section h2 { font-size: ${fontSizeH2}px; }
  .qamc h3 { font-size: ${fontSizeH3}px; }
  .quote-creds, .qamc-note, .qrow__note { font-size: ${fontSizeSmall}px; }
</style>

<!-- ============ HEADER ============ -->
<header class="quote-header">
  <div class="quote-header__brand">
    <div class="quote-logo">
      ${epc.branding?.logo ?
        `<img src="${esc(epc.branding.logo)}" alt="${esc(firmName)}" style="max-height: 60px; max-width: 200px;">` :
        `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="currentColor"/><g stroke="currentColor" stroke-width="6" stroke-linecap="round"><line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/><line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/><line x1="18" y1="18" x2="28" y2="28"/><line x1="72" y1="72" x2="82" y2="82"/><line x1="82" y1="18" x2="72" y2="28"/><line x1="28" y1="72" x2="18" y2="82"/></g></svg>
        <span>${esc(firmName)}</span>`}
    </div>
    <p class="quote-tagline">Solar Rooftop Installation Agreement</p>
    ${firmAddress ? `<p class="quote-creds">${esc(firmAddress)}</p>` : ""}
    ${firmContact ? `<p class="quote-creds">${esc(firmContact)}</p>` : ""}
    ${epc.gstin ? `<p class="quote-creds">GSTIN: ${esc(epc.gstin)}</p>` : ""}
  </div>
  <div class="quote-header__meta">
    <div><span class="qmeta-label">Agreement no.</span><strong>${esc(a.id || "DRAFT")}</strong></div>
    <div><span class="qmeta-label">Date</span><strong>${fmtDate(issuedOn)}</strong></div>
    <div><span class="qmeta-label">System</span><strong>${c.kw ? c.kw + " kWp" : "______ kWp"}</strong></div>
    ${meta.quoteRef ? `<div><span class="qmeta-label">Quote ref.</span><strong>${esc(meta.quoteRef)}</strong></div>` : ""}
  </div>
</header>

<!-- ============ PARTIES / HERO ============ -->
<section class="quote-hero">
  <div>
    <p class="quote-eyebrow">Between ${esc(firmName)} &amp; Customer</p>
    <h1>${orBlank(customer.name, 16)}<small>${customer.company ? " · " + esc(customer.company) : ""}</small></h1>
    <p class="quote-address">${orBlank(customer.address, 40)}</p>
    <p class="quote-address quote-address--muted">
      ${customer.mobile ? "📞 " + esc(customer.mobile) : "📞 __________"}
      ${customer.email ? " · " + esc(customer.email) : ""}
      ${customer.consumerNo ? " · Consumer No. " + esc(customer.consumerNo) : ""}
    </p>
  </div>
  <div class="quote-hero__pitch">
    <p>This agreement covers the supply, installation, testing and commissioning of a
    <strong>${c.kw ? c.kw + " kWp" : "______ kWp"}</strong> rooftop solar system on a
    <strong>${esc(roofType)}</strong> roof, at the price and terms set out below.</p>
  </div>
</section>

<!-- ============ SCOPE ============ -->
<section class="quote-section">
  <h2>1. What ${esc(firmName)} provides <small class="quote-h2-sub">— turnkey scope</small></h2>
  <ul class="quote-incl">
    <li><span class="qicon qicon--panel">☀</span><div><strong>Supply &amp; installation</strong><span>Solar panels, inverter, mounting structure, cabling, earthing &amp; safety components</span></div></li>
    <li><span class="qicon qicon--str">🛠</span><div><strong>Complete site work</strong><span>Site survey, installation, testing and commissioning</span></div></li>
    <li><span class="qicon qicon--dox">📋</span><div><strong>Single-window paperwork</strong><span>Net-metering application, DISCOM coordination, PM Surya Ghar subsidy filing (if eligible)</span></div></li>
    <li><span class="qicon qicon--shield">🛡</span><div><strong>Handover pack</strong><span>Manufacturer warranty cards (panels &amp; inverter), test reports and user manual</span></div></li>
  </ul>
</section>

<!-- ============ PRICE ============ -->
<section class="quote-section">
  <h2>2. Agreed price</h2>
  <table class="quote-table">
    <thead>
      <tr><th>Item</th><th>Calculation</th><th class="ta-r">Amount</th></tr>
    </thead>
    <tbody>
      <tr class="qrow">
        <td>System cost (ex-GST)</td>
        <td><small>${c.kw || "____"} kW × ${pricing.pricePerWatt ? "₹" + (+pricing.pricePerWatt).toFixed(2) : "₹____"}/W</small></td>
        <td class="qrow__amt">${c.baseCost ? fmtINR(c.baseCost) : "₹________"}</td>
      </tr>
      <tr class="qrow">
        <td>GST @ ${pricing.gstRate ? (+pricing.gstRate).toFixed(1) : "____"}%</td>
        <td><small>Solar PV generating system</small></td>
        <td class="qrow__amt">${c.gstAmount ? fmtINR(c.gstAmount) : "₹________"}</td>
      </tr>
      <tr class="qrow qrow--total">
        <td>Total system cost</td>
        <td><small>Inclusive of GST</small></td>
        <td class="qrow__amt">${c.totalCost ? fmtINR(c.totalCost) : "₹________"}</td>
      </tr>
      ${c.subsidy > 0 ? `
      <tr class="qrow qrow--accent">
        <td>Less: PM Surya Ghar subsidy</td>
        <td><small>Credited by government to customer's bank account</small></td>
        <td class="qrow__amt qrow__amt--green">– ${fmtINR(c.subsidy)}</td>
      </tr>
      <tr class="qrow">
        <td><strong>Net effective cost</strong></td>
        <td><small>After subsidy · subsidy varies by state</small></td>
        <td class="qrow__amt">${fmtINR(c.netCost)}</td>
      </tr>` : ""}
    </tbody>
  </table>
  ${c.subsidy > 0 ? `<p class="qpay-note">The <strong>${fmtINR(c.subsidy)}</strong> PM Surya Ghar subsidy is credited directly by the government to the customer's bank account after net-metering. Payment milestones below are calculated on the total system cost; the subsidy is not deducted from amounts payable to ${esc(firmName)}.</p>` : ""}
</section>

<!-- ============ EQUIPMENT ============ -->
<section class="quote-section">
  <h2>3. Equipment — make, model &amp; warranty</h2>
  <table class="quote-table">
    <thead>
      <tr><th>Component</th><th>Make</th><th>Model</th><th class="ta-r">Warranty</th></tr>
    </thead>
    <tbody>
      ${equipmentRow("Solar Panels", eq.panel)}
      ${equipmentRow("Inverter", eq.inverter)}
      ${equipmentRow("ACDB", eq.acdb)}
      ${equipmentRow("DCDB", eq.dcdb)}
    </tbody>
  </table>
  <p class="qpay-note">Warranty on all electrical components is <strong>as provided by the make and model</strong>, and warranty cards are handed over <strong>before installation</strong>. Beyond the stated warranty period, repair or replacement is at the <strong>customer's cost</strong>.</p>
</section>

<!-- ============ PAYMENT ============ -->
<section class="quote-section">
  <h2>4. Payment schedule</h2>
  <table class="quote-table quote-table--pay">
    <tbody>
      <tr><td><strong>30 %</strong> advance</td><td>On signing this agreement</td><td class="ta-r"><strong>${c.payAdvance ? fmtINR(c.payAdvance) : "₹______"}</strong></td></tr>
      <tr><td><strong>60 %</strong> structure &amp; fitting</td><td>After structure and panels are fitted</td><td class="ta-r"><strong>${c.payStructure ? fmtINR(c.payStructure) : "₹______"}</strong></td></tr>
      <tr><td><strong>10 %</strong> net metering</td><td>Within 3 days of net-metering completion</td><td class="ta-r"><strong>${c.payNetMeter ? fmtINR(c.payNetMeter) : "₹______"}</strong></td></tr>
      <tr class="qrow--total"><td>Total</td><td>NEFT / RTGS / Cheque to ${esc(firmName)}</td><td class="ta-r">${c.totalCost ? fmtINR(c.totalCost) : "₹________"}</td></tr>
    </tbody>
  </table>
</section>

<!-- ============ AMC ============ -->
<section class="quote-section quote-amc">
  <h2>5. Annual Maintenance Contract (AMC) <small class="quote-h2-sub">— choose one</small></h2>
  <div class="qamc-grid qamc-grid--pair">
    <article class="qamc">
      <div class="qamc-tag">Basic AMC</div>
      <h3>Basic</h3>
      <p class="qamc-price">${amcCell(c.amcBasic)}</p>
      <ul>
        <li>Quarterly inspection (4/yr)</li>
        <li>Electrical &amp; earthing checks</li>
        <li>Performance / generation report</li>
        <li>Priority service &amp; warranty-claim support</li>
      </ul>
    </article>
    <article class="qamc qamc--feature">
      <div class="qamc-tag">Premium AMC · recommended</div>
      <h3>Premium</h3>
      <p class="qamc-price">${amcCell(c.amcPremium)}</p>
      <ul>
        <li>Everything in Basic, plus:</li>
        <li>Quarterly panel cleaning (4/yr)</li>
        <li>One free service visit / year</li>
        <li>10% discount on spare parts</li>
      </ul>
    </article>
  </div>
  <p class="qamc-note"><strong>Installation workmanship is warranted for 12 months, valid only while an AMC is active.</strong> Without AMC, after 12 months ${esc(firmName)} is not responsible for warranty, service or system performance, and any visit is charged separately.</p>
</section>

<!-- ============ WARRANTY & LIABILITY ============ -->
<section class="quote-section quote-terms">
  <h2>6. Warranty &amp; liability <small class="quote-h2-sub">— please read carefully</small></h2>
  <ol>
    <li><strong>Equipment (panels, inverter, ACDB, DCDB):</strong> covered by the <strong>manufacturer</strong> as per make/model. Warranty cards are given to you <strong>before installation</strong>. Claims are made with the manufacturer. <strong>After the warranty period, repair/replacement is at the customer's cost.</strong></li>
    <li><strong>Installation (workmanship):</strong> ${esc(firmName)} covers workmanship for <strong>12 months — valid only if you take AMC.</strong></li>
    <li><strong>Without AMC:</strong> after 12 months ${esc(firmName)} is <strong>not responsible</strong> for warranty, service or system performance. Any visit will be charged separately.</li>
    <li><strong>Not covered:</strong> damage from natural disaster, lightning, fire, theft, negligence or unauthorised changes; actual bill savings &amp; generation (depend on sunlight, usage, tariff); DISCOM delays and government subsidy timelines/approval.</li>
    <li><strong>Jurisdiction:</strong> courts at ${epc.address?.city || "Delhi"} have jurisdiction. This agreement is the complete understanding; changes must be in writing, signed by both parties.</li>
  </ol>
</section>

${meta.notes ? `
<section class="quote-section quote-notes">
  <h2>Notes</h2>
  <p>${esc(meta.notes)}</p>
</section>` : ""}

${epc.documents?.customTerms ? `
<section class="quote-section quote-terms">
  <h2>Additional Terms & Conditions</h2>
  <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${esc(epc.documents.customTerms)}</div>
</section>
` : ""}

${epc.documents?.agreementNotes ? `
<section class="quote-section quote-notes">
  <h2>Additional Notes</h2>
  <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${esc(epc.documents.agreementNotes)}</div>
</section>
` : ""}

<!-- ============ SIGNATURES ============ -->
<footer class="quote-footer">
  <div>
    <strong>${esc(firmName)}</strong>
    ${firmAddress ? `<p>${esc(firmAddress)}</p>` : ""}
    ${firmContact ? `<p>${esc(firmContact)}</p>` : ""}
    ${epc.gstin ? `<p>GSTIN: ${esc(epc.gstin)}</p>` : ""}
    ${epc.cin ? `<p>CIN: ${esc(epc.cin)}</p>` : ""}
    ${epc.branding?.footerText ? `<p style="margin-top: 8px; font-style: italic;">${esc(epc.branding.footerText)}</p>` : ""}
    ${epc.firmName && epc.firmName !== "SolarOS" ? `<p style="margin-top: 12px; font-size: 12px; color: #999;">Powered by <strong style="color: #ff6b1a;">SolarOS</strong></p>` : ""}
    <div class="agr-sign">
      <p class="qsign-label">Authorised signatory</p>
      <div class="qsign-line"></div>
      <p>Name, Signature &amp; Date</p>
    </div>
  </div>
  <div class="quote-footer__sign">
    <p class="qsign-label">Customer acceptance</p>
    <p class="agr-ack">I confirm I have read and understood this agreement, including that <strong>without AMC, ${esc(firmName)} is not responsible after 12 months</strong>.</p>
    ${signatureBlock(a.signature)}
  </div>
</footer>
`;
    target.innerHTML = html;
  }

  // Renders the customer signature area — signed state (electronic record)
  // or a blank fill-in line if not yet signed.
  function signatureBlock(sig) {
    if (sig && sig.signedAt && sig.image) {
      const when = new Date(sig.signedAt);
      const stamp = when.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      // basic guard so only image data URLs render
      const safeImg = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(sig.image) ? sig.image : "";
      const amcLabel = { basic: "Basic AMC", premium: "Premium AMC", none: "No AMC" }[sig.amcChoice] || "No AMC";
      return `
    <div class="agr-signed">
      ${safeImg ? `<img class="agr-signed__img" src="${safeImg}" alt="Customer signature" />` : ""}
      <p class="agr-signed__name">${esc(sig.signerName || "")}</p>
      <p class="agr-signed__meta">Signed electronically on ${esc(stamp)}${sig.ip ? " · IP " + esc(sig.ip) : ""}${sig.country ? " · " + esc(sig.country) : ""}</p>
      <p class="agr-signed__amc">AMC plan chosen: <strong>${esc(amcLabel)}</strong></p>
      <p class="agr-signed__consent">✔ Consent recorded — the customer accepted the terms above.</p>
    </div>`;
    }
    return `
    <div class="qsign-line"></div>
    <p>Name, Signature &amp; Date</p>`;
  }

  // expose
  window.renderAgreement = renderAgreement;
  window.computeAgreement = compute;

})();
