/**
 * Build step: writes a static HTML file for every public marketing page (dist/<path>.html, the
 * landing page as dist/index.html) with its own title, description, canonical URL, FAQ schema and
 * the text in the markup, a Markdown twin of each page (<path>.md) and llms.txt for AI agents, plus
 * sitemap.xml and robots.txt. The untouched app shell becomes
 * dist/app.html and is what server.mjs serves for every app route.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

import { PRERENDERED, SITE_LINKS, SITE_URL, type SeoPage } from "./src/lib/seo-pages";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Platofy",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/platofy/platofy-icon-512.png`,
  email: "support@platofy.app",
};
const SOFTWARE = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: "Platofy",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Employee scheduling for restaurants",
  operatingSystem: "Web, iOS, Android",
  url: SITE_URL,
  description:
    "Staff scheduling for restaurants, cafés and bars: build the week from staff availability in one click, shift swaps and pickups, time clock on phone or tablet, approved hours and payroll export.",
  publisher: { "@id": `${SITE_URL}/#organization` },
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "1 location, up to 15 people" },
    { "@type": "Offer", name: "Starter", price: "26", priceCurrency: "USD", description: "Per month. 1 location, up to 30 people, auto-scheduling, overtime checks, timesheets" },
    { "@type": "Offer", name: "Pro", price: "58", priceCurrency: "USD", description: "Per month. Up to 3 locations, payroll export, labor cost %, manager permissions" },
  ],
};

/** Markdown twin of a page, for AI agents (served at <path>.md and for Accept: text/markdown). */
const HEADINGS = {
  en: { faq: "Frequently asked questions", explore: "Explore Platofy" },
  pl: { faq: "Najczęściej zadawane pytania", explore: "Platofy" },
};
const pageUrl = (path: string) => `${SITE_URL}${path === "/" ? "/" : path}`;

function markdown(page: SeoPage): string {
  const url = pageUrl(page.path);
  const text = HEADINGS[page.lang ?? "en"];
  const faq = page.faq.length ? `\n## ${text.faq}\n\n${page.faq.map((item) => `### ${item.q}\n\n${item.a}\n`).join("\n")}` : "";
  const links = SITE_LINKS.map((link) => `- [${link.label}](${SITE_URL}${link.href === "/" ? "/" : link.href})`).join("\n");
  return `# ${page.h1}\n\n> ${page.description}\n\nSource: ${url}\n\n${page.intro}\n${faq}\n## ${text.explore}\n\n${links}\n`;
}

const mdPath = (page: SeoPage) => (page.path === "/" ? "/index.md" : `${page.path}.md`);

function llmsTxt(): string {
  const section = (pages: SeoPage[]) => pages.map((page) => `- [${page.h1}](${SITE_URL}${mdPath(page)}): ${page.description}`).join("\n");
  return `# Platofy

> Platofy is staff scheduling software for restaurants, cafés and bars (1–3 locations). Staff send availability from their phone, the manager builds the week in one click and adjusts it by drag and drop, staff swap and pick up shifts with manager approval, clock in on a phone or a shared tablet with a PIN, and approved hours export to payroll.

Key facts:
- Plans: Free ($0, 1 location, up to 15 people), Starter ($26/month, 1 location, up to 30 people), Pro ($58/month, up to 3 locations, +$15 per extra location). New businesses get 30 days of Pro free.
- Live demo with a sample restaurant, no sign-up: ${SITE_URL}/demo
- Works in the browser and installs on iPhone and Android as an app. English and Polish (Polish site: ${SITE_URL}/pl).
- US labor rules (overtime over 40 h a week) and Polish rules (11 h daily and 35 h weekly rest).
- Contact: support@platofy.app

## Pages

${section(PRERENDERED)}

## Optional

- [Developers and AI agents](${SITE_URL}/developers.md): public API, OpenAPI, auth.md
- [Terms](${SITE_URL}/terms)
- [Privacy](${SITE_URL}/privacy)
`;
}

function head(page: SeoPage): string {
  const url = `${SITE_URL}${page.path === "/" ? "" : page.path}`;
  const graph = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [ORGANIZATION, { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Platofy", url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } }, SOFTWARE],
  })}</script>`;
  const faq = page.faq.length
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
      })}</script>`
    : "";
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Platofy" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}/brand/platofy/platofy-icon-512.png" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<link rel="alternate" type="text/markdown" href="${SITE_URL}${mdPath(page)}" />`,
    ...Object.entries(page.alternates ?? {}).map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${pageUrl(href)}" />`),
    ...(page.lang === "pl" ? [`<meta property="og:locale" content="pl_PL" />`] : []),
    graph,
    faq,
  ].join("\n    ");
}

function body(page: SeoPage): string {
  const text = HEADINGS[page.lang ?? "en"];
  const faq = page.faq.length
    ? `<section><h2>${text.faq}</h2>${page.faq.map((item) => `<h3>${esc(item.q)}</h3><p>${esc(item.a)}</p>`).join("")}</section>`
    : "";
  const links = SITE_LINKS.map((link) => `<li><a href="${link.href}">${esc(link.label)}</a></li>`).join("");
  // Replaced by the React app as soon as it starts; this is what crawlers and no-JS visitors read.
  return `<main style="max-width:720px;margin:0 auto;padding:40px 16px;font-family:system-ui,sans-serif;line-height:1.5"><h1>${esc(page.h1)}</h1><p>${esc(page.intro)}</p>${faq}<nav aria-label="Platofy"><h2>${text.explore}</h2><ul>${links}</ul></nav></main>`;
}

export function prerender(): Plugin {
  return {
    name: "platofy-prerender",
    apply: "build",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const shell = fs.readFileSync(path.join(dist, "index.html"), "utf8");
      fs.writeFileSync(path.join(dist, "app.html"), shell);
      const withoutTitle = shell.replace(/<title>[\s\S]*?<\/title>\s*/, "").replace(/<meta name="description"[^>]*>\s*/, "");
      for (const page of PRERENDERED) {
        const html = withoutTitle
          .replace('<html lang="en">', `<html lang="${page.lang ?? "en"}">`)
          .replace("</head>", `    ${head(page)}\n  </head>`)
          .replace('<div id="root"></div>', `<div id="root">${body(page)}</div>`);
        const file = page.path === "/" ? path.join(dist, "index.html") : path.join(dist, `${page.path}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
        fs.writeFileSync(path.join(dist, mdPath(page)), markdown(page));
      }
      fs.writeFileSync(path.join(dist, "llms.txt"), llmsTxt());
      // RFC 9727 API catalog (served by server.mjs as application/linkset+json).
      fs.mkdirSync(path.join(dist, ".well-known"), { recursive: true });
      fs.writeFileSync(
        path.join(dist, ".well-known", "api-catalog"),
        JSON.stringify(
          {
            linkset: [
              {
                anchor: "https://api.platofy.app/",
                "service-desc": [{ href: `${SITE_URL}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
                "service-doc": [{ href: `${SITE_URL}/developers.md`, type: "text/markdown" }],
                status: [{ href: "https://api.platofy.app/health", type: "application/json" }],
              },
            ],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(dist, "llms-full.txt"), [llmsTxt(), ...PRERENDERED.map(markdown)].join("\n---\n\n"));
      const today = new Date().toISOString().slice(0, 10);
      const urls = PRERENDERED.map((page) => {
        const alternates = Object.entries(page.alternates ?? {})
          .map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${pageUrl(href)}"/>`)
          .join("");
        return `  <url><loc>${pageUrl(page.path)}</loc><lastmod>${today}</lastmod>${alternates}</url>`;
      }).join("\n");
      fs.writeFileSync(
        path.join(dist, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
      );
      fs.writeFileSync(
        path.join(dist, "robots.txt"),
        [
          "# Search engines and AI assistants are welcome to read and cite the public pages.",
          "# Content signals (contentsignals.org): search=yes, ai-input=yes, ai-train=yes",
          "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
          "",
          "User-agent: *",
          "Allow: /",
          ...["/schedule", "/team", "/settings", "/overview", "/payroll", "/platform", "/kiosk", "/start", "/tasks"].map((p) => `Disallow: ${p}`),
          "",
          ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot"].flatMap((bot) => [`User-agent: ${bot}`]),
          "Allow: /",
          ...["/schedule", "/team", "/settings", "/overview", "/payroll", "/platform", "/kiosk", "/start", "/tasks"].map((p) => `Disallow: ${p}`),
          "",
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          "",
        ].join("\n"),
      );
    },
  };
}
