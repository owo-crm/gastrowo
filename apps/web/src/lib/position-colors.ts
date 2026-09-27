/**
 * Categorical colors for positions, assigned in a fixed order (validated for color-blind separation).
 * A position keeps its color as long as the catalog order does not change; positions are always
 * labelled in text too, so color is never the only cue.
 */
export const POSITION_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const FALLBACK = "#6c6c70";

export function positionColor(position: string | null | undefined, ordered: string[]): string {
  if (!position) return FALLBACK;
  const index = ordered.findIndex((item) => item.toLowerCase() === position.toLowerCase());
  return index >= 0 ? POSITION_COLORS[index % POSITION_COLORS.length] : FALLBACK;
}

export function tint(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
