import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Renders a DOM element to a multi-page PDF Blob — used to capture a static
 * snapshot of the signed agreement right after acceptance (see
 * PublicAgreementPage). `.no-print` elements (the print toolbar, the
 * signature-pad form) are skipped the same way the browser's own print
 * stylesheet already hides them, since html2canvas doesn't apply
 * `@media print` rules on its own.
 *
 * JPEG at a moderate quality rather than lossless PNG, and a scale of 1.5
 * rather than 2 — this is mostly flat-color text/tables, not photographic
 * content, so the extra PNG/2x resolution bought sharpness nobody could see
 * at a huge size cost (a 2-page agreement went from ~21MB to ~0.5MB with
 * this change — verified side by side, no visible quality loss at normal
 * zoom, text/QR/signature all still crisp).
 */
export async function captureElementAsPdf(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 1.5,
    useCORS: true,
    backgroundColor: "#ffffff",
    ignoreElements: (el) => el.classList.contains("no-print"),
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.82);

  // The same full-height image is redrawn on every page, shifted up by the
  // accumulated page height each time — jsPDF clips whatever falls outside
  // the current page's bounds, so this slices one tall image into pages
  // without needing to cut the canvas itself.
  let heightRemaining = imgHeight;
  let offset = 0;
  pdf.addImage(imgData, "JPEG", 0, offset, imgWidth, imgHeight);
  heightRemaining -= pageHeight;

  while (heightRemaining > 0) {
    offset -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, offset, imgWidth, imgHeight);
    heightRemaining -= pageHeight;
  }

  return pdf.output("blob");
}
