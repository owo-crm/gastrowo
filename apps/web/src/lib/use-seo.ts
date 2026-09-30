import { useEffect } from "react";

import { SITE_URL, type SeoPage } from "@/lib/seo-pages";

function setMeta(selector: string, create: () => HTMLElement, apply: (element: HTMLElement) => void) {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  apply(element);
}

/** Title, description and canonical URL while a public page is open (the prerendered HTML has them too). */
export function useSeo(page: SeoPage) {
  useEffect(() => {
    const previous = document.title;
    document.title = page.title;
    setMeta('meta[name="description"]', () => Object.assign(document.createElement("meta"), { name: "description" }), (element) => element.setAttribute("content", page.description));
    setMeta('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), (element) => element.setAttribute("href", `${SITE_URL}${page.path === "/" ? "" : page.path}`));
    return () => {
      document.title = previous;
    };
  }, [page]);
}
