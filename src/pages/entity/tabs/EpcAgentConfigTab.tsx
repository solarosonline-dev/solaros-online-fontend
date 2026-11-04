import { useState, useEffect } from "react";
import { getEpcAgentSettings, saveEpcAgentSettings } from "../../../lib/epcAgentStorage";

export default function EpcAgentConfigTab() {
  const [settings, setSettings] = useState({ enabled: true, onlyWorkspace: false });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getEpcAgentSettings());
  }, []);

  function handleSave() {
    saveEpcAgentSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="epc-agent-config-tab" style={{ padding: "16px 0" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>EPC Agent Workspace Preferences</h2>
      <p style={{ color: "var(--app-text-muted)", fontSize: 14, marginBottom: 24 }}>
        Configure how your Agents are managed and what panels and workspaces are accessible to your managers.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => {
              setSettings({ ...settings, enabled: e.target.checked });
              setSaved(false);
            }}
            style={{ marginTop: 4, width: 16, height: 16 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text)" }}>Enable EPC Agent Workspaces & Custom States</div>
            <div style={{ fontSize: 13, color: "var(--app-text-muted)", marginTop: 2 }}>
              Grants your agents separate, simplified dashboards to view their own leads, log commissions, and request payments.
            </div>
          </div>
        </label>
      </div>

      <div style={{ marginBottom: 30 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", opacity: settings.enabled ? 1 : 0.5 }}>
          <input
            type="checkbox"
            disabled={!settings.enabled}
            checked={settings.onlyWorkspace}
            onChange={(e) => {
              setSettings({ ...settings, onlyWorkspace: e.target.checked });
              setSaved(false);
            }}
            style={{ marginTop: 4, width: 16, height: 16 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text)" }}>Agent-Only Simplified Manager Workspace</div>
            <div style={{ fontSize: 13, color: "var(--app-text-muted)", marginTop: 2 }}>
              If checked, hides standard CRM features (Projects, AMC plans, etc.) from the Admin dashboard, leaving only the simplified Agent workflows.
            </div>
          </div>
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="entity-btn primary" onClick={handleSave}>
          Save Preferences
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 500 }}>
            Saved successfully! Nav links will update immediately.
          </span>
        )}
      </div>
    </div>
  );
}
