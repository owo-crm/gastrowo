import { cn } from "@/lib/utils";

const WORKER_COLORS = ["#34D399", "#60A5FA", "#A78BFA", "#FB923C", "#F472B6", "#FBBF24", "#2DD4BF", "#F87171"];

export function getWorkerColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return WORKER_COLORS[Math.abs(hash) % WORKER_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type WorkerAvatarProps = {
  name: string;
  size?: number;
  className?: string;
};

export function WorkerAvatar({ name, size = 32, className }: WorkerAvatarProps) {
  const color = getWorkerColor(name);
  const initials = getInitials(name);

  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full border-2 font-bold tracking-[-0.02em]", className)}
      style={{
        width: size,
        height: size,
        color,
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        fontSize: Math.max(11, Math.floor(size * 0.38)),
        lineHeight: 1,
      }}
      aria-hidden="true"
      title={name}
    >
      {initials}
    </div>
  );
}

