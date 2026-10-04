// Builds the Design Report PDF (the editor's final "Design Report" step):
// one landscape A4 PDF page per on-screen report page (DesignReport.tsx's
// `.pde-report-page` elements). Used by both of that step's buttons -
// Download PDF and Attach to Work Order - so the two can never drift apart.
//
// Each page is a hybrid, so it stays sharp without being huge (work order
// documents are capped at 5 MB, see WorkOrderDocuments.tsx):
// - Every <svg data-pdf-vector> (the SLD diagram, the monthly output chart)
//   goes in as true vector graphics via svg2pdf.js - sharp at any zoom,
//   text selectable.
// - Everything else on the page (tables, text, logo, satellite image) is
//   one html2canvas capture, with those SVGs blanked out of it; the vector
//   versions are then drawn over it at exactly the positions they occupied.
//   PNG for text-only pages (flat colors - stays small and crisp), JPEG for
//   pages with photos (a PNG of satellite imagery is several MB).
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

export const REPORT_PAGE_CLASS = 'pde-report-page';
const VECTOR_SELECTOR = 'svg[data-pdf-vector]';

const MARGIN_MM = 8;

// Capture resolution - ~385 DPI across a landscape A4 page at 3x (1.5x read
// soft when zoomed; flat colors/text compress well as PNG, so 3x only cost
// ~2.4x the size). Capped by total canvas area: Safari refuses canvases over
// 16,777,216 px (html2canvas then renders blank), so a very tall page steps
// its scale down to fit instead.
const CAPTURE_SCALE = 3;
const MAX_CANVAS_PIXELS = 16_000_000;

function captureScale(el: HTMLElement) {
  const area = Math.max(1, el.scrollWidth * el.scrollHeight);
  return Math.min(CAPTURE_SCALE, Math.sqrt(MAX_CANVAS_PIXELS / area));
}

// Largest box with the given aspect ratio that fits the page inside the
// margins, centered horizontally and pinned to the top margin.
function fitToPage(pdf: jsPDF, aspect: number) {
  const maxW = pdf.internal.pageSize.getWidth() - 2 * MARGIN_MM;
  const maxH = pdf.internal.pageSize.getHeight() - 2 * MARGIN_MM;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  return { x: (pdf.internal.pageSize.getWidth() - w) / 2, y: MARGIN_MM, w, h };
}

type Box = { x: number; y: number; w: number; h: number };

async function addReportPage(pdf: jsPDF, pageEl: HTMLElement) {
  const liveSvgs = Array.from(pageEl.querySelectorAll<SVGSVGElement>(VECTOR_SELECTOR));
  // Each vector SVG's position within the page, in CSS px - measured inside
  // html2canvas's own cloned layout (after the tweaks below), since that's
  // the layout the captured image actually shows. Same order as liveSvgs.
  let boxes: Box[] = [];
  let rootW = 1;

  const canvas = await html2canvas(pageEl, {
    useCORS: true,
    scale: captureScale(pageEl),
    backgroundColor: '#ffffff',
    onclone: (doc, root) => {
      // Single-line "…"-truncated cells (e.g. the SLD's Client/Date/Scale
      // title block): html2canvas draws text a couple of px lower than the
      // browser does, so overflow:hidden on a one-line box clipped the
      // bottom of every value. Let them wrap instead.
      root.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (doc.defaultView?.getComputedStyle(el).textOverflow === 'ellipsis') {
          el.style.overflow = 'visible';
          el.style.whiteSpace = 'normal';
          el.style.textOverflow = 'clip';
        }
      });
      const r = root.getBoundingClientRect();
      rootW = r.width;
      boxes = Array.from(root.querySelectorAll<SVGSVGElement>(VECTOR_SELECTOR)).map((svgClone) => {
        const s = svgClone.getBoundingClientRect();
        svgClone.style.visibility = 'hidden';
        return { x: s.left - r.left, y: s.top - r.top, w: s.width, h: s.height };
      });
    },
  });

  const box = fitToPage(pdf, canvas.width / canvas.height);
  const hasPhoto = pageEl.querySelector('img') != null;
  if (hasPhoto) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', box.x, box.y, box.w, box.h, undefined, 'FAST');
  } else {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', box.x, box.y, box.w, box.h, undefined, 'FAST');
  }

  const mmPerPx = box.w / rootW;
  for (let i = 0; i < liveSvgs.length; i++) {
    const b = boxes[i];
    if (!b || b.w === 0 || b.h === 0) continue;
    await addVectorSvg(pdf, liveSvgs[i], {
      x: box.x + b.x * mmPerPx,
      y: box.y + b.y * mmPerPx,
      w: b.w * mmPerPx,
      h: b.h * mmPerPx,
    });
  }
}

async function addVectorSvg(pdf: jsPDF, liveSvg: SVGSVGElement, at: Box) {
  // svg2pdf falls back to Times for text with no font-family; the SVGs
  // inherit the app's sans-serif on screen, so pin Helvetica (jsPDF's
  // built-in sans) on a copy rather than touching the live element.
  const svgCopy = liveSvg.cloneNode(true) as SVGSVGElement;
  svgCopy.setAttribute('font-family', 'helvetica');
  // jsPDF's built-in fonts only come in normal/bold, and svg2pdf only
  // recognizes 700/"bold" as bold - any other numeric weight (e.g. the
  // SLD's 600-weight inverter/MPPT labels) found no Helvetica variant and
  // silently fell back to Times. Snap numeric weights to the nearest of the
  // two that exist.
  svgCopy.querySelectorAll('[font-weight]').forEach((el) => {
    const w = Number(el.getAttribute('font-weight'));
    if (!Number.isNaN(w)) el.setAttribute('font-weight', w >= 600 ? 'bold' : 'normal');
  });
  // Mounted off-screen while converting so its styles resolve like the
  // original's.
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;';
  holder.appendChild(svgCopy);
  document.body.appendChild(holder);
  try {
    await svg2pdf(svgCopy, pdf, { x: at.x, y: at.y, width: at.w, height: at.h });
  } finally {
    holder.remove();
  }
}

export async function buildReportPdf(container: HTMLElement): Promise<Blob> {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(`.${REPORT_PAGE_CLASS}`));
  if (pages.length === 0) throw new Error('Nothing to export - the report has no pages.');
  const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    await addReportPage(pdf, pages[i]);
  }
  return pdf.output('blob');
}

// Download filename: SolarOS-Design-Report-<project>-<date>.pdf
export function reportFilename(projectName: string | null | undefined) {
  const safeName = (projectName || 'Untitled project').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-');
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `SolarOS-Design-Report-${safeName}-${dateStr}.pdf`;
}
