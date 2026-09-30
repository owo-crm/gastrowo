import { useState, type FormEvent } from "react";
import { ArrowRight, Check, FileUp, MessageCircle, Sparkles } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Container, Faq, MarketingShell, PageHero, PlatofyCta } from "@/components/marketing-shell";
import { api } from "@/lib/api";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { COMPARE_PAGES, COMPETITORS, SWITCH_PAGE } from "@/lib/seo-pages";
import { useSeo } from "@/lib/use-seo";
import { cn } from "@/lib/utils";

/**
 * "X alternative" pages and the free switch-over form. Claims about competitors stay general
 * (how they charge, whether there's a free plan); the detail is about what Platofy does.
 */

const PLATOFY_ROWS: Array<{ label: string; platofy: string; competitor: (name: string, pricing: string, free: string) => string }> = [
  { label: "How you pay", platofy: "Flat price per location, never per person", competitor: (_n, pricing) => pricing },
  { label: "Free plan", platofy: "Free forever for 1 location, up to 15 people", competitor: (_n, _p, free) => free },
  { label: "Paid plans", platofy: "$26/month (Starter) · $58/month for up to 3 locations (Pro)", competitor: (name) => `See the ${name} pricing page` },
  { label: "Trial", platofy: "30 days of Pro, no card", competitor: () => "Varies by plan" },
  { label: "Switching help", platofy: "We move your team and templates for free", competitor: () => "—" },
];

const FEATURES = [
  "Week built from staff availability, positions and priorities in about 2 minutes",
  "Schedule on every phone, no app download",
  "Shift swaps, pickups and time off with one-tap approval",
  "Time clock on a phone or a shared tablet with PINs",
  "Timesheets: approve only the exceptions",
  "Labor cost % against sales every day",
  "Payroll export of approved hours",
  "Warning before a shift pushes someone past 40 hours",
];

export function ComparePage() {
  const { slug } = useParams();
  const competitor = COMPETITORS.find((item) => item.slug === slug) ?? COMPETITORS[0];
  const page = COMPARE_PAGES.find((item) => item.path === `/compare/${competitor.slug}`) ?? COMPARE_PAGES[0];
  useSeo(page);

  return (
    <MarketingShell>
      <PageHero eyebrow={`${competitor.name} alternative`} title={page.h1} intro={page.intro}>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to={`/switch?from=${competitor.slug}`}
            onClick={() => trackMarketingEvent("switch_cta_click", { from: competitor.slug, context: "compare-hero" })}
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-strong)] px-6 text-[17px] font-semibold text-white"
          >
            Switch for free <ArrowRight className="size-5" />
          </Link>
          <Link to="/demo" className="inline-flex min-h-[50px] items-center justify-center rounded-[12px] bg-[var(--color-fill)] px-6 text-[17px] font-semibold text-black">
            Try the live demo
          </Link>
        </div>
      </PageHero>

      <Container>
        <div className="overflow-x-auto rounded-[20px] ring-1 ring-[var(--color-separator)]">
          <table className="w-full min-w-[600px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-[var(--color-grouped)] text-left">
                <th className="px-4 py-3 font-semibold text-[var(--color-text-muted)]" />
                <th className="px-4 py-3 text-[17px] font-bold text-[var(--color-primary-strong)]">Platofy</th>
                <th className="px-4 py-3 text-[17px] font-bold">{competitor.name}</th>
              </tr>
            </thead>
            <tbody>
              {PLATOFY_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-[var(--color-separator)] align-top">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">{row.label}</th>
                  <td className="px-4 py-3">{row.platofy}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{row.competitor(competitor.name, competitor.pricing, competitor.freePlan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
          {competitor.name} details are summarized from its public website and may change; check the {competitor.name} website for current plans and prices.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] bg-[var(--color-grouped)] p-6">
            <h2 className="text-[22px] font-bold">What you get with Platofy</h2>
            <ul className="mt-3 space-y-2">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex gap-2 text-[16px] leading-6">
                  <Check className="mt-0.5 size-5 shrink-0 text-[var(--color-success)]" strokeWidth={3} /> {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[20px] bg-[var(--color-grouped)] p-6">
            <h2 className="text-[22px] font-bold">Which one fits you?</h2>
            <p className="mt-3 text-[16px] leading-6 text-[var(--color-text-muted)]">
              <span className="font-semibold text-black">{competitor.name}</span> can be a good fit for {competitor.bestFor.charAt(0).toLowerCase() + competitor.bestFor.slice(1)}.
            </p>
            <p className="mt-3 text-[16px] leading-6 text-[var(--color-text-muted)]">
              <span className="font-semibold text-black">Platofy</span> fits independent restaurants, cafés and bars with 5–50 people that want the weekly schedule done in minutes, one simple price per location, and a real person to set it up with them.
            </p>
            <Link to={`/switch?from=${competitor.slug}`} className="mt-5 inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
              We'll move you over for free <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        <p className="mt-8 text-[15px] text-[var(--color-text-muted)]">
          Also comparing:{" "}
          {COMPETITORS.filter((item) => item.slug !== competitor.slug).map((item, index) => (
            <span key={item.slug}>
              {index ? " · " : ""}
              <Link to={`/compare/${item.slug}`} className="font-semibold text-[var(--color-primary-strong)]">Platofy vs {item.name}</Link>
            </span>
          ))}
        </p>
      </Container>

      <PlatofyCta context={`compare-${competitor.slug}`} title={`Try Platofy next to ${competitor.name} for a week`} body="Build one week in Platofy while your current tool keeps running. Free for one location, and 30 days of Pro with no card." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

const TOOLS = ["7shifts", "Homebase", "When I Work", "Sling", "Excel / Google Sheets", "Paper or whiteboard", "Something else"];
const SIZES = ["1–10", "11–25", "26–50", "51–100", "100+"];

export function SwitchPage() {
  useSeo(SWITCH_PAGE);
  const [params] = useSearchParams();
  const from = COMPETITORS.find((item) => item.slug === params.get("from"))?.name ?? "";
  const [form, setForm] = useState({ name: "", email: "", business: "", current_tool: from || TOOLS[0], team_size: SIZES[1], message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState("sending");
    try {
      await api.submitLead({ ...form, kind: "migration", source: params.get("from") ? `compare-${params.get("from")}` : "switch" });
      trackMarketingEvent("switch_request", { from: form.current_tool });
      setState("done");
    } catch {
      setState("error");
    }
  };
  const field = "min-h-[50px] w-full rounded-[12px] bg-[var(--color-fill)] px-4 text-[17px] outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]";

  return (
    <MarketingShell>
      <PageHero eyebrow="Free switch-over" title={SWITCH_PAGE.h1} intro={SWITCH_PAGE.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <ol className="space-y-3">
            {[
              [FileUp, "Send what you have", "An export from your current tool, a spreadsheet, or a photo of this week's schedule."],
              [Sparkles, "We set it up", "Team, positions, pay rates and shift templates, ready in about a day."],
              [MessageCircle, "You invite the team", "One tap sends everyone an invite. We stay on chat for anything you need."],
            ].map(([Icon, title, body], index) => {
              const StepIcon = Icon as typeof FileUp;
              return (
                <li key={title as string} className="flex gap-4 rounded-[20px] bg-[var(--color-grouped)] p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[var(--color-primary-strong)]">
                    <StepIcon className="size-5" />
                  </span>
                  <span>
                    <span className="text-[13px] font-bold text-[var(--color-primary-strong)]">STEP {index + 1}</span>
                    <span className="block text-[18px] font-semibold">{title as string}</span>
                    <span className="block text-[15px] leading-6 text-[var(--color-text-muted)]">{body as string}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="rounded-[24px] p-5 ring-1 ring-[var(--color-separator)] sm:p-7">
            {state === "done" ? (
              <div className="py-10 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--color-success-fill)] text-[var(--color-success)]">
                  <Check className="size-7" strokeWidth={3} />
                </span>
                <h2 className="mt-4 text-[24px] font-bold">Got it, thanks!</h2>
                <p className="mx-auto mt-2 max-w-sm text-[16px] text-[var(--color-text-muted)]">
                  Check your inbox: reply to our email with your export or a photo of the schedule, and we'll take it from there.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h2 className="text-[22px] font-bold">Tell us about your restaurant</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required placeholder="Your name" value={form.name} onChange={set("name")} className={field} aria-label="Your name" />
                  <input required type="email" placeholder="you@restaurant.com" value={form.email} onChange={set("email")} className={field} aria-label="Email" />
                </div>
                <input required placeholder="Restaurant name" value={form.business} onChange={set("business")} className={field} aria-label="Restaurant name" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Scheduling today with</span>
                    <select value={form.current_tool} onChange={set("current_tool")} className={field}>
                      {TOOLS.map((tool) => <option key={tool}>{tool}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Team size</span>
                    <select value={form.team_size} onChange={set("team_size")} className={field}>
                      {SIZES.map((size) => <option key={size}>{size}</option>)}
                    </select>
                  </label>
                </div>
                <textarea placeholder="Anything we should know? (optional)" value={form.message} onChange={set("message")} rows={3} className={cn(field, "py-3")} aria-label="Message" />
                <input tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={set("website")} name="website" className="hidden" />
                <button type="submit" disabled={state === "sending"} className="min-h-[52px] w-full rounded-[12px] bg-[var(--color-primary-strong)] text-[17px] font-semibold text-white disabled:opacity-60">
                  {state === "sending" ? "Sending…" : "Move me over for free"}
                </button>
                {state === "error" ? <p className="text-[14px] text-[var(--color-danger)]">Couldn't send. Try again, or email support@platofy.app.</p> : null}
                <p className="text-[13px] text-[var(--color-text-muted)]">We'll email you once, about your switch-over. No spam.</p>
              </form>
            )}
          </div>
        </div>
      </Container>
      <Faq items={SWITCH_PAGE.faq} />
    </MarketingShell>
  );
}
