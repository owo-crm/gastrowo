import { CalendarDays, FileText, FileWarning, StickyNote, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PreviewItem = {
  id: string;
  title: string;
  description: string;
  author: string;
  date: string;
  type: "note" | "document" | "reminder";
  tone: string;
};

const previewItems: PreviewItem[] = [
  {
    id: "bulk-order",
    title: "Bulk order discount",
    description: "Vendor offers a 5% discount above 5,000 PLN. Recommended for monthly produce consolidation.",
    author: "Marta Manager",
    date: "12 May 2026 - 11:00",
    type: "note",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    id: "payment-followup",
    title: "Payment follow-up",
    description: "BILL-1022 still needs a confirmation call before the next due date window closes.",
    author: "Finance Team",
    date: "11 May 2026 - 16:10",
    type: "reminder",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    id: "vendor-note",
    title: "Preferred vendor note",
    description: "Primary supplier for raw ingredients. Standard lead time remains two to three business days.",
    author: "Admin",
    date: "09 May 2026 - 13:45",
    type: "note",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    id: "agreement",
    title: "Agreement.pdf",
    description: "Kitchen equipment maintenance agreement. Renewal terms should be reviewed before next month.",
    author: "Admin",
    date: "28 Apr 2026",
    type: "document",
    tone: "bg-rose-50 text-rose-700",
  },
];

function previewIcon(type: PreviewItem["type"]) {
  if (type === "document") return FileText;
  if (type === "reminder") return FileWarning;
  return StickyNote;
}

export function NotesDocumentsPage() {
  return (
    <AppShell
      title="Notes & Documents"
      subtitle="Shared notes, vendor context, and document previews for the workspace."
      action={<Badge className="border-slate-300 bg-slate-100 text-slate-700">Preview</Badge>}
    >
      <div className="relative overflow-hidden rounded-[2rem]">
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.7fr] opacity-45">
          <Card className="bg-[linear-gradient(145deg,#ffffff,#edf4ff)]">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Workspace preview</p>
                <h2 className="mt-3 text-3xl font-bold tracking-[-0.05em] text-[var(--color-heading)]">Structured vendor and operations knowledge.</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                  This screen is reserved for shared notes, agreements, supplier reminders, and internal documents.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-[1.25rem] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Draft notes</p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.05em] text-[var(--color-heading)]">18</p>
                </div>
                <div className="rounded-[1.25rem] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Documents</p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.05em] text-[var(--color-heading)]">6</p>
                </div>
                <div className="rounded-[1.25rem] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Pending follow-ups</p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.05em] text-[var(--color-heading)]">3</p>
                </div>
              </div>
            </div>
          </Card>

          <section className="grid gap-4 md:grid-cols-2">
            {previewItems.map((item) => {
              const Icon = previewIcon(item.type);
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[1.35rem] border border-[var(--color-border)] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex min-h-[166px] gap-4 px-5 py-5">
                    <div className={`grid size-12 shrink-0 place-items-center rounded-[1rem] ${item.tone}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-divider)] px-5 py-3 text-sm text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-4" /> {item.author}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" /> {item.date}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        <div className="absolute inset-0 grid place-items-center rounded-[2rem] bg-slate-950/56 backdrop-blur-[2px]">
          <div className="max-w-xl px-6 text-center text-white">
            <Badge className="border-white/18 bg-white/12 text-white">Preview only</Badge>
            <h2 className="mt-5 text-4xl font-bold tracking-[-0.05em]">In development</h2>
            <p className="mt-3 text-sm leading-6 text-white/72">
              Notes, documents, and shared internal context will be unlocked in a later iteration. This tab is visible now only as a product preview.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
