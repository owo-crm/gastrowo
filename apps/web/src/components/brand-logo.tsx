import { cn } from "@/lib/utils";

type BrandLogoProps = {
  kind?: "mark" | "wordmark";
  tone?: "light" | "dark";
  className?: string;
  alt?: string;
};

/**
 * Platofy: the "p" is a plate seen from above, the orange dot is the dish.
 * Sized by font size (like text), so existing `text-[…]` classes keep working.
 */
export function BrandLogo({ kind = "wordmark", tone = "light", className, alt = "Platofy" }: BrandLogoProps) {
  const src =
    kind === "mark"
      ? "/brand/platofy/platofy-icon.svg"
      : tone === "dark"
        ? "/brand/platofy/platofy-wordmark-white.svg"
        : "/brand/platofy/platofy-wordmark.svg";
  return (
    <span className={cn("inline-flex items-center align-middle leading-none", className)}>
      <img src={src} alt={alt} style={{ height: kind === "mark" ? "1.2em" : "1.35em", width: "auto" }} draggable={false} />
    </span>
  );
}
