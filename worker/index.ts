/// <reference types="@cloudflare/workers-types" />

/** Rewrites the OG/Twitter preview tags on the two public share-link routes
 * (`/q/:token` for quotes, `/a/:token` for agreements) so a link pasted into
 * WhatsApp/Slack/etc. shows "Solar Quote"/"Service Agreement" instead of the
 * generic marketing-site preview every other route gets from index.html.
 *
 * This only distinguishes by *link type* (from the URL path), not by the
 * token's actual quote/agreement contents (customer name, amount, ...) --
 * that would need an edge-time call to the backend's GET
 * /public/quotes/{token} or /public/agreements/{token} and is deliberately
 * left out for now to keep this fast and dependency-free. If per-token
 * personalization is wanted later, add a fetch to the backend here (behind
 * a try/catch that falls back to the generic copy below on any failure --
 * a broken preview must never break the underlying page load).
 *
 * PublicQuotePage.tsx/PublicAgreementPage.tsx set the *document* title once
 * client-side JS runs, but crawlers (WhatsApp, etc.) don't execute JS -- they
 * only ever see this server-rewritten HTML, so that client-side title change
 * doesn't help the share-preview case at all. */

export interface Env {
  ASSETS: Fetcher;
}

const OG_IMAGE_PATH = "/pwa-512x512.png";
const SITE_NAME = "SolarOS";

const LINK_TYPE_COPY = {
  quote: {
    title: "Your Solar Quote — SolarOS",
    description: "View your personalized solar quote — system details, pricing, and next steps.",
  },
  agreement: {
    title: "Your Service Agreement — SolarOS",
    description: "View your service agreement — terms, payment schedule, and signature.",
  },
} as const;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ogTagsHtml(meta: { title: string; description: string; image: string; url: string }): string {
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:image" content="${escapeAttr(meta.image)}">`,
    `<meta property="og:url" content="${escapeAttr(meta.url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(meta.image)}">`,
  ].join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/(q|a)\/[^/]+\/?$/);
    const response = await env.ASSETS.fetch(request);

    if (!match || !(response.headers.get("content-type") ?? "").includes("text/html")) {
      return response;
    }

    const kind = match[1] === "q" ? "quote" : "agreement";
    const copy = LINK_TYPE_COPY[kind];
    const meta = { ...copy, image: `${url.origin}${OG_IMAGE_PATH}`, url: url.toString() };

    return new HTMLRewriter()
      .on("title", {
        element(el) {
          el.setInnerContent(meta.title);
        },
      })
      .on('meta[name="description"]', {
        element(el) {
          el.setAttribute("content", meta.description);
        },
      })
      // Remove index.html's static og:*/twitter:* defaults -- most OG
      // parsers (WhatsApp/Facebook included) use the *first* tag with a
      // given property, so leaving the generic ones in place ahead of our
      // appended ones would win over the type-specific tags below.
      .on('meta[property^="og:"], meta[name^="twitter:"]', {
        element(el) {
          el.remove();
        },
      })
      .on("head", {
        element(el) {
          el.append(ogTagsHtml(meta), { html: true });
        },
      })
      .transform(response);
  },
};
