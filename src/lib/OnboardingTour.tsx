import type { ReactNode } from "react";
import "./OnboardingTour.css";

export type OnboardingRole = "system_admin" | "entity_admin" | "worker";

type Step = {
  title: string;
  body: ReactNode;
  /** Optional "jump straight there" action -- navigates and ends the tour,
   * rather than just advancing to the next slide, since a step that's
   * pointing the admin at a real page is more useful as a direct link than
   * a dead-end description. */
  cta?: { label: string; path: string };
};

// One script per role -- a field worker never sees Leads/Quotes at all
// (per AppLayout's own nav gating), and a system admin manages entities
// rather than doing any of this themselves, so each gets its own walkthrough
// instead of one generic script with irrelevant steps filtered out.
const STEPS_BY_ROLE: Record<OnboardingRole, Step[]> = {
  entity_admin: [
    {
      title: "Welcome to SolarOS 👋",
      body: (
        <>
          <p>SolarOS takes a solar job from a customer's first enquiry all the way through to a finished
            installation:</p>
          <p className="tour-flow">
            <strong>Lead</strong> → <strong>Quote</strong> → <strong>Agreement</strong> → <strong>Project</strong>
          </p>
          <p>This quick tour walks through what each of those means and where to find them. You can skip it any
            time, or reopen it later from the "Take the tour" link next to your name.</p>
        </>
      ),
    },
    {
      title: "1. Set up Entity Settings first",
      body: (
        <>
          <p>Before generating your first quote, spend a minute in <strong>Entity Settings</strong> — it's the
            source every quote and agreement pulls from:</p>
          <ul>
            <li>Branding &amp; typography — your logo, colors and fonts on customer-facing documents</li>
            <li>Default components, pricing and payment schedule</li>
            <li>AMC plans — maintenance plans you can attach to a quote</li>
          </ul>
        </>
      ),
      cta: { label: "Go to Entity Settings", path: "/app/entity" },
    },
    {
      title: "2. Create a Lead",
      body: (
        <>
          <p>Every job starts as a <strong>Lead</strong> — a prospective customer's details: name, contact,
            address, and roughly what they're looking for.</p>
          <p>Go to <strong>Leads</strong> and click <strong>+ New Lead</strong> to add one.</p>
        </>
      ),
      cta: { label: "Go to Leads", path: "/app/leads" },
    },
    {
      title: "3. Generate a Quote",
      body: (
        <>
          <p>Open a lead and click <strong>Generate quote</strong> to build a fully-priced, branded proposal —
            system size, savings, AMC and payment plan all computed automatically.</p>
          <p>Share the quote's link with the customer — they can review and accept it online, no account needed on
            their end.</p>
        </>
      ),
    },
    {
      title: "4. Create an Agreement",
      body: (
        <>
          <p>Once a customer accepts a quote, create an <strong>Agreement</strong> from the same lead — it locks
            in the AMC plan and payment schedule the customer already reviewed, and gets e-signed online.</p>
        </>
      ),
    },
    {
      title: "5. Track the Project",
      body: (
        <>
          <p>As soon as an agreement is signed, a <strong>Project</strong> is created for you automatically — no
            extra step.</p>
          <p>From <strong>Projects</strong> you can track installation progress, assign work orders to your team,
            and schedule AMC visits once the system is live.</p>
        </>
      ),
      cta: { label: "Go to Projects", path: "/app/projects" },
    },
    {
      title: "You're all set! 🎉",
      body: (
        <p>That's the whole flow: Lead → Quote → Agreement → Project. Jump in and create your first lead whenever
          you're ready — and remember, this tour is always one click away from the "Take the tour" link near your
          name.</p>
      ),
    },
  ],
  system_admin: [
    {
      title: "Welcome to SolarOS 👋",
      body: (
        <p>As a system admin, you manage the platform itself rather than any single company's leads/quotes — every
          EPC, financier or O&amp;M vendor using SolarOS is an <strong>Entity</strong> that you onboard and
          oversee.</p>
      ),
    },
    {
      title: "1. Entities",
      body: (
        <p>Create and manage every company on the platform from <strong>Entities</strong> — each one gets its own
          isolated Leads, Quotes, Agreements and Projects, branded and priced independently.</p>
      ),
      cta: { label: "Go to Entities", path: "/app/admin/entities" },
    },
    {
      title: "2. System Admins",
      body: <p>Manage other platform-level admin accounts (people with your same cross-entity access) here.</p>,
      cta: { label: "Go to System Admins", path: "/app/admin/users" },
    },
    {
      title: "3. Dashboard",
      body: <p>A platform-wide view across every entity — overall project counts, completions, and revenue.</p>,
      cta: { label: "Go to Dashboard", path: "/app/admin/dashboard" },
    },
    {
      title: "You're all set! 🎉",
      body: <p>Reopen this tour any time from the "Take the tour" link near your name.</p>,
    },
  ],
  worker: [
    {
      title: "Welcome to SolarOS 👋",
      body: (
        <p>You've been added to your team's SolarOS workspace to handle field work — site surveys, installations
          and AMC maintenance visits.</p>
      ),
    },
    {
      title: "1. My Work Orders",
      body: (
        <>
          <p>Every task assigned to you — a site survey, an installation, or an AMC visit — shows up in
            <strong> My Work Orders</strong>.</p>
          <p>Open one to see the customer/site details, update its status as you make progress, and upload photos
            or documents from the site.</p>
        </>
      ),
      cta: { label: "Go to My Work Orders", path: "/app/my-work-orders" },
    },
    {
      title: "You're all set! 🎉",
      body: <p>Reopen this tour any time from the "Take the tour" link near your name.</p>,
    },
  ],
};

type Props = {
  open: boolean;
  step: number;
  role: OnboardingRole;
  onStepChange: (step: number) => void;
  onClose: () => void;
  /** Ends the tour and routes to the CTA's target -- used instead of just
   * closing so the admin actually lands where the step pointed them. */
  onNavigate: (path: string) => void;
};

export default function OnboardingTour({ open, step, role, onStepChange, onClose, onNavigate }: Props) {
  if (!open) return null;

  const steps = STEPS_BY_ROLE[role];
  // Defensive clamp -- role can change (e.g. never in practice, but cheap
  // insurance) without step being reset first.
  const current = steps[Math.min(step, steps.length - 1)];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  return (
    <div className="tour-backdrop" onClick={onClose}>
      <div className="tour-card" role="dialog" aria-modal="true" aria-label="Guided tour" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tour-close" aria-label="Close tour" onClick={onClose}>
          ×
        </button>
        <p className="tour-step-count">
          Step {step + 1} of {steps.length}
        </p>
        <h2>{current.title}</h2>
        <div className="tour-body">{current.body}</div>

        {current.cta && (
          <button type="button" className="tour-cta" onClick={() => onNavigate(current.cta!.path)}>
            {current.cta.label} →
          </button>
        )}

        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? "active" : undefined} />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="tour-btn tour-skip" onClick={onClose}>
            Skip tour
          </button>
          <div className="tour-nav-btns">
            {!isFirst && (
              <button type="button" className="tour-btn" onClick={() => onStepChange(step - 1)}>
                Back
              </button>
            )}
            {!isLast ? (
              <button type="button" className="tour-btn primary" onClick={() => onStepChange(step + 1)}>
                Next
              </button>
            ) : (
              <button type="button" className="tour-btn primary" onClick={onClose}>
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
