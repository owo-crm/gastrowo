/** Polish visitors get the Polish documents; everyone else the English ones. */
export function legalLinks(lang: string) {
  return lang === "pl"
    ? { terms: "/regulamin", privacy: "/polityka-prywatnosci", cookies: "/polityka-cookies" }
    : { terms: "/terms", privacy: "/privacy", cookies: "/cookies" };
}
