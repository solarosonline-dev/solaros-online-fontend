import { useEffect, useState, type FormEvent } from "react";
import "../../legacy-styles.css";
import { useRevealOnScroll } from "./useRevealOnScroll";
import { submitDemoRequest } from "../../api/demoRequests";
import { ApiError } from "../../api/client";

const SALES_PHONE = "+918383810048";
const SALES_PHONE_DISPLAY = "+91 83838 10048";
const SALES_EMAIL = "solaros.online@gmail.com";
const WA_DEMO_LINK = `https://wa.me/${SALES_PHONE.replace("+", "")}?text=Hi%20SolarOS%2C%20I%27d%20like%20to%20book%20a%20demo%20of%20the%20platform`;

type ServiceTabKey = "epc" | "financier" | "owner" | "om";

const SERVICE_TABS: { key: ServiceTabKey; label: string }[] = [
  { key: "epc", label: "🏗️ EPC" },
  { key: "financier", label: "💰 Financier (NBFC/Bank)" },
  { key: "owner", label: "🏢 Investor & Asset Owner" },
  { key: "om", label: "🔧 O&M Vendor" },
];

export default function LandingPage() {
  useRevealOnScroll(
    ".why-card, .amc-card, .subs-card, .process-list li, .service-panel.active",
  );

  return (
    <>
      <TopBar />
      <Ticker />
      <Nav />
      <Hero />
      <Brands />
      <Why />
      <Platform />
      <Compliance />
      <AmcPricing />
      <Pipeline />
      <Coverage />
      <Faq />
      <Contact />
      <Footer />
      <QuickContact />
      <WhatsappFloat />
    </>
  );
}

function TopBar() {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <span className="tb-status">
            <span className="dot-pulse" /> Platform live · demo slots open this week
          </span>
        </div>
        <div className="topbar-right">
          <a href={`tel:${SALES_PHONE}`} className="tb-link">
            <span>📞</span> Talk to sales
          </a>
          <a href={WA_DEMO_LINK} className="tb-link tb-link--wa">
            <span>💬</span> WhatsApp sales
          </a>
          <a href={`mailto:${SALES_EMAIL}`} className="tb-link tb-link--hide-sm">
            <span>✉</span> {SALES_EMAIL}
          </a>
        </div>
      </div>
    </div>
  );
}

function Ticker() {
  const items = [
    "★ One OS. Every stage of solar. ★",
    "🧭 Site Survey → Design → Pricing → Financing → Investor → PPA → EPC → Monitoring → O&M → Billing → Asset Management 🧭",
    "★ 100% B2B — we never install a single panel ★",
    "🤝 Built for EPCs, financiers, RESCO investors & asset owners 🤝",
    "★ One login. Every project. Every partner. ★",
    "🌐 India-first. Global-ready. 🌐",
    "★ Your brand, your customers — our platform underneath ★",
    "★ 100% B2B — we never install a single panel ★",
    "🤝 Built for EPCs, financiers, RESCO investors & asset owners 🤝",
    "★ One login. Every project. Every partner. ★",
  ];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {items.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  function scrollToId(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMenuOpen(false);
  }

  return (
    <header className="nav">
      <a href="#top" className="logo" aria-label="SolarOS home">
        <svg viewBox="0 0 100 100" className="logo-mark">
          <g fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round">
            <path d="M50 14 L82 70 L18 70 Z" />
          </g>
          <circle cx={50} cy={14} r={9} fill="currentColor" />
          <circle cx={18} cy={70} r={9} fill="currentColor" />
          <circle cx={82} cy={70} r={9} fill="currentColor" />
          <circle cx={50} cy={55} r={5} fill="currentColor" opacity={0.55} />
        </svg>
        <span className="logo-text">
          Solar<em>OS</em>
        </span>
      </a>
      <div className={`nav-mobile-panel ${menuOpen ? "open" : ""}`}>
        <nav className="nav-links">
          <a href="#platform" onClick={(e) => scrollToId(e, "platform")}>Platform</a>
          <a href="#pipeline" onClick={(e) => scrollToId(e, "pipeline")}>How it works</a>
          <a href="#faq" onClick={(e) => scrollToId(e, "faq")}>FAQ</a>
        </nav>
      </div>
      {/* Always visible, on every screen size -- never hidden behind the
          hamburger toggle above, unlike the Platform/How it works/FAQ links. */}
      <div className="nav-cta-group">
        <a href="/login" className="nav-link-login">Login</a>
        <a href="/register" className="cta-pill highlight">Try Now →</a>
        <a href="#contact" onClick={(e) => scrollToId(e, "contact")} className="cta-pill">Book a demo →</a>
      </div>
      <button
        type="button"
        className="nav-menu-btn"
        aria-expanded={menuOpen}
        aria-label="Toggle navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-grid" />
      <div className="sun-orb" aria-hidden="true">
        <div className="sun-core" />
        <div className="sun-rays" />
      </div>

      <div className="hero-inner">
        <div className="hero-eyebrow">
          <span className="dot-pulse" />
          Built for EPCs, financiers, RESCO investors &amp; asset owners · Not an installer
        </div>

        <h1 className="hero-h1">
          <span className="line">One <em>OS.</em></span>
          <span className="line accent">Every solar deal.</span>
          <span className="line hero-h1-sub">Survey to Asset Management.</span>
        </h1>

        <p className="hero-sub">
          SolarOS is the command centre <strong>EPCs, financiers, RESCO investors and asset owners</strong> use
          to win customers, run every project stage, and stay connected — end to end, without SolarOS
          ever installing a single panel. We build the software; you run the business.
        </p>

        <div className="hero-ctas">
          <a href="#contact" className="btn primary">
            <span>Book a demo</span>
            <svg viewBox="0 0 24 24" width={18} height={18}>
              <path fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a href="#platform" className="btn ghost">Explore the platform</a>
        </div>

        <div className="hero-stats">
          <div><strong>11</strong><span>modules — Site Survey to Asset Management, one platform</span></div>
          <div><strong>4</strong><span>stakeholder types work off the same record: EPCs, financiers, RESCO investors, asset owners</span></div>
          <div><strong>0</strong><span>installations we perform ourselves — 100% B2B, always</span></div>
          <div><strong>1</strong><span>login for every project, from first survey to year-25 review</span></div>
        </div>
      </div>

      <a href="#platform" className="scroll-hint" aria-label="Scroll down">
        <span />
      </a>
    </section>
  );
}

function Brands() {
  const brands = ["Tata Power Solar", "Adani Solar", "Waaree", "Vikram Solar", "Renewsys", "Loom", "Growatt", "Sungrow", "Solis", "Luminous", "Enphase", "Microtek", "Tata Power Solar", "Adani Solar", "Waaree", "Vikram Solar"];
  return (
    <section className="brands">
      <p className="brands-label">Integrates with the hardware, monitoring &amp; finance stack you already run</p>
      <div className="brands-track">
        {brands.map((b, i) => (
          <span key={i}>{b}{i < brands.length - 1 ? " · " : ""}</span>
        ))}
      </div>
    </section>
  );
}

const WHY_CARDS = [
  { n: "01", title: "One record, every stage", body: "Site Survey, Design, Pricing, Financing, Investor, PPA, EPC, Monitoring, O&M, Billing, Asset Management — logged against a single project, visible to every stakeholder. No more chasing status over email." },
  { n: "02", title: "Win faster, close cleaner", body: "Auto-generated BOQs, financing-ready proposals and investor-grade reporting — turned around in minutes, not a week of spreadsheets and back-and-forth.", highlight: true },
  { n: "03", title: "Compliance, templated — not chased", body: "Subsidy filings, utility interconnection, PPA drafting: tracked as structured workflow steps inside the platform, not a folder of PDFs someone has to remember to follow up on." },
  { n: "04", title: "Your brand, our engine", body: "White-labelled customer portals mean your customers experience your brand end to end. SolarOS runs underneath — quietly, and never customer-facing as an installer." },
  { n: "05", title: "O&M and billing that don't drop the ball", body: "SLA timers, ticketing, generation-health alerts and automated billing — running for the full 25-year life of every asset your customers own." },
  { n: "06", title: "Built for the whole deal team", body: "EPCs, financiers, RESCO investors and O&M vendors collaborate on the same live record. No forwarded spreadsheets, no stale PDFs, no \"let me check and get back to you.\"" },
];

function Why() {
  return (
    <section className="why" id="why">
      <div className="section-head">
        <span className="kicker">Why EPCs run on SolarOS</span>
        <h2>Spreadsheets don't scale a pipeline. <br /><em>One OS does.</em></h2>
      </div>
      <div className="why-grid">
        {WHY_CARDS.map((c) => (
          <article className={`why-card${c.highlight ? " highlight" : ""}`} key={c.n}>
            <div className="why-num">{c.n}</div>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type ServicePanelContent = {
  heading: string;
  body: string;
  list: { term: string; desc: string }[];
  cardTitle: string;
  cardHeading: string;
  cardList: string[];
  ctaLabel: string;
};

const SERVICE_PANELS: Record<ServiceTabKey, ServicePanelContent> = {
  epc: {
    heading: "Run quote-to-commissioning without six disconnected tools.",
    body: "Your sales, design and execution teams work off one record — Site Survey, Design, Pricing, Financing and EPC — so nothing gets re-typed or re-explained between a CRM, a CAD tool, a spreadsheet and a WhatsApp group.",
    list: [
      { term: "Site Survey", desc: "Digital survey capture from the field — shadow analysis, roof geometry, load data — straight into the project record." },
      { term: "Design", desc: "Single-line diagrams and layouts generated from survey data — no separate CAD hand-off required." },
      { term: "Pricing", desc: "Itemised, branded BOQs and proposals your team can send in minutes, not days." },
      { term: "EPC", desc: "Crew scheduling, commissioning checklists and site-progress tracking against the original BOQ." },
    ],
    cardTitle: "Built for EPCs",
    cardHeading: "Win the deal, deliver the project, one login",
    cardList: ["Digital site survey app + shadow/roof analysis", "Auto-generated single-line diagrams", "Branded, itemised BOQ builder", "Crew scheduling & commissioning checklists", "Full audit trail from first contact to handover"],
    ctaLabel: "See the EPC workspace",
  },
  financier: {
    heading: "A structured loan intake, not a document chase across five channels.",
    body: "The Financing module is built for the NBFC or bank funding the project against EMI repayments — a debt facility, not equity ownership. It collects the customer's identity docs, finance docs, project approval report and geotagged site photos into one trackable application, so disbursal only waits on real status.",
    list: [
      { term: "Financing", desc: "Eligibility and financing options surfaced to the customer at the moment of quoting." },
      { term: "Intake", desc: "Identity, finance and project-approval documents collected against one applicant record." },
      { term: "Disbursement", desc: "Milestone-based drawdowns tied to verified project status, not manual sign-off chains." },
      { term: "Portfolio view", desc: "Live loan-book visibility for your credit team, across every EPC partner." },
    ],
    cardTitle: "Built for Financiers (NBFC / Bank)",
    cardHeading: "EMI-based lending, tracked end to end",
    cardList: ["Guided document intake per applicant", "Milestone-based disbursement tracking", "Live loan-book dashboards for credit teams", "Audit-ready reporting exports"],
    ctaLabel: "See the Financier workspace",
  },
  owner: {
    heading: "The RESCO model: an investor owns the asset, the customer just pays for the power.",
    body: "Unlike a financier, the RESCO investor or asset owner puts up equity capital and owns the system — there's no EMI, no debt. SolarOS models feasibility, cash flows, generation simulation and investor returns before the PPA is signed, then gives owners a portfolio-level register with health scores and generation performance across every site they own.",
    list: [
      { term: "PPA", desc: "Templated, e-signable Power Purchase Agreements auto-populated from project and pricing data." },
      { term: "Investor returns", desc: "IRR and payback modelled from the cash-flow projection, before capital commitment." },
      { term: "Asset Management", desc: "Portfolio-level asset register with health scores, for owners managing dozens or thousands of sites." },
      { term: "Monitoring & Billing", desc: "Live generation dashboards and automated invoicing tied to PPA terms." },
    ],
    cardTitle: "Built for RESCO Investors & Asset Owners",
    cardHeading: "Zero upfront for the customer, modelled returns for you",
    cardList: ["Feasibility, cash-flow & IRR modelling before signing", "Auto-populated, e-signable PPAs", "Portfolio-level asset register & health scores", "Auto-generated investor-ready reports"],
    ctaLabel: "See the Investor / RESCO workspace",
  },
  om: {
    heading: "SLA tickets, escalations and billing that don't lose track.",
    body: "O&M vendors run their service business — tickets, SLA timers, escalation rules, technician dispatch — inside the same record the EPC and owner see, so status updates stop living in a separate helpdesk tool nobody else can see.",
    list: [
      { term: "O&M", desc: "SLA-timed ticketing with escalation rules you set, for your own team or your sub-contractors." },
      { term: "Monitoring", desc: "Automatic flags when generation drifts from design — before the customer notices." },
      { term: "Billing", desc: "Automated invoicing tied to AMC contracts, so the paperwork keeps pace with the visits." },
      { term: "Handover", desc: "Structured commissioning-to-service handover so nothing gets missed at go-live." },
    ],
    cardTitle: "Built for O&M Vendors",
    cardHeading: "25 years of service, fully tracked",
    cardList: ["SLA-timed ticketing & escalation rules", "Generation-vs-design drift alerts", "Technician dispatch scheduling", "Automated AMC billing & invoicing", "Structured commissioning-to-service handover"],
    ctaLabel: "See the AMC / O&M workspace",
  },
};

function Platform() {
  const [active, setActive] = useState<ServiceTabKey>("epc");
  const panel = SERVICE_PANELS[active];

  return (
    <section className="services" id="platform">
      <div className="section-head">
        <span className="kicker">The Platform</span>
        <h2>One record. <em>A different view for every stakeholder.</em></h2>
        <p className="section-sub">
          SolarOS isn't one generic dashboard for everyone. EPCs, financiers, RESCO investors &amp; asset owners, and
          O&amp;M vendors each get a purpose-built view of the same underlying project record — no mixed,
          one-size-fits-all screen that leaves you hunting for what matters to you. Pick who you are.
        </p>
      </div>

      <div className="service-tabs">
        {SERVICE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab${t.key === active ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="service-panels">
        <div className="service-panel active">
          <div className="sp-left">
            <h3>{panel.heading}</h3>
            <p>{panel.body}</p>
            <ul className="sp-list">
              {panel.list.map((item) => (
                <li key={item.term}><strong>{item.term}:</strong> {item.desc}</li>
              ))}
            </ul>
          </div>
          <div className="sp-right">
            <div className="sp-card">
              <div className="sp-card-h">{panel.cardTitle}</div>
              <h4>{panel.cardHeading}</h4>
              <ul>
                {panel.cardList.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a href="#contact" className="btn primary small">{panel.ctaLabel}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Compliance() {
  return (
    <section className="subsidy" id="compliance">
      <div className="section-head">
        <span className="kicker">Compliance &amp; paperwork, automated</span>
        <h2>The paperwork your customers hate. <em>Handled inside the workflow.</em></h2>
        <p className="section-sub">
          SolarOS doesn't file anything by hand on your behalf — it turns subsidy, interconnection and compliance
          steps into templated, tracked workflow inside your project record. India-first today, built to extend to
          any market.
        </p>
      </div>

      <div className="subs-grid">
        <div className="subs-card">
          <h4>PM Surya Ghar</h4>
          <p>Residential rooftop CFA filing</p>
          <div className="subs-amount">Auto-filed<sub>tracked to disbursement</sub></div>
        </div>
        <div className="subs-card highlight">
          <h4>DISCOM net-metering</h4>
          <p>Utility interconnection requests</p>
          <div className="subs-amount">Structured<sub>across major DISCOMs</sub></div>
        </div>
        <div className="subs-card highlight">
          <h4>PM-KUSUM &amp; ALMM/DCR</h4>
          <p>Agri-solar &amp; DCR eligibility</p>
          <div className="subs-amount">Checklist-driven<sub>compliance, not guesswork</sub></div>
        </div>
        <div className="subs-card">
          <h4>New states &amp; utilities</h4>
          <p>Expanding compliance coverage</p>
          <div className="subs-amount">Configurable<sub>no new code required</sub></div>
        </div>
      </div>

      <div className="subs-note">
        Every compliance workflow in SolarOS is <strong>templated</strong>. That's not just an India feature — it's
        why adding a new state, utility, or eventually a new country, is a configuration change, not a rebuild.
      </div>
    </section>
  );
}

function AmcPricing() {
  return (
    <section className="amc" id="om-pricing">
      <div className="section-head">
        <span className="kicker">O&amp;M &amp; Asset Management pricing</span>
        <h2>Every asset your customers own — <em>accountable for 25 years.</em></h2>
        <p className="section-sub">
          SolarOS gives EPCs, O&amp;M vendors and asset owners the tools to run service and asset programmes at
          scale — ticketing, SLA tracking, billing and health monitoring — without SolarOS ever dispatching a
          technician itself.
        </p>
      </div>

      <div className="amc-grid">
        <article className="amc-card">
          <h3>Essential <span>O&amp;M</span></h3>
          <div className="amc-price">Starter<sub>single-site teams</sub></div>
          <ul>
            <li>Ticket logging &amp; SLA timers</li>
            <li>Generation-vs-design drift alerts</li>
            <li>Quarterly auto-generated reports</li>
            <li>Single-site dashboard</li>
            <li>Email &amp; portal support</li>
          </ul>
          <a href="#contact" className="btn ghost small">Choose Essential</a>
        </article>

        <article className="amc-card featured">
          <div className="amc-tag">Most popular</div>
          <h3>Pro <span>O&amp;M + Billing</span></h3>
          <div className="amc-price">Growth<sub>multi-site EPC teams</sub></div>
          <ul>
            <li>Everything in Essential</li>
            <li><strong>Automated PPA/AMC billing</strong> &amp; invoicing</li>
            <li>Technician dispatch scheduling (your team)</li>
            <li>WhatsApp &amp; portal customer reports</li>
            <li>Live generation monitoring &amp; alerts — <strong>pay-as-you-go, ₹10/kW/month</strong> on connected capacity</li>
            <li>Priority support &amp; onboarding</li>
          </ul>
          <a href="#contact" className="btn primary small">Choose Pro</a>
        </article>

        <article className="amc-card">
          <h3>Enterprise <span>Asset Mgmt</span></h3>
          <div className="amc-price">Custom<sub>talk to sales</sub></div>
          <ul>
            <li>Portfolio-level asset register</li>
            <li>Investor-grade performance reporting</li>
            <li>SCADA / monitoring API integrations — volume-priced on connected kW</li>
            <li>Multi-state, multi-currency ready</li>
            <li>Dedicated success manager</li>
          </ul>
          <a href="#contact" className="btn ghost small">Connect with sales</a>
        </article>
      </div>

      <div className="amc-bottom">
        <p>
          ★ Already running O&amp;M off spreadsheets? <strong>Migrate your existing portfolio into SolarOS in days,
          not months.</strong> Live monitoring requires integrating with your inverter/SCADA vendor's API and is
          billed separately at ₹10/kW/month of connected capacity.
        </p>
      </div>
    </section>
  );
}

const PIPELINE_STEPS = [
  { n: "01", title: "Site Survey", body: "Digital survey capture: shadow analysis, roof/land geometry, and load data — straight into the project record." },
  { n: "02", title: "Design", body: "Single-line diagrams and layouts generated from survey data, ready for your engineering sign-off." },
  { n: "03", title: "Pricing", body: "Itemised, branded BOQs and proposals your team can send in minutes." },
  { n: "04", title: "Financing", body: "Financing options and eligibility surfaced to your customer at the moment of quoting." },
  { n: "05", title: "Investor", body: "Real-time portfolio and deal-pipeline visibility for RESCO investors and fund partners." },
  { n: "06", title: "PPA", body: "Templated, e-signable PPAs auto-populated from project and pricing data." },
  { n: "07", title: "EPC", body: "Crew scheduling, commissioning checklists and site-progress tracking against the original BOQ." },
  { n: "08", title: "Monitoring", body: "Live generation dashboards pulled from inverter and SCADA APIs the moment a site goes live." },
  { n: "09", title: "O&M", body: "SLA-timed ticketing and escalation rules for your service teams or partners." },
  { n: "10", title: "Billing", body: "Automated invoicing tied to generation, PPA terms, or AMC contracts." },
  { n: "11", title: "Asset Management", body: "Portfolio-level asset register and health scores — for the full 25-year life of every site." },
];

function Pipeline() {
  return (
    <section className="process" id="pipeline">
      <div className="section-head">
        <span className="kicker">How it works</span>
        <h2>From first site visit to year-25 asset review — <em>on one login.</em></h2>
      </div>
      <ol className="process-list">
        {PIPELINE_STEPS.map((s) => (
          <li key={s.n}><span>{s.n}</span><h4>{s.title}</h4><p>{s.body}</p></li>
        ))}
      </ol>
    </section>
  );
}

function Coverage() {
  return (
    <section className="coverage" id="coverage">
      <div className="section-head">
        <span className="kicker">Where SolarOS runs · India-first, global-ready</span>
        <h2><em>Built for how Indian solar actually works.</em><br />Architected for every market.</h2>
        <p className="section-sub">
          SolarOS's compliance and workflow templates are purpose-built around how Indian solar gets financed,
          permitted and billed today — and every workflow is designed to extend to new geographies as
          configuration, not a rebuild.
        </p>
      </div>

      <div className="coverage-tally">
        <div><span className="tally-num">11</span><span className="tally-label">pipeline stages unified in one platform</span></div>
        <div className="tally-divider" aria-hidden="true" />
        <div><span className="tally-num">4</span><span className="tally-label">stakeholder types on one shared record</span></div>
        <div className="tally-divider" aria-hidden="true" />
        <div><span className="tally-num">0</span><span className="tally-label">installations SolarOS performs itself</span></div>
        <div className="tally-divider" aria-hidden="true" />
        <div><span className="tally-num">100<small>%</small></span><span className="tally-label">B2B — always</span></div>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  { q: "Does SolarOS install solar systems?", a: "No. SolarOS is a B2B software platform — full stop. We never install panels, inverters, or any hardware. We give EPCs, financiers, RESCO investors and asset owners the tools to run their own sales, financing, execution and service businesses better. All physical work is performed by our customers' own crews or their vetted vendors." },
  { q: "Who is SolarOS actually for?", a: "EPCs (residential, C&I and utility-scale), financiers — NBFCs and banks lending against EMI repayments — RESCO investors and asset owners who fund and own systems under a PPA, and O&M / AMC vendors — anyone running the business side of solar, from the first site survey to the 25th year of asset ownership." },
  { q: "What does \"one OS\" actually mean in practice?", a: "Every stage of a project — Site Survey, Design, Pricing, Financing, Investor, PPA, EPC, Monitoring, O&M, Billing, Asset Management — lives on a single record with role-based access. Your sales team, your ops team, your financing partner and your investor all look at the same live data instead of six disconnected tools." },
  { q: "How does financing and investor visibility work?", a: "The Financing module is for lenders — NBFCs and banks financing the project against EMI repayments — and gives their credit teams a structured document intake plus milestone-based disbursement tracking. The Investor module is separate: it's built for RESCO investors and fund partners who own the asset under a PPA, with live, permissioned dashboards into portfolio and deal-pipeline status." },
  { q: "Can our customers get their own branded portal?", a: "Yes. SolarOS supports white-labelled customer-facing portals, so your customers experience your brand throughout — quoting, financing, commissioning updates, and ongoing generation/O&M reports. SolarOS runs underneath, never in front of your customer." },
  { q: "Is our data secure, and can we export it?", a: "Every user and integration is role-based and permissioned, with a full audit trail across the project record. Data export is supported at any time — we don't believe in lock-in." },
  { q: "How long does onboarding take, and does it work with our existing tools?", a: "Most EPC teams import their existing pipeline (spreadsheets or CRM exports) and connect their inverter/monitoring APIs within 2–3 weeks. SolarOS is designed to sit on top of what you already use and gradually become the system of record." },
  { q: "Do you support markets outside India?", a: "SolarOS is India-first, global-ready. Every compliance and financing workflow is templated by design, so extending to a new state, utility, or country is a configuration project — not a platform rebuild." },
];

function Faq() {
  return (
    <section className="faq" id="faq">
      <div className="section-head">
        <span className="kicker">FAQ</span>
        <h2>Questions every EPC, financier, investor &amp; asset owner should ask.</h2>
      </div>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <details key={item.q} open={i === 0}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;

    if (!data.name || !data.email || !data.company || !data.consent) {
      setError("Please fill in name, work email, company and accept contact.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError("Please enter a valid work email.");
      return;
    }

    setSubmitting(true);
    try {
      await submitDemoRequest({
        name: data.name,
        email: data.email,
        company: data.company,
        type: data.type,
        team_size: data.teamsize,
        active_projects: data.projects,
        notes: data.notes,
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        `Could not submit right now — please try again or WhatsApp us at ${SALES_PHONE_DISPLAY}. ${err instanceof ApiError ? err.message : ""}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="contact" id="contact">
      <div className="contact-bg" aria-hidden="true" />
      <div className="contact-inner">
        <div className="contact-left">
          <span className="kicker light">Book a demo</span>
          <h2>See your pipeline on one screen. <br />Not a sales pitch — a walkthrough.</h2>
          <p>20 minutes. We'll map Survey through Asset Management to how your team actually works today.</p>

          <ul className="contact-points">
            <li><span>✓</span> Live walkthrough with someone who's actually used the platform — not a generic slide deck</li>
            <li><span>✓</span> We'll show your actual stages: Survey, Design, Pricing, Financing, PPA, EPC, Monitoring, O&amp;M, Billing, Asset Management</li>
            <li><span>✓</span> No procurement games — pricing is transparent from the first call</li>
            <li><span>✓</span> Built for EPCs, financiers, RESCO investors, asset owners &amp; O&amp;M vendors — tell us which one you are</li>
          </ul>

          <div className="contact-direct">
            <div>
              <strong>📞 Sales</strong>
              <a href={`tel:${SALES_PHONE}`}>{SALES_PHONE_DISPLAY}</a>
              <em>Mon–Sat · 9 AM – 8 PM</em>
            </div>
            <div>
              <strong>💬 WhatsApp</strong>
              <a href={WA_DEMO_LINK}>{SALES_PHONE_DISPLAY}</a>
              <em>Reply within 30 minutes</em>
            </div>
            <div>
              <strong>📧 Email</strong>
              <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
              <em>For RFPs / partnerships</em>
            </div>
          </div>
        </div>

        {submitted ? (
          <div className="contact-form">
            <div className="ff-success">
              <div className="ff-success-emoji">🚀</div>
              <h3>Got it! We'll be in touch within one business day.</h3>
              <p>Someone from our sales team is reviewing your details now. You'll hear from us on email or WhatsApp with a demo slot.</p>
            </div>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            <h3>Book my demo</h3>

            <div className="ff-row">
              <label>
                <span>Your name</span>
                <input type="text" name="name" required placeholder="e.g. Aarav Sharma" />
              </label>
            </div>
            <div className="ff-row two">
              <label>
                <span>Work email</span>
                <input type="email" name="email" required placeholder="you@company.com" />
              </label>
              <label>
                <span>Company name</span>
                <input type="text" name="company" required placeholder="e.g. Sharma Solar EPC Pvt. Ltd." />
              </label>
            </div>

            <div className="ff-row">
              <span className="ff-label">I'm a…</span>
              <div className="ff-radios">
                <label><input type="radio" name="type" value="EPC" defaultChecked /><span>🏗️ EPC</span></label>
                <label><input type="radio" name="type" value="Financier (NBFC/Bank)" /><span>💰 Financier (NBFC/Bank)</span></label>
                <label><input type="radio" name="type" value="RESCO Investor/Asset Owner" /><span>🏢 RESCO Investor / Asset Owner</span></label>
                <label><input type="radio" name="type" value="O&M Vendor" /><span>🔧 O&amp;M Vendor</span></label>
              </div>
            </div>

            <div className="ff-row two">
              <label>
                <span>Team size</span>
                <select name="teamsize" defaultValue="6 – 20">
                  <option>1 – 5</option>
                  <option>6 – 20</option>
                  <option>21 – 50</option>
                  <option>51 – 200</option>
                  <option>200+</option>
                </select>
              </label>
              <label>
                <span>Active projects / month</span>
                <select name="projects" defaultValue="5 – 20">
                  <option>Under 5</option>
                  <option>5 – 20</option>
                  <option>21 – 50</option>
                  <option>51 – 200</option>
                  <option>200+</option>
                </select>
              </label>
            </div>

            <div className="ff-row">
              <label>
                <span>Which stage is most painful right now? <em>(optional)</em></span>
                <textarea name="notes" rows={3} placeholder="Survey scheduling, financing follow-ups, O&M tickets, billing reconciliation, etc." />
              </label>
            </div>

            <div className="ff-row">
              <label className="ff-check">
                <input type="checkbox" name="consent" required />
                <span>It's OK to contact me about a demo.</span>
              </label>
            </div>

            {error && <p role="alert" className="ff-error">{error}</p>}

            <button type="submit" className="btn primary big" disabled={submitting}>
              {submitting ? "Sending…" : "Book my demo →"}
            </button>

            <p className="ff-fineprint">
              By submitting, you agree to SolarOS's privacy terms. We never share your details with third parties.{" "}
              <strong>No spam — promise.</strong>
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <div className="logo">
            <svg viewBox="0 0 100 100" className="logo-mark">
              <g fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round">
                <path d="M50 14 L82 70 L18 70 Z" />
              </g>
              <circle cx={50} cy={14} r={9} fill="currentColor" />
              <circle cx={18} cy={70} r={9} fill="currentColor" />
              <circle cx={82} cy={70} r={9} fill="currentColor" />
              <circle cx={50} cy={55} r={5} fill="currentColor" opacity={0.55} />
            </svg>
            <span className="logo-text">Solar<em>OS</em></span>
          </div>
          <p>
            One OS for Site Survey → Design → Pricing → Financing → Investor → PPA → EPC → Monitoring → O&amp;M →
            Billing → Asset Management. <br />Built for EPCs. We never install. <br />A B2B platform, from India,
            for the world.
          </p>
          <div className="badges">
            <span>100% B2B</span>
            <span>India-first</span>
            <span>11 Modules</span>
            <span>Built for EPCs</span>
          </div>
        </div>

        <div className="footer-cols">
          <div>
            <h5>Platform</h5>
            <a href="#platform">Site Survey &amp; Design</a>
            <a href="#platform">Pricing &amp; Financing</a>
            <a href="#platform">Investor &amp; PPA</a>
            <a href="#platform">EPC &amp; Monitoring</a>
            <a href="#om-pricing">O&amp;M &amp; Billing</a>
            <a href="#om-pricing">Asset Management</a>
          </div>
          <div>
            <h5>Resources</h5>
            <a href="#compliance">Compliance Guide</a>
            <a href="#pipeline">How it works</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <h5>Company</h5>
            <a href="#why">Why SolarOS</a>
            <a href="#contact">Contact</a>
          </div>
          <div>
            <h5>Reach us</h5>
            <a href={`tel:${SALES_PHONE}`}>{SALES_PHONE_DISPLAY}</a>
            <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            <a href={WA_DEMO_LINK}>WhatsApp us</a>
            <p>SolarOS Technology<br />Dwarka Sector 11, New Delhi 110075</p>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div>© 2026 SolarOS Technology</div>
      </div>
    </footer>
  );
}

function QuickContact() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`quick-contact${open ? " open" : ""}`} id="quickContact">
      <button
        className="qc-toggle"
        aria-expanded={open}
        aria-controls="qcPanel"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="qc-icon">📞</span>
        <span className="qc-label">Talk to sales</span>
      </button>
      {open && (
        <div className="qc-panel" id="qcPanel" role="dialog" aria-label="Quick contact options">
          <div className="qc-head">
            <strong>Talk to SolarOS</strong>
            <button className="qc-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          <a href={`tel:${SALES_PHONE}`} className="qc-row">
            <span className="qc-row-icon">📞</span>
            <div><strong>Call sales</strong><em>{SALES_PHONE_DISPLAY} · 9 AM – 8 PM</em></div>
          </a>
          <a href={WA_DEMO_LINK} className="qc-row qc-row--wa">
            <span className="qc-row-icon">💬</span>
            <div><strong>WhatsApp sales</strong><em>Avg reply ~14 min</em></div>
          </a>
          <a href={`mailto:${SALES_EMAIL}`} className="qc-row">
            <span className="qc-row-icon">✉</span>
            <div><strong>Email sales</strong><em>{SALES_EMAIL}</em></div>
          </a>
          <a href="#contact" className="qc-row qc-row--cta" onClick={() => setOpen(false)}>
            <span className="qc-row-icon">⚡</span>
            <div><strong>Book a demo</strong><em>2-min form · sales calls back</em></div>
          </a>
        </div>
      )}
    </div>
  );
}

function WhatsappFloat() {
  return (
    <a href={WA_DEMO_LINK} className="wa-float" aria-label="Chat on WhatsApp">
      <svg viewBox="0 0 32 32" width={28} height={28} fill="#fff">
        <path d="M19.11 17.21c-.27-.13-1.6-.79-1.85-.88s-.43-.13-.61.13-.7.88-.86 1.06-.32.2-.59.07a7.4 7.4 0 0 1-2.18-1.34 8.16 8.16 0 0 1-1.5-1.86c-.16-.27 0-.42.12-.55.12-.12.27-.32.4-.48s.18-.27.27-.45a.5.5 0 0 0 0-.47c-.07-.13-.61-1.46-.83-2s-.44-.45-.61-.46h-.52a1 1 0 0 0-.72.34 3 3 0 0 0-.94 2.23 5.21 5.21 0 0 0 1.1 2.78 11.93 11.93 0 0 0 4.6 4.06c.64.28 1.14.45 1.53.58a3.69 3.69 0 0 0 1.69.11 2.78 2.78 0 0 0 1.81-1.27 2.24 2.24 0 0 0 .15-1.27c-.06-.13-.24-.2-.51-.32zM16 4a12 12 0 0 0-10.18 18.34L4 28l5.85-1.81A12 12 0 1 0 16 4zm0 21.83a9.85 9.85 0 0 1-5-1.36l-.36-.21-3.69 1.14 1.16-3.6-.24-.38a9.83 9.83 0 1 1 8.13 4.41z" />
      </svg>
    </a>
  );
}
