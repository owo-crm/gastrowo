/**
 * Build step: writes a static HTML file for every public marketing page (dist/<path>.html, the
 * landing page as dist/index.html) with its own title, description, canonical URL, FAQ schema and
 * the text in the markup, plus sitemap.xml and robots.txt. The untouched app shell becomes
 * dist/app.html and is what server.mjs serves for every app route.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

import { PRERENDERED, SITE_LINKS, SITE_URL, type SeoPage } from "./src/lib/seo-pages";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function head(page: SeoPage): string {
  const url = `${SITE_URL}${page.path === "/" ? "" : page.path}`;
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
    faq,
  ].join("\n    ");
}

function body(page: SeoPage): string {
  const faq = page.faq.length
    ? `<section><h2>Frequently asked questions</h2>${page.faq.map((item) => `<h3>${esc(item.q)}</h3><p>${esc(item.a)}</p>`).join("")}</section>`
    : "";
  const links = SITE_LINKS.map((link) => `<li><a href="${link.href}">${esc(link.label)}</a></li>`).join("");
  // Replaced by the React app as soon as it starts; this is what crawlers and no-JS visitors read.
  return `<main style="max-width:720px;margin:0 auto;padding:40px 16px;font-family:system-ui,sans-serif;line-height:1.5"><h1>${esc(page.h1)}</h1><p>${esc(page.intro)}</p>${faq}<nav aria-label="Platofy"><h2>Explore Platofy</h2><ul>${links}</ul></nav></main>`;
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
          .replace("</head>", `    ${head(page)}\n  </head>`)
          .replace('<div id="root"></div>', `<div id="root">${body(page)}</div>`);
        const file = page.path === "/" ? path.join(dist, "index.html") : path.join(dist, `${page.path}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
      }
      const today = new Date().toISOString().slice(0, 10);
      const urls = PRERENDERED.map((page) => `  <url><loc>${SITE_URL}${page.path === "/" ? "/" : page.path}</loc><lastmod>${today}</lastmod></url>`).join("\n");
      fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      fs.writeFileSync(
        path.join(dist, "robots.txt"),
        `User-agent: *\nAllow: /\nDisallow: /schedule\nDisallow: /team\nDisallow: /settings\nDisallow: /overview\nDisallow: /payroll\nDisallow: /platform\nDisallow: /kiosk\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      );
    },
  };
}
