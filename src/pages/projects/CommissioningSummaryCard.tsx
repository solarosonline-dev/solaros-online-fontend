import { Link } from "react-router-dom";
import { COMMISSIONING_STAGE_LABEL } from "../../api/commissioning";
import type { CommissioningSummary } from "../../api/projects";

/** Read-only rollup of the project's Commissioning (Discom net-meter) status,
 * shown on the Project detail page's Installations tab. Application number
 * and screenshot are entered/edited from the Commissioning work order's own
 * detail page (see CommissioningPanel) -- this card has no edit controls,
 * only a link to that page. Single source of truth: nothing here is
 * duplicated storage, it's the same Commissioning row rolled up onto
 * ProjectDetail.commissioning (see CommissioningSummary in api/projects.ts). */
export default function CommissioningSummaryCard({ commissioning }: { commissioning: CommissioningSummary }) {
  return (
    <>
      <p className="projects-section-label">Commissioning (net meter)</p>
      <div className="project-detail-panel">
        <div className="project-detail-row">
          <span>Stage</span>
          <span>{COMMISSIONING_STAGE_LABEL[commissioning.current_stage]}</span>
        </div>
        <div className="project-detail-row">
          <span>Discom application number</span>
          <span>{commissioning.netmeter_application_number || "—"}</span>
        </div>
        {commissioning.screenshot_download_url && (
          <div className="project-detail-row">
            <span>Application screenshot</span>
            <span>
              <a
                href={commissioning.screenshot_download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="work-order-document-thumb-btn"
                aria-label="Open Discom application screenshot"
              >
                <img
                  src={commissioning.screenshot_download_url}
                  alt="Discom application screenshot"
                  className="work-order-document-thumb"
                  loading="lazy"
                />
              </a>
            </span>
          </div>
        )}
        <div className="project-detail-row">
          <span></span>
          <span>
            <Link className="projects-btn" to={`/app/work-orders/${commissioning.work_order_id}`}>
              Open commissioning work order
            </Link>
          </span>
        </div>
      </div>
    </>
  );
}
