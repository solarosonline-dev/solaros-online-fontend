// Builds the "Attach PDF to Work Order" design report (PlantDesignEditorPage's
// handleGeneratePdf): page 1 the site/plan view, page 2 the SLD.
//
// Size matters here - work order documents are capped at 5 MB (see
// WorkOrderDocuments.tsx). The first version captured both pages as 2x PNG
// screenshots with jsPDF compression off, which stores every image as raw
// uncompressed pixels - several MB per page before any content. Now:
//
// - Site view: real imagery (satellite tiles), so JPEG at 1.5x, same
//   trade-off src/lib/capturePdf.ts already made for agreements.
// - SLD: the diagram itself is an <svg>, so it goes into the PDF as true
//   vector graphics via svg2pdf.js - tiny, sharp at any zoom, text
//   selectable. Everything around it (title block, schedule/spec tables,
//   legend, notes) is ordinary HTML, captured as a compressed PNG (flat
//   colors and text - PNG stays small and crisp where JPEG would smear)
//   with the diagram blanked out of that capture, then the vector diagram
//   is drawn on top at exactly the position it occupied. The page keeps
//   its on-screen layout without hand-rebuilding every table in jsPDF.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

// SldView puts PDF_ROOT_CLASS on the element to capture (PlantDesignEditor-
// Page's attach handler finds it by this class) and PDF_HIDE_CLASS on
// on-screen-only controls inside it that the PDF leaves out.
export const PDF_ROOT_CLASS = 'sld-pdf-root';
export const PDF_HIDE_CLASS = 'sld-pdf-hide';

const MARGIN_MM = 10;

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

async function addSiteViewPage(pdf: jsPDF, viewContainer: HTMLElement) {
  const canvas = await html2canvas(viewContainer, { useCORS: true, scale: 1.5, backgroundColor: '#ffffff' });
  const box = fitToPage(pdf, canvas.width / canvas.height);
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', box.x, box.y, box.w, box.h, undefined, 'FAST');
}

async function addSldPage(pdf: jsPDF, sldContainer: HTMLElement) {
  const liveSvg = sldContainer.querySelector('.sld-svg-scroll svg') as SVGSVGElement | null;
  // The diagram's position within the captured root, in CSS px - measured
  // inside html2canvas's own cloned layout (after the tweaks below), since
  // that's the layout the captured image actually shows.
  let diagram: { x: number; y: number; w: number; h: number; rootW: number } | null = null;

  const canvas = await html2canvas(sldContainer, {
    useCORS: true,
    scale: 1.5,
    backgroundColor: '#ffffff',
    onclone: (doc, root) => {
      // Show the whole thing rather than the on-screen scroll viewport,
      // drop on-screen-only controls (the Download PDF button), and let the
      // diagram fit its column instead of overflowing it at its on-screen
      // min-width.
      root.style.height = 'auto';
      root.style.flex = 'none';
      root.style.overflow = 'visible';
      root.querySelectorAll<HTMLElement>(`.${PDF_HIDE_CLASS}`).forEach((el) => { el.style.display = 'none'; });
      // Single-line "…"-truncated cells (the Client/Date/Scale title
      // block): html2canvas draws text a couple of px lower than the
      // browser does, so overflow:hidden on a one-line box clipped the
      // bottom of every value. Let them wrap instead - there's no
      // horizontal space pressure in the PDF anyway.
      root.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (doc.defaultView?.getComputedStyle(el).textOverflow === 'ellipsis') {
          el.style.overflow = 'visible';
          el.style.whiteSpace = 'normal';
          el.style.textOverflow = 'clip';
        }
      });
      const scroll = root.querySelector<HTMLElement>('.sld-svg-scroll');
      if (scroll) scroll.style.overflow = 'visible';
      const svgClone = root.querySelector<SVGSVGElement>('.sld-svg-scroll svg');
      if (!svgClone || !liveSvg) return;
      svgClone.style.minWidth = '260px';
      svgClone.style.width = '100%';
      const r = root.getBoundingClientRect();
      const s = svgClone.getBoundingClientRect();
      diagram = { x: s.left - r.left, y: s.top - r.top, w: s.width, h: s.height, rootW: r.width };
      svgClone.style.visibility = 'hidden';
    },
  });

  const box = fitToPage(pdf, canvas.width / canvas.height);
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', box.x, box.y, box.w, box.h, undefined, 'FAST');

  const d = diagram as { x: number; y: number; w: number; h: number; rootW: number } | null;
  if (!liveSvg || !d) return;
  const mmPerPx = box.w / d.rootW;
  // svg2pdf falls back to Times for text with no font-family; the diagram
  // inherits the app's sans-serif on screen, so pin Helvetica (jsPDF's
  // built-in sans) on a copy rather than touching the live element.
  // Mounted off-screen while converting so its styles resolve like the
  // original's.
  const svgCopy = liveSvg.cloneNode(true) as SVGSVGElement;
  svgCopy.setAttribute('font-family', 'helvetica');
  // jsPDF's built-in fonts only come in normal/bold, and svg2pdf only
  // recognizes 700/"bold" as bold - any other numeric weight (the SLD's
  // 600-weight inverter DC and MPPT labels) found no Helvetica variant and
  // silently fell back to Times. Snap numeric weights to the nearest of
  // the two that exist.
  svgCopy.querySelectorAll('[font-weight]').forEach((el) => {
    const w = Number(el.getAttribute('font-weight'));
    if (!Number.isNaN(w)) el.setAttribute('font-weight', w >= 600 ? 'bold' : 'normal');
  });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;';
  holder.appendChild(svgCopy);
  document.body.appendChild(holder);
  try {
    await svg2pdf(svgCopy, pdf, {
      x: box.x + d.x * mmPerPx,
      y: box.y + d.y * mmPerPx,
      width: d.w * mmPerPx,
      height: d.h * mmPerPx,
    });
  } finally {
    holder.remove();
  }
}

export async function buildDesignReportPdf({ viewContainer, sldContainer }: {
  viewContainer: HTMLElement | null;
  sldContainer: HTMLElement | null;
}): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
  if (viewContainer) await addSiteViewPage(pdf, viewContainer);
  if (sldContainer) {
    if (viewContainer) pdf.addPage();
    await addSldPage(pdf, sldContainer);
  }
  return pdf.output('blob');
}
