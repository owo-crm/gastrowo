import { cn } from "@/lib/utils";

type BrandLogoProps = {
  kind?: "mark" | "wordmark";
  tone?: "light" | "dark";
  className?: string;
  alt?: string;
};

const brandAssets = {
  mark: {
    light: "/brand/white-logo-greenbackground.png",
    dark: "/brand/black-textlogo-nobackground.png",
  },
  wordmark: {
    light: "/brand/gastrowo-wordmark-2026.png",
    dark: "/brand/gastrowo-wordmark-2026.png",
  },
} as const;

export function BrandLogo({
  kind = "wordmark",
  tone = "light",
  className,
  alt = "GastrOWO",
}: BrandLogoProps) {
  return (
    <img
      src={brandAssets[kind][tone]}
      alt={alt}
      className={cn("block max-w-full object-contain", className)}
    />
  );
}
