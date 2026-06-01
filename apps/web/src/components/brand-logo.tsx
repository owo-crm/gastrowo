import { cn } from "@/lib/utils";

type BrandLogoProps = {
  kind?: "mark" | "wordmark";
  tone?: "light" | "dark";
  className?: string;
  alt?: string;
};

export function BrandLogo({
  kind = "wordmark",
  className,
  alt = "Gastrostuff",
}: BrandLogoProps) {
  if (kind === "mark") {
    return (
      <span
        aria-label={alt}
        role="img"
        className={cn("inline-flex items-center justify-center align-middle font-['Story_Script'] text-[1.75rem] leading-none tracking-[-0.04em]", className)}
      >
        <span className="text-[#16a34a]">g</span>
        <span className="ml-[-0.2em] text-[#2563eb]">s</span>
      </span>
    );
  }

  return (
    <span
      aria-label={alt}
      role="img"
      className={cn("inline-flex items-center justify-center text-center align-middle font-['Story_Script'] leading-none tracking-[-0.04em]", className)}
    >
      <span className="text-[#16a34a]">gastro</span>
      <span className="text-[#2563eb]">stuff</span>
    </span>
  );
}
