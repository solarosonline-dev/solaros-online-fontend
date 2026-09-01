import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import EmailTemplatesPanel from "./EmailTemplatesPanel";
import EmailComposePanel from "./EmailComposePanel";
import EmailCampaignHistoryPanel from "./EmailCampaignHistoryPanel";
import "./EmailPage.css";

type Tab = "templates" | "send" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "templates", label: "Templates" },
  { key: "send", label: "Compose & Send" },
  { key: "history", label: "History" },
];

function isTabKey(value: string | null): value is Tab {
  return TABS.some((t) => t.key === value);
}

// SYSTEM_SUPER_ADMIN-only bulk/templated email -- see
// lib/RequireSystemSuperAdmin.tsx and app/api/v1/endpoints/email.py on the
// backend. Single route, tab-based (?tab=templates|send|history), same
// query-param-tab convention as EntityManagementPage.tsx.
export default function EmailPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTabKey(initialTab) ? initialTab : "templates");

  return (
    <div className="email-page">
      <h1>Email</h1>
      <p className="email-page-subtitle">
        Send personalized templated email, from a sender address of your choosing (any local-part
        <strong> @solaros.online</strong>), to a list of recipients.
      </p>

      <div className="email-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="email-panel">
        {tab === "templates" && <EmailTemplatesPanel />}
        {tab === "send" && <EmailComposePanel />}
        {tab === "history" && <EmailCampaignHistoryPanel />}
      </div>
    </div>
  );
}
