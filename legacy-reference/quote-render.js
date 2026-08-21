/* ============================================================
   SolarOS — quote renderer
   Pure function: given a quote payload, render it into a target node.
   Used by both the admin live-preview AND the public viewer.
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
  const fmtINRShort = (n) => {
    if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
    if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + " L";
    return fmtINR(n);
  };
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // Suggested PM Surya Ghar central financial assistance ladder (₹).
  // Used only as a default when no explicit amount is supplied — actual
  // subsidy varies by state, so the admin can override it in the builder.
  function subsidyForKw(kw, segment) {
    if (segment !== "residential") return 0;
    if (kw <= 1) return 30000;
    if (kw <= 2) return 60000;
    return 78000;
  }

  /**
   * Compute every derived number from the inputs.
   * Pure — no DOM, easy to unit-test or move server-side later.
   */
  function compute(input) {
    const kw = +input.capacityKw || 0;
    const ppw = +input.pricePerWatt || 0;
    const gst = (+input.gstRate || 0) / 100;
    const yieldPerKw = +input.dailyYield || 4.2;
    const tariff = +input.tariff || 9;

    const baseCost = kw * 1000 * ppw;            // ₹/W × Watts
    const gstAmount = Math.round(baseCost * gst);
    const totalCost = baseCost + gstAmount;
    // Explicit amount wins (state subsidy varies); fall back to the suggested ladder.
    const subsidy = input.applySubsidy
      ? (input.subsidyAmount != null && input.subsidyAmount !== ""
          ? Math.max(0, +input.subsidyAmount || 0)
          : subsidyForKw(kw, input.segment))
      : 0;
    const netInvestment = Math.max(totalCost - subsidy, 0);

    const dailyKwh = kw * yieldPerKw;
    const monthlyKwh = Math.round(dailyKwh * 30);
    const yearlyKwh = Math.round(dailyKwh * 365);
    const monthlySaving = Math.round(monthlyKwh * tariff);
    const yearlySaving = monthlySaving * 12;
    const paybackYrs = yearlySaving > 0 ? netInvestment / yearlySaving : 0;

    // 25-yr lifetime savings with 4 % tariff escalation, conservative
    let lifetime = 0;
    let s = yearlySaving;
    for (let y = 1; y <= 25; y++) { lifetime += s; s *= 1.04; }
    const lifetimeNet = lifetime - netInvestment;

    const co2T = +(yearlyKwh * 0.82 / 1000).toFixed(1);
    const trees = Math.round(co2T * 50);

    // payment milestones (round to nearest ₹10)
    const round10 = (n) => Math.round(n / 10) * 10;
    const payAdvance = round10(totalCost * 0.30);
    const payDispatch = round10(totalCost * 0.60);
    const payCommission = totalCost - payAdvance - payDispatch;

    return {
      kw, baseCost, gstAmount, totalCost, subsidy, netInvestment,
      dailyKwh, monthlyKwh, yearlyKwh,
      monthlySaving, yearlySaving, paybackYrs, lifetimeNet,
      co2T, trees,
      payAdvance, payDispatch, payCommission,
    };
  }

  /**
   * Render the quote into target.innerHTML.
   * Inputs: { id, customer:{...}, system:{...}, pricing:{...}, amc:{...}, meta:{...}, epc:{..., language:...} }
   */
  function renderQuote(q, target) {
    const c = compute({
      capacityKw: q.system.capacityKw,
      pricePerWatt: q.pricing.pricePerWatt,
      gstRate: q.pricing.gstRate,
      dailyYield: q.system.dailyYield,
      tariff: q.pricing.tariff,
      applySubsidy: q.pricing.applySubsidy,
      subsidyAmount: q.pricing.subsidyAmount,
      segment: q.system.segment,
    });

    // Get language from EPC settings, default to English
    const lang = q.epc?.language || 'en';
    const t = (key, replacements) => window.translate ? window.translate(key, lang, replacements) : key;

    const issuedOn = q.meta.issuedOn ? new Date(q.meta.issuedOn) : new Date();
    const validity = +(q.meta.validityDays || 15);
    const validTill = new Date(issuedOn.getTime() + validity * 86400000);
    const fmtDate = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const segLabel = ({
      residential: t('quote.residential'),
      commercial: t('quote.commercial'),
      industrial: t('quote.industrial'),
      farm: t('quote.farm')
    })[q.system.segment] || "Custom";
    const panelType = q.system.panelType || "DCR";
    const isDCR = panelType === "DCR";
    const isResidential = q.system.segment === "residential";

    const subsidyLine = c.subsidy > 0
      ? `<tr class="qrow qrow--accent">
           <td>${t('quote.lessSubsidy')}</td>
           <td><small>${t('quote.subsidyNote')}</small></td>
           <td class="qrow__amt qrow__amt--green">– ${fmtINR(c.subsidy)}</td>
         </tr>`
      : (isResidential && !isDCR
          ? `<tr class="qrow"><td colspan="3" class="qrow__note">Non-DCR panels: No PM Surya Ghar subsidy. Lower upfront cost compensates. Net-metering may require DCR — verify with your DISCOM.</td></tr>`
          : `<tr class="qrow"><td colspan="3" class="qrow__note">No central subsidy on ${esc(segLabel.toLowerCase())} segment. AD &amp; GST input credit available — consult your CA.</td></tr>`);

    // 5-year AMC (optional). Priced per kW / year × system kW.
    // amc.mode: "included" (free of cost, bundled) | "chargeable" (customer pays,
    // default) | "none" (not offered). Falls back to the legacy include5yr/perKw5yr
    // shape for quotes saved before this field existed.
    const amc = q.amc || {};
    const amc5Mode = amc.mode || (amc.include5yr === false ? "none" : "chargeable");
    const amc5Free = amc5Mode === "included";
    const amc5PerKw = +amc.perKw5yr || 0;
    const amc5Include = amc5Mode !== "none" && c.kw > 0 && (amc5Free || amc5PerKw > 0);
    const amc5Yearly = Math.round(amc5PerKw * c.kw);
    const amc5FiveYr = amc5Yearly * 5;
    const amc5Html = amc5Include ? `
<!-- ============ AMC SPOTLIGHT ============ -->
<section class="quote-section quote-amc">
  <h2>5-year AMC <small class="quote-h2-sub">— we stay on the roof with you, most installers vanish after commissioning.</small></h2>
  <div class="qamc-grid qamc-grid--single">
    <article class="qamc qamc--feature">
      <div class="qamc-tag">${amc5Free ? "Included · 5 years" : "Recommended · 5 years"}</div>
      <h3>Years 1–5</h3>
      ${amc5Free
        ? `<p class="qamc-price">Included<small> · free of cost</small></p>
      <p class="qamc-rate">Bundled with your system at no extra charge — worth ${fmtINR(amc5PerKw)}/kW/yr (${fmtINR(amc5FiveYr)} over 5 years).</p>`
        : `<p class="qamc-price">${fmtINR(amc5Yearly)}<small> / year</small></p>
      <p class="qamc-rate">${fmtINR(amc5PerKw)}/kW/yr × ${c.kw} kW · ${fmtINR(amc5FiveYr)} for 5 years</p>`}
      <ul>
        <li>Quarterly panel cleaning</li>
        <li>Annual inverter health check</li>
        <li>Earthing &amp; lightning audit</li>
        <li>WhatsApp savings report monthly</li>
        <li>48-hour service response SLA</li>
      </ul>
    </article>
  </div>
  <p class="qamc-note">${amc5Free
    ? `Comprehensive AMC — cleaning, monitoring and service — <strong>included free for the first 5 years</strong>. Keeps your system generating at peak and under our care from day one, at no extra cost to you.`
    : `Comprehensive AMC — cleaning, monitoring and service — at <strong>${fmtINR(amc5PerKw)} per kW per year</strong>. Keeps your system generating at peak and under our care from day one.`}</p>
</section>` : "";

    // EPC branding (if available)
    const epc = q.epc || {};
    const firmName = epc.firmName || "SolarOS";
    const firmAddress = epc.address ?
      `${epc.address.line1}${epc.address.line2 ? ', ' + epc.address.line2 : ''}, ${epc.address.city}, ${epc.address.state} ${epc.address.pincode}` : "";
    const firmContact = [epc.email, epc.mobile].filter(Boolean).join(" · ");
    const tagline = epc.branding?.companyTagline || t('quote.tagline');
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
    <p class="quote-tagline">${esc(tagline)}</p>
    ${firmAddress ? `<p class="quote-creds">${esc(firmAddress)}</p>` : ""}
    ${firmContact ? `<p class="quote-creds">${esc(firmContact)}</p>` : ""}
    ${epc.gstin ? `<p class="quote-creds">GSTIN: ${esc(epc.gstin)}</p>` : ""}
  </div>
  <div class="quote-header__meta">
    <div><span class="qmeta-label">${t('quote.quoteNo')}</span><strong>${esc(q.id || "DRAFT")}</strong></div>
    <div><span class="qmeta-label">${t('quote.issued')}</span><strong>${fmtDate(issuedOn)}</strong></div>
    <div><span class="qmeta-label">${t('quote.validTill')}</span><strong>${fmtDate(validTill)}</strong></div>
  </div>
</header>

<!-- ============ HERO ============ -->
<section class="quote-hero">
  <div>
    <p class="quote-eyebrow">${t('quote.personalizedProposal')} · ${esc(segLabel)}</p>
    <h1>${esc(q.customer.name || "Valued customer")}<small>${q.customer.company ? " · " + esc(q.customer.company) : ""}</small></h1>
    <p class="quote-address">${esc(q.customer.address || "")}</p>
    <p class="quote-address quote-address--muted">${esc(q.customer.discom || "")}${q.customer.mobile ? " · " + esc(q.customer.mobile) : ""}${q.customer.email ? " · " + esc(q.customer.email) : ""}</p>
  </div>
  <div class="quote-hero__pitch">
    <p>${pitchLine(q, c)}</p>
  </div>
</section>

<!-- ============ KEY METRICS ============ -->
<section class="quote-metrics">
  <div class="qmetric">
    <span>${t('quote.systemSize')}</span>
    <strong>${c.kw} kWp</strong>
    <em>${esc(q.system.panelMake || "ALMM Tier-1 panels")}${!isDCR ? ' (Non-DCR)' : ''}</em>
  </div>
  <div class="qmetric qmetric--gold">
    <span>${t('quote.monthlySavings')}</span>
    <strong>${fmtINR(c.monthlySaving)}</strong>
    <em>${t('common.at')} ${t('common.current')} ${esc(q.customer.discom || "DISCOM")} ${t('common.tariff')}</em>
  </div>
  <div class="qmetric">
    <span>${t('quote.generation')}</span>
    <strong>${c.monthlyKwh.toLocaleString("en-IN")} kWh${t('quote.perMonth')}</strong>
    <em>${c.yearlyKwh.toLocaleString("en-IN")} kWh ${t('quote.perYear')}</em>
  </div>
  <div class="qmetric qmetric--green">
    <span>${t('quote.payback')}</span>
    <strong>${c.paybackYrs.toFixed(1)} ${t('quote.years')}</strong>
    <em>${t('quote.thenFreePower')}</em>
  </div>
  <div class="qmetric">
    <span>${t('quote.co2Avoided')}</span>
    <strong>${c.co2T.toFixed(1)} t${t('quote.perYear')}</strong>
    <em>≈ ${c.trees.toLocaleString("en-IN")} ${t('quote.treesEquivalent')}</em>
  </div>
  <div class="qmetric">
    <span>${t('quote.lifetimeSavings')}</span>
    <strong>${fmtINRShort(c.lifetimeNet)}</strong>
    <em>after recovering investment</em>
  </div>
</section>

<!-- ============ COMMERCIAL ============ -->
<section class="quote-section">
  <h2>Commercial summary</h2>
  <table class="quote-table">
    <thead>
      <tr><th>Item</th><th>Calculation</th><th class="ta-r">Amount</th></tr>
    </thead>
    <tbody>
      <tr class="qrow">
        <td>System cost (ex-GST)</td>
        <td><small>${c.kw} kW × ₹${(+q.pricing.pricePerWatt).toFixed(2)}/W</small></td>
        <td class="qrow__amt">${fmtINR(c.baseCost)}</td>
      </tr>
      <tr class="qrow">
        <td>GST @ ${(+q.pricing.gstRate).toFixed(1)}%</td>
        <td><small>Solar PV generating system</small></td>
        <td class="qrow__amt">${fmtINR(c.gstAmount)}</td>
      </tr>
      <tr class="qrow qrow--strong">
        <td>Total project cost</td>
        <td><small>Inclusive of GST</small></td>
        <td class="qrow__amt">${fmtINR(c.totalCost)}</td>
      </tr>
      ${subsidyLine}
      <tr class="qrow qrow--total">
        <td>Your investment</td>
        <td><small>Net of subsidy${c.subsidy > 0 ? "" : " (no subsidy applied)"}</small></td>
        <td class="qrow__amt">${fmtINR(c.netInvestment)}</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ============ INCLUSIONS ============ -->
<section class="quote-section">
  <h2>What's included <small class="quote-h2-sub">— turnkey, no surprises</small></h2>
  <ul class="quote-incl">
    <li><span class="qicon qicon--panel">☀</span><div><strong>${esc(q.system.panelMake || "Tier-1 mono-PERC")} panels${!isDCR ? ' (Non-DCR)' : ' (DCR/ALMM)'}</strong><span>30-yr linear performance · ≥80 % output at year 25${!isDCR && !isResidential ? ' · Not eligible for net-metering' : ''}</span></div></li>
    <li><span class="qicon qicon--inv">⚡</span><div><strong>${esc(q.system.inverterMake || "Tier-1 string inverter")}</strong><span>10-yr warranty · IP65 · WiFi monitoring built-in</span></div></li>
    <li><span class="qicon qicon--str">🛠</span><div><strong>Elevated GI mounting structure</strong><span>10-yr anti-corrosion · zero roof-leak guarantee</span></div></li>
    <li><span class="qicon qicon--cab">🔌</span><div><strong>DC + AC cabling, ACDB &amp; DCDB</strong><span>IS-7098-2 cables · IP65 enclosures · SPD &amp; isolators</span></div></li>
    <li><span class="qicon qicon--gnd">⏚</span><div><strong>Earthing, lightning &amp; surge protection</strong><span>Copper-bonded electrodes · Type-2 SPD · IS-3043 compliant</span></div></li>
    <li><span class="qicon qicon--dox">📋</span><div><strong>Single-window paperwork</strong><span>PM Surya Ghar registration · DISCOM net-metering · loan facilitation</span></div></li>
    <li><span class="qicon qicon--app">📱</span><div><strong>WiFi monitoring + WhatsApp savings report</strong><span>Live generation &amp; lifetime savings on your phone</span></div></li>
    <li><span class="qicon qicon--shield">🛡</span><div><strong>Performance Promise</strong><span>≥80 % design generation guaranteed in writing</span></div></li>
  </ul>
</section>

${amc5Html}

<!-- ============ PAYMENT MILESTONES ============ -->
<section class="quote-section">
  <h2>Payment schedule</h2>
  <table class="quote-table quote-table--pay">
    <tbody>
      <tr><td><strong>30 %</strong> on signing</td><td>Confirms PO and locks panel allocation</td><td class="ta-r"><strong>${fmtINR(c.payAdvance)}</strong></td></tr>
      <tr><td><strong>60 %</strong> before material dispatch</td><td>~Day 5 once design + paperwork are signed off</td><td class="ta-r"><strong>${fmtINR(c.payDispatch)}</strong></td></tr>
      <tr><td><strong>10 %</strong> on commissioning</td><td>Day 7–10 — net-meter live, generating units</td><td class="ta-r"><strong>${fmtINR(c.payCommission)}</strong></td></tr>
      <tr class="qrow--total"><td>Total</td><td>NEFT / RTGS / Cheque to ${esc(firmName)}</td><td class="ta-r">${fmtINR(c.totalCost)}</td></tr>
    </tbody>
  </table>
  ${c.subsidy > 0 ? `<p class="qpay-note">PM Surya Ghar subsidy of <strong>${fmtINR(c.subsidy)}</strong> credits to your bank account ~30 days after net-meter activation. We handle the entire filing — you sign three forms.</p>` : ""}
</section>

<!-- ============ TIMELINE ============ -->
<section class="quote-section quote-timeline">
  <h2>From go-ahead to first units — 7 to 10 days</h2>
  <ol>
    <li><span>Day 0</span><strong>Site survey</strong><em>Drone scan, shadow analysis, structural check</em></li>
    <li><span>Day 1–2</span><strong>Design &amp; BOQ</strong><em>3-D layout, single-line diagram, panel-level layout shared</em></li>
    <li><span>Day 2–4</span><strong>Paperwork</strong><em>PM Surya Ghar registration, DISCOM application, loan if needed</em></li>
    <li><span>Day 4–7</span><strong>Installation</strong><em>Mounting, panels, inverter, cables — photos sent on WhatsApp every hour</em></li>
    <li><span>Day 7–10</span><strong>Commissioning</strong><em>Net-meter installed by DISCOM, monitoring app active, training</em></li>
    <li><span>Year 1+</span><strong>${amc5Include ? (amc5Free ? "5-year AMC included free" : "5-year AMC available") : "Ongoing support"}</strong><em>Cleaning, monitoring, monthly savings report</em></li>
  </ol>
</section>

${q.meta.notes ? `
<section class="quote-section quote-notes">
  <h2>Notes</h2>
  <p>${esc(q.meta.notes)}</p>
</section>` : ""}

<!-- ============ TERMS ============ -->
<section class="quote-section quote-terms">
  <h2>Terms — short and honest</h2>
  <ol>
    <li><strong>Validity:</strong> this quote is valid for ${validity} days from issue.</li>
    <li><strong>Generation:</strong> figures based on MNRE solar atlas; actual yield ±5 % depending on weather, dust, shading.</li>
    <li><strong>Subsidy:</strong> filed entirely by ${esc(firmName)}. If CFA is not credited within 45 days of net-meter activation, we'll waive that portion of the final invoice.</li>
    <li><strong>Net metering:</strong> we file with your DISCOM; their bi-directional meter installation is on their schedule (typically 2–3 weeks after our application).</li>
    <li><strong>Force majeure:</strong> we're not liable for delays caused by natural calamity, government order, or DISCOM delays.</li>
    <li><strong>Jurisdiction:</strong> ${epc.address?.city || "Delhi"} / ${epc.address?.state || "Delhi"} courts.</li>
  </ol>
</section>

<!-- ============ CTA ============ -->
<section class="quote-section quote-cta">
  <h2>Ready to make this real?</h2>
  <p>Reply to this quote on WhatsApp or call — we'll book a site visit within 48 hours.</p>
  <div class="quote-cta__row">
    <a class="btn primary big" href="${epc.mobile ? `https://wa.me/${epc.mobile.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(firmName)}%2C%20I'd%20like%20to%20proceed%20with%20quote%20${encodeURIComponent(q.id || '')}.` : '#'}">💬 Confirm on WhatsApp</a>
    <a class="btn ghost big" href="${epc.mobile ? `tel:${epc.mobile.replace(/[^0-9+]/g, '')}` : 'tel:+918383810048'}">📞 ${epc.mobile ? esc(epc.mobile) : '+91 83838 10048'}</a>
  </div>
</section>

${epc.documents?.quoteNotes ? `
<section class="quote-section">
  <h2>Additional Notes</h2>
  <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${esc(epc.documents.quoteNotes)}</div>
</section>
` : ""}

<footer class="quote-footer">
  <div>
    <strong>${esc(firmName)}</strong>
    ${firmAddress ? `<p>${esc(firmAddress)}</p>` : ""}
    ${firmContact ? `<p>${esc(firmContact)}</p>` : ""}
    ${epc.gstin ? `<p>GSTIN: ${esc(epc.gstin)}</p>` : ""}
    ${epc.cin ? `<p>CIN: ${esc(epc.cin)}</p>` : ""}
    ${epc.branding?.footerText ? `<p style="margin-top: 8px; font-style: italic;">${esc(epc.branding.footerText)}</p>` : ""}
    ${epc.firmName && epc.firmName !== "SolarOS" ? `<p style="margin-top: 12px; font-size: 12px; color: #999;">Powered by <strong style="color: #ff6b1a;">SolarOS</strong></p>` : ""}
  </div>
  <div class="quote-footer__sign">
    <p class="qsign-label">Customer acceptance</p>
    <div class="qsign-line"></div>
    <p>Name &amp; Date</p>
  </div>
</footer>
`;
    target.innerHTML = html;
  }

  function pitchLine(q, c) {
    const seg = q.system.segment;
    const monthly = c.monthlySaving;
    const f = (n) => {
      if (n >= 1e7) return "₹" + (n / 1e7).toFixed(1) + " Cr";
      if (n >= 1e5) return "₹" + (n / 1e5).toFixed(1) + " L";
      return "₹" + n.toLocaleString("en-IN");
    };
    if (seg === "residential")
      return `From day one, your electricity bill becomes a souvenir. We've sized this system to cover your typical home consumption — and you'll save about <strong>${f(monthly)}/month</strong> while sending surplus units to the grid.`;
    if (seg === "commercial")
      return `Showroom, office or shop tariffs in India are punishingly high. This system pays back in <strong>${c.paybackYrs.toFixed(1)} years</strong> — after which every unit your roof generates is pure margin.`;
    if (seg === "industrial")
      return `Industrial roofs are India's largest untapped power plant. With 40% accelerated depreciation in Year 1 and ${f(monthly)}/month bill savings, this asset typically pays back inside 3 years.`;
    return `This system displaces grid power that would otherwise come from coal. From the very first day, you save money <em>and</em> avoid burning fossil fuel.`;
  }

  // expose
  window.renderQuote = renderQuote;
  window.computeQuote = compute;

})();
