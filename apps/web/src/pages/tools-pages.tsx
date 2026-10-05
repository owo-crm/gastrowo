import { useMemo, useState } from "react";
import { Calculator, ChefHat, Clock3, Coins, Download, FileSpreadsheet, Percent, Plus, Scale, Tag, Timer, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Container, Faq, LeadForm, MarketingShell, NumberField, PageHero, PlatofyCta, num, usd } from "@/components/marketing-shell";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { TOOLS_HUB, seoPage } from "@/lib/seo-pages";
import { useSeo } from "@/lib/use-seo";
import { cn } from "@/lib/utils";

/** Free tools for restaurant managers: public, no sign-up, each ends with a Platofy pitch. */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[20px] bg-[var(--color-grouped)] p-5 sm:p-6", className)}>{children}</div>;
}

function Result({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-separator)] py-2.5 last:border-0">
      <span className="text-[16px] text-[var(--color-text-muted)]">
        {label}
        {hint ? <span className="block text-[13px] text-[var(--color-text-tertiary)]">{hint}</span> : null}
      </span>
      <span className={cn("tabular-nums", strong ? "text-[26px] font-bold text-black" : "text-[18px] font-semibold text-black")}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Hub

const TOOLS = [
  { to: "/tools/restaurant-schedule-template", icon: FileSpreadsheet, title: "Restaurant schedule template", body: "Weekly staff schedule for Excel and Google Sheets. Hours and labor cost add up on their own." },
  { to: "/tools/labor-cost-calculator", icon: Calculator, title: "Labor cost calculator", body: "Labor cost and labor % of sales, with payroll taxes and benchmarks." },
  { to: "/tools/overtime-calculator", icon: Clock3, title: "Overtime calculator", body: "Weekly overtime (federal) and daily overtime and double time (California)." },
  { to: "/tools/tip-pool-calculator", icon: Coins, title: "Tip pool calculator", body: "Split tips by hours, by role points or equally, with each person's payout." },
  { to: "/tools/time-card-calculator", icon: Timer, title: "Time card calculator", body: "Clock-in and clock-out times with breaks to weekly hours, overtime and pay." },
  { to: "/tools/food-cost-calculator", icon: ChefHat, title: "Food cost calculator", body: "Plate cost and food cost % for a dish, or for a week from inventory." },
  { to: "/tools/menu-price-calculator", icon: Tag, title: "Menu price calculator", body: "The menu price for a target food cost %, rounded to a menu-friendly number." },
  { to: "/tools/prime-cost-calculator", icon: Percent, title: "Prime cost calculator", body: "Food, drinks and labor as a % of sales, against the 60% benchmark." },
  { to: "/tools/restaurant-break-even-calculator", icon: Scale, title: "Break-even calculator", body: "The sales and guests per day you need to cover your costs." },
];

export function ToolsHubPage() {
  useSeo(TOOLS_HUB);
  return (
    <MarketingShell>
      <PageHero eyebrow="Free tools" title={TOOLS_HUB.h1} intro={TOOLS_HUB.intro} />
      <Container>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link key={tool.to} to={tool.to} className="group rounded-[20px] bg-[var(--color-grouped)] p-6 transition hover:bg-[var(--color-accent)]">
              <tool.icon className="size-8 text-[var(--color-primary-strong)]" />
              <h2 className="mt-3 text-[21px] font-bold tracking-[-0.01em] group-hover:text-[var(--color-primary-strong)]">{tool.title}</h2>
              <p className="mt-1 text-[16px] leading-6 text-[var(--color-text-muted)]">{tool.body}</p>
            </Link>
          ))}
        </div>
      </Container>
      <PlatofyCta context="tools-hub" title="Or let Platofy do the weekly math" body="Schedules, hours, labor % and payroll exports update themselves as your team clocks in." />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Schedule template

const PREVIEW_ROWS = [
  { name: "Maria Lopez", role: "Server", shifts: ["11a–4p", "11a–4p", "", "4p–11p", "4p–11p", "4p–11:30p", ""], hours: 31.5 },
  { name: "Jake Chen", role: "Line cook", shifts: ["", "10a–6p", "10a–6p", "10a–6p", "3p–11p", "3p–11p", ""], hours: 40 },
  { name: "Leo Martins", role: "Bartender", shifts: ["", "", "5p–1a", "5p–1a", "5p–2a", "5p–2a", "12p–8p"], hours: 42 },
];

export function ScheduleTemplatePage() {
  const page = seoPage("/tools/restaurant-schedule-template");
  useSeo(page);
  const download = (format: string) => trackMarketingEvent("template_download", { format });
  return (
    <MarketingShell>
      <PageHero eyebrow="Free template" title={page.h1} intro={page.intro}>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href="/tools/restaurant-schedule-template.xlsx"
            download
            onClick={() => download("xlsx")}
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-strong)] px-6 text-[17px] font-semibold text-white"
          >
            <Download className="size-5" /> Download for Excel (.xlsx)
          </a>
          <a
            href="/tools/restaurant-schedule-template.csv"
            download
            onClick={() => download("csv")}
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-fill)] px-6 text-[17px] font-semibold text-black"
          >
            <Download className="size-5" /> CSV for Google Sheets
          </a>
        </div>
        <p className="mt-3 text-[14px] text-[var(--color-text-muted)]">Free, no sign-up. In Google Sheets: File → Import → upload the .xlsx to keep the formulas.</p>
      </PageHero>

      <Container>
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-[var(--color-primary-strong)] text-white">
                <th className="px-3 py-2.5 text-left font-semibold">Employee</th>
                {DAYS.map((day) => (
                  <th key={day} className="px-2 py-2.5 font-semibold">{day}</th>
                ))}
                <th className="px-3 py-2.5 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_ROWS.map((row) => (
                <tr key={row.name} className="border-b border-[var(--color-separator)] bg-white">
                  <td className="px-3 py-2.5">
                    <span className="block font-semibold">{row.name}</span>
                    <span className="text-[12px] text-[var(--color-text-muted)]">{row.role}</span>
                  </td>
                  {row.shifts.map((shift, index) => (
                    <td key={index} className="px-2 py-2.5 text-center tabular-nums">{shift || <span className="text-[var(--color-text-tertiary)]">off</span>}</td>
                  ))}
                  <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{row.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">Preview of the template with example shifts. Late shifts past midnight are counted correctly.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="text-[21px] font-bold">What's inside</h2>
            <ul className="mt-3 space-y-2 text-[16px] leading-6 text-[var(--color-text-muted)]">
              <li>• In and out times for every day, one row per person, room for 20 people</li>
              <li>• Hours per person, hours per day and weekly totals, calculated for you</li>
              <li>• Labor cost from each person's hourly rate</li>
              <li>• Labor cost as a % of your sales forecast</li>
              <li>• Prints on one landscape page</li>
            </ul>
          </Card>
          <Card>
            <h2 className="text-[21px] font-bold">Get it by email</h2>
            <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">We'll send both files so you have them at work, plus a couple of scheduling tips. No spam.</p>
            <LeadForm kind="template" source="schedule-template" button="Email it to me" done="Sent! Check your inbox." className="mt-4" />
          </Card>
        </div>

        <section className="mt-10">
          <h2 className="text-[28px] font-bold tracking-[-0.02em]">How to use the template</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Set the week", "Enter your restaurant name and the Monday of the week. Day headers update themselves."],
              ["Add your team", "Name, position and hourly rate for each person. Delete the example rows."],
              ["Type the shifts", "In and out times like 9:00 AM or 17:30. Hours and labor cost fill in as you go."],
            ].map(([title, body], index) => (
              <li key={title} className="rounded-[20px] border border-[var(--color-separator)] p-5">
                <span className="grid size-8 place-items-center rounded-full bg-[var(--color-accent)] font-bold text-[var(--color-primary-strong)]">{index + 1}</span>
                <h3 className="mt-3 text-[18px] font-semibold">{title}</h3>
                <p className="mt-1 text-[15px] leading-6 text-[var(--color-text-muted)]">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </Container>

      <PlatofyCta
        context="schedule-template"
        title="Done copying last week's schedule by hand?"
        body="Platofy builds the week from your team's availability in about two minutes, sends it to everyone's phone and keeps swaps and time off in one place."
      />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Labor cost

type LaborRow = { role: string; hours: string; rate: string };

export function LaborCostPage() {
  const page = seoPage("/tools/labor-cost-calculator");
  useSeo(page);
  const [sales, setSales] = useState("28000");
  const [burden, setBurden] = useState("10");
  const [rows, setRows] = useState<LaborRow[]>([
    { role: "Servers", hours: "160", rate: "12" },
    { role: "Kitchen", hours: "180", rate: "19" },
    { role: "Bar", hours: "70", rate: "14" },
    { role: "Managers", hours: "90", rate: "25" },
  ]);
  const wages = rows.reduce((sum, row) => sum + num(row.hours) * num(row.rate), 0);
  const labor = wages * (1 + num(burden) / 100);
  const hours = rows.reduce((sum, row) => sum + num(row.hours), 0);
  const pct = num(sales) ? (labor / num(sales)) * 100 : 0;
  const band = pct === 0 ? null : pct < 25 ? { label: "Lean", tone: "text-[var(--color-success)]", body: "Below the usual 25–35% range. Check that service isn't stretched thin at peak times." } : pct <= 35 ? { label: "Typical", tone: "text-[var(--color-primary-strong)]", body: "Within the 25–35% range many full-service restaurants aim for." } : { label: "High", tone: "text-[var(--color-warning)]", body: "Above 35%. Look at slow hours, overtime and shifts that start before the rush." };
  const update = (index: number, patch: Partial<LaborRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <h2 className="text-[19px] font-bold">Hours and wages</h2>
            <div className="mt-3 space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1.3fr_1fr_1fr_auto] items-end gap-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Role</span>
                    <input value={row.role} onChange={(event) => update(index, { role: event.target.value })} className="min-h-[48px] w-full rounded-[12px] bg-[var(--color-fill)] px-3 text-[17px] outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]" />
                  </label>
                  <NumberField label="Hours" value={row.hours} onChange={(hours) => update(index, { hours })} />
                  <NumberField label="Rate" prefix="$" value={row.rate} onChange={(rate) => update(index, { rate })} />
                  <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${row.role}`} className="grid min-h-[48px] w-10 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                    <Trash2 className="size-5" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setRows((current) => [...current, { role: "", hours: "", rate: "" }])} className="mt-3 inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
              <Plus className="size-5" /> Add a role
            </button>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <NumberField label="Sales for the same period" prefix="$" value={sales} onChange={setSales} />
              <NumberField label="Payroll taxes & benefits" suffix="% of wages" value={burden} onChange={setBurden} />
            </div>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">Result</h2>
            <div className="mt-2">
              <Result label="Labor cost %" value={`${pct.toFixed(1)}%`} strong />
              <Result label="Total labor cost" value={usd(labor)} hint="Wages plus taxes and benefits" />
              <Result label="Wages" value={usd(wages)} />
              <Result label="Hours" value={hours.toLocaleString("en-US")} />
              <Result label="Average cost per hour" value={hours ? usd(labor / hours) : "—"} />
            </div>
            {band ? (
              <p className="mt-4 rounded-[14px] bg-[var(--color-grouped)] p-3 text-[15px] leading-6">
                <span className={cn("font-bold", band.tone)}>{band.label}.</span> {band.body}
              </p>
            ) : null}
          </Card>
        </div>
      </Container>
      <PlatofyCta context="labor-calculator" title="See labor % every day, not once a month" body="Platofy compares scheduled and clocked hours with your sales automatically, so you can fix a slow Tuesday before payroll." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Overtime

type Rule = "federal" | "california";

/** Regular, overtime (1.5×) and double time (2×) hours for one workweek. */
export function overtimeHours(days: number[], rule: Rule): { regular: number; overtime: number; double: number } {
  const total = days.reduce((sum, hours) => sum + hours, 0);
  if (rule === "federal") return { regular: Math.min(total, 40), overtime: Math.max(total - 40, 0), double: 0 };
  const workedAll7 = days.every((hours) => hours > 0);
  let regular = 0;
  let overtime = 0;
  let double = 0;
  days.forEach((hours, index) => {
    if (workedAll7 && index === 6) {
      // Seventh consecutive day: first 8 hours at 1.5×, the rest at 2×.
      overtime += Math.min(hours, 8);
      double += Math.max(hours - 8, 0);
      return;
    }
    regular += Math.min(hours, 8);
    overtime += Math.min(Math.max(hours - 8, 0), 4);
    double += Math.max(hours - 12, 0);
  });
  // Weekly rule: regular hours past 40 become overtime (hours already paid as overtime aren't counted twice).
  if (regular > 40) {
    overtime += regular - 40;
    regular = 40;
  }
  return { regular, overtime, double };
}

export function OvertimePage() {
  const page = seoPage("/tools/overtime-calculator");
  useSeo(page);
  const [rate, setRate] = useState("18");
  const [rule, setRule] = useState<Rule>("federal");
  const [days, setDays] = useState(["9", "9", "8", "10", "11", "0", "0"]);
  const hours = days.map(num);
  const result = useMemo(() => overtimeHours(hours, rule), [hours.join(","), rule]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = num(rate);
  const pay = base * result.regular + base * 1.5 * result.overtime + base * 2 * result.double;

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Hourly rate" prefix="$" value={rate} onChange={setRate} />
              <div role="group" aria-label="Overtime rules">
                <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Rules</span>
                <span className="flex min-h-[48px] rounded-[12px] bg-[var(--color-fill)] p-1">
                  {(["federal", "california"] as Rule[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={rule === value}
                      onClick={() => setRule(value)}
                      className={cn("flex-1 rounded-[9px] text-[15px] font-semibold", rule === value ? "bg-white text-black shadow-sm" : "text-[var(--color-text-muted)]")}
                    >
                      {value === "federal" ? "Federal (FLSA)" : "California"}
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <h2 className="mt-5 text-[17px] font-bold">Hours worked each day</h2>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DAYS.map((day, index) => (
                <NumberField key={day} label={day} value={days[index]} onChange={(value) => setDays((current) => current.map((item, i) => (i === index ? value : item)))} />
              ))}
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
              {rule === "federal" ? "Federal law: 1.5× for hours over 40 in the workweek. No daily overtime." : "California: 1.5× after 8 hours a day and 2× after 12; on a 7th consecutive day 1.5× for the first 8 hours and 2× after; plus weekly overtime over 40 regular hours."}
            </p>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">This week</h2>
            <div className="mt-2">
              <Result label="Total pay" value={usd(pay)} strong />
              <Result label="Regular hours" value={result.regular.toFixed(2).replace(/\.00$/, "")} hint={usd(base * result.regular)} />
              <Result label="Overtime hours (1.5×)" value={result.overtime.toFixed(2).replace(/\.00$/, "")} hint={usd(base * 1.5 * result.overtime)} />
              <Result label="Double time hours (2×)" value={result.double.toFixed(2).replace(/\.00$/, "")} hint={usd(base * 2 * result.double)} />
              <Result label="Cost of overtime" value={usd(base * 0.5 * result.overtime + base * result.double)} hint="What the premium adds over straight time" />
            </div>
            <p className="mt-4 text-[13px] leading-5 text-[var(--color-text-muted)]">An estimate, not legal advice. Tipped employees, bonuses and local laws can change the math.</p>
          </Card>
        </div>
      </Container>
      <PlatofyCta context="overtime-calculator" title="Catch overtime before you publish the schedule" body="Platofy warns you when a shift would push someone past 40 hours, while you're still building the week." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Tip pool

type Method = "hours" | "points" | "equal";
type TipRow = { name: string; hours: string; points: string };

export function tipShares(total: number, rows: Array<{ hours: number; points: number }>, method: Method): number[] {
  const weights = rows.map((row) => (method === "equal" ? 1 : method === "hours" ? row.hours : row.hours * row.points));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => (sum ? (total * weight) / sum : 0));
}

export function TipPoolPage() {
  const page = seoPage("/tools/tip-pool-calculator");
  useSeo(page);
  const [total, setTotal] = useState("1850");
  const [method, setMethod] = useState<Method>("hours");
  const [rows, setRows] = useState<TipRow[]>([
    { name: "Maria (server)", hours: "32", points: "10" },
    { name: "Sam (server)", hours: "28", points: "10" },
    { name: "Leo (bartender)", hours: "30", points: "10" },
    { name: "Ava (busser)", hours: "24", points: "5" },
    { name: "Noah (host)", hours: "20", points: "4" },
  ]);
  const shares = tipShares(num(total), rows.map((row) => ({ hours: num(row.hours), points: num(row.points) })), method);
  const totalHours = rows.reduce((sum, row) => sum + num(row.hours), 0);
  const update = (index: number, patch: Partial<TipRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Total tips to split" prefix="$" value={total} onChange={setTotal} />
            <div role="group" aria-label="How to split">
              <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Split</span>
              <span className="flex min-h-[48px] rounded-[12px] bg-[var(--color-fill)] p-1">
                {([["hours", "By hours"], ["points", "By points"], ["equal", "Equally"]] as Array<[Method, string]>).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={cn("flex-1 rounded-[9px] text-[15px] font-semibold", method === value ? "bg-white text-black shadow-sm" : "text-[var(--color-text-muted)]")}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-[var(--color-text-muted)]">
                  <th className="pb-2 font-semibold">Person</th>
                  <th className="pb-2 font-semibold">Hours</th>
                  {method === "points" ? <th className="pb-2 font-semibold">Points / hour</th> : null}
                  <th className="pb-2 text-right font-semibold">Takes home</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className="py-1 pr-2">
                      <input value={row.name} onChange={(event) => update(index, { name: event.target.value })} aria-label="Name" className="min-h-[44px] w-full rounded-[10px] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]" />
                    </td>
                    <td className="w-24 py-1 pr-2">
                      <input type="number" min={0} inputMode="decimal" value={row.hours} onChange={(event) => update(index, { hours: event.target.value })} aria-label="Hours" className="min-h-[44px] w-full rounded-[10px] bg-white px-3 tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]" />
                    </td>
                    {method === "points" ? (
                      <td className="w-28 py-1 pr-2">
                        <input type="number" min={0} inputMode="decimal" value={row.points} onChange={(event) => update(index, { points: event.target.value })} aria-label="Points" className="min-h-[44px] w-full rounded-[10px] bg-white px-3 tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]" />
                      </td>
                    ) : null}
                    <td className="py-1 text-right text-[17px] font-bold tabular-nums">{usd(shares[index] ?? 0)}</td>
                    <td className="w-10 py-1 text-right">
                      <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${row.name}`} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setRows((current) => [...current, { name: "", hours: "", points: "5" }])} className="mt-3 inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
            <Plus className="size-5" /> Add a person
          </button>
          <p className="mt-4 text-[15px] text-[var(--color-text-muted)]">
            {method === "hours" && totalHours ? `Everyone earns ${usd(num(total) / totalHours)} per hour worked from the pool.` : null}
            {method === "points" ? "Each share = points per hour × hours, divided by the team's total points." : null}
            {method === "equal" && rows.length ? `Everyone takes home ${usd(num(total) / rows.length)}.` : null}
          </p>
        </Card>
      </Container>
      <PlatofyCta context="tip-pool" title="Hours for the tip pool, already counted" body="Platofy records every clock-in, so the hours you split tips by come straight from the time clock, approved and ready for payroll." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared pieces for the cost calculators

const pct1 = (value: number) => `${value.toFixed(1)}%`;

function Verdict({ tone, label, children }: { tone: "good" | "ok" | "high"; label: string; children: React.ReactNode }) {
  const color = tone === "good" ? "text-[var(--color-success)]" : tone === "ok" ? "text-[var(--color-primary-strong)]" : "text-[var(--color-warning)]";
  return (
    <p className="mt-4 rounded-[14px] bg-[var(--color-grouped)] p-3 text-[15px] leading-6">
      <span className={cn("font-bold", color)}>{label}.</span> {children}
    </p>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      <span className="flex min-h-[48px] rounded-[12px] bg-[var(--color-fill)] p-1">
        {options.map(([option, text]) => (
          <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn("flex-1 rounded-[9px] px-2 text-[15px] font-semibold", value === option ? "bg-white text-black shadow-sm" : "text-[var(--color-text-muted)]")}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

const textInput = "min-h-[48px] w-full rounded-[12px] bg-[var(--color-fill)] px-3 text-[17px] outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]";

// ---------------------------------------------------------------------------------------------
// Food cost

/** Food cost % for a period: (beginning inventory + purchases − ending inventory) ÷ food sales. */
export function periodFoodCost(input: { begin: number; purchases: number; end: number; sales: number }): { cost: number; pct: number } {
  const cost = Math.max(input.begin + input.purchases - input.end, 0);
  return { cost, pct: input.sales ? (cost / input.sales) * 100 : 0 };
}

type Ingredient = { name: string; cost: string };

export function FoodCostPage() {
  const page = seoPage("/tools/food-cost-calculator");
  useSeo(page);
  const [mode, setMode] = useState<"dish" | "period">("dish");
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "Chicken breast, 7 oz", cost: "2.10" },
    { name: "Rice, 6 oz cooked", cost: "0.35" },
    { name: "Vegetables", cost: "0.80" },
    { name: "Sauce & garnish", cost: "0.45" },
  ]);
  const [portions, setPortions] = useState("1");
  const [waste, setWaste] = useState("5");
  const [price, setPrice] = useState("16");
  const [begin, setBegin] = useState("8200");
  const [purchases, setPurchases] = useState("21500");
  const [end, setEnd] = useState("7600");
  const [sales, setSales] = useState("68000");

  const batch = ingredients.reduce((sum, item) => sum + num(item.cost), 0);
  const plate = (batch / (num(portions) || 1)) * (1 + num(waste) / 100);
  const dishPct = num(price) ? (plate / num(price)) * 100 : 0;
  const period = periodFoodCost({ begin: num(begin), purchases: num(purchases), end: num(end), sales: num(sales) });
  const shown = mode === "dish" ? dishPct : period.pct;
  const update = (index: number, patch: Partial<Ingredient>) => setIngredients((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <Segmented label="Calculate" value={mode} onChange={setMode} options={[["dish", "One dish"], ["period", "Week or month"]]} />
            {mode === "dish" ? (
              <>
                <h2 className="mt-5 text-[17px] font-bold">Ingredients in the recipe</h2>
                <div className="mt-2 space-y-3">
                  {ingredients.map((item, index) => (
                    <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Ingredient</span>
                        <input value={item.name} onChange={(event) => update(index, { name: event.target.value })} className={textInput} />
                      </label>
                      <NumberField label="Cost" prefix="$" value={item.cost} onChange={(cost) => update(index, { cost })} />
                      <button type="button" onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${item.name}`} className="grid min-h-[48px] w-10 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setIngredients((current) => [...current, { name: "", cost: "" }])} className="mt-3 inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
                  <Plus className="size-5" /> Add an ingredient
                </button>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <NumberField label="Portions the recipe makes" value={portions} onChange={setPortions} />
                  <NumberField label="Waste buffer" suffix="%" value={waste} onChange={setWaste} />
                  <NumberField label="Menu price" prefix="$" value={price} onChange={setPrice} />
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <NumberField label="Beginning inventory" prefix="$" value={begin} onChange={setBegin} />
                  <NumberField label="Purchases during the period" prefix="$" value={purchases} onChange={setPurchases} />
                  <NumberField label="Ending inventory" prefix="$" value={end} onChange={setEnd} />
                  <NumberField label="Food sales for the period" prefix="$" value={sales} onChange={setSales} />
                </div>
                <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">Count inventory at the same time of day each period. Leave drinks out if you track beverage cost separately.</p>
              </>
            )}
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">Result</h2>
            <div className="mt-2">
              <Result label="Food cost %" value={pct1(shown)} strong />
              {mode === "dish" ? (
                <>
                  <Result label="Cost per plate" value={usd(plate)} hint="Including the waste buffer" />
                  <Result label="Gross profit per plate" value={usd(Math.max(num(price) - plate, 0))} />
                  <Result label="Price for 30% food cost" value={plate ? usd(plate / 0.3) : "—"} />
                </>
              ) : (
                <>
                  <Result label="Cost of food used" value={usd(period.cost)} hint="Beginning + purchases − ending" />
                  <Result label="Food sales" value={usd(num(sales))} />
                </>
              )}
            </div>
            {shown ? (
              shown < 28 ? (
                <Verdict tone="good" label="Lean">Below the usual 28–35% range. Make sure portions still look generous.</Verdict>
              ) : shown <= 35 ? (
                <Verdict tone="ok" label="Typical">Within the 28–35% range most restaurants aim for.</Verdict>
              ) : (
                <Verdict tone="high" label="High">Above 35%. Check portion sizes, waste, supplier prices or the menu price.</Verdict>
              )
            ) : null}
          </Card>
        </div>
      </Container>
      <PlatofyCta context="food-cost-calculator" title="Food cost is half of prime cost. Platofy handles the other half." body="Build the week from availability, see labor % against sales every day and export clean hours to payroll." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Menu price

/** Menu price that hits a target food cost %. */
export function menuPrice(plateCost: number, targetPct: number): number {
  return targetPct > 0 ? plateCost / (targetPct / 100) : 0;
}

/** Rounds a price up to the next .49 or .99. */
export function charmPrice(price: number): number {
  if (price <= 0) return 0;
  const cents = Math.round(price * 100);
  return (Math.ceil((cents + 1) / 50) * 50 - 1) / 100;
}

export function MenuPricePage() {
  const page = seoPage("/tools/menu-price-calculator");
  useSeo(page);
  const [cost, setCost] = useState("4.20");
  const [target, setTarget] = useState("30");
  const [rounding, setRounding] = useState<"charm" | "whole" | "none">("charm");
  const raw = menuPrice(num(cost), num(target));
  const rounded = rounding === "charm" ? charmPrice(raw) : rounding === "whole" ? Math.ceil(raw - 1e-9) : raw;
  const actualPct = rounded ? (num(cost) / rounded) * 100 : 0;

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Cost per plate" prefix="$" value={cost} onChange={setCost} />
              <NumberField label="Target food cost" suffix="%" value={target} onChange={setTarget} />
            </div>
            <div className="mt-4">
              <Segmented label="Round the price" value={rounding} onChange={setRounding} options={[["charm", "To .49 / .99"], ["whole", "Whole dollars"], ["none", "Exact"]]} />
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
              Don't know the plate cost yet? Add up the ingredients with the <Link to="/tools/food-cost-calculator" className="font-semibold text-[var(--color-primary-strong)]">food cost calculator</Link>.
            </p>
            <h2 className="mt-6 text-[17px] font-bold">Price at common targets</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[360px] text-[15px]">
                <thead>
                  <tr className="text-left text-[13px] text-[var(--color-text-muted)]">
                    <th className="pb-2 font-semibold">Food cost</th>
                    <th className="pb-2 font-semibold">Exact price</th>
                    <th className="pb-2 font-semibold">Menu price</th>
                    <th className="pb-2 text-right font-semibold">Profit per plate</th>
                  </tr>
                </thead>
                <tbody>
                  {[25, 28, 30, 32, 35].map((value) => {
                    const exact = menuPrice(num(cost), value);
                    const menu = charmPrice(exact);
                    return (
                      <tr key={value} className="border-t border-[var(--color-separator)]">
                        <td className="py-2 font-semibold">{value}%</td>
                        <td className="py-2 tabular-nums">{usd(exact)}</td>
                        <td className="py-2 tabular-nums">{usd(menu)}</td>
                        <td className="py-2 text-right tabular-nums">{usd(Math.max(menu - num(cost), 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">Put on the menu</h2>
            <div className="mt-2">
              <Result label="Menu price" value={usd(rounded)} strong />
              <Result label="Exact price for the target" value={usd(raw)} />
              <Result label="Actual food cost" value={pct1(actualPct)} hint="After rounding" />
              <Result label="Gross profit per plate" value={usd(Math.max(rounded - num(cost), 0))} />
              <Result label="Profit from 100 plates" value={usd(Math.max(rounded - num(cost), 0) * 100)} />
            </div>
            <p className="mt-4 text-[13px] leading-5 text-[var(--color-text-muted)]">A starting point: compare with nearby menus and what your guests expect to pay.</p>
          </Card>
        </div>
      </Container>
      <PlatofyCta context="menu-price-calculator" title="Priced the menu? Now price the schedule." body="Platofy shows what each shift costs as you build the week, so labor stays in line with the sales your prices bring in." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Prime cost

export function primeCost(input: { cogs: number; labor: number; sales: number }): { prime: number; pct: number } {
  const prime = input.cogs + input.labor;
  return { prime, pct: input.sales ? (prime / input.sales) * 100 : 0 };
}

export function PrimeCostPage() {
  const page = seoPage("/tools/prime-cost-calculator");
  useSeo(page);
  const [sales, setSales] = useState("85000");
  const [food, setFood] = useState("22500");
  const [bev, setBev] = useState("5200");
  const [wages, setWages] = useState("19800");
  const [salaries, setSalaries] = useState("6500");
  const [burden, setBurden] = useState("12");
  const cogs = num(food) + num(bev);
  const labor = (num(wages) + num(salaries)) * (1 + num(burden) / 100);
  const result = primeCost({ cogs, labor, sales: num(sales) });
  const share = (value: number) => (num(sales) ? pct1((value / num(sales)) * 100) : "—");
  const target = num(sales) * 0.6;

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <NumberField label="Total sales for the period" prefix="$" value={sales} onChange={setSales} />
            <h2 className="mt-5 text-[17px] font-bold">Cost of goods sold</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <NumberField label="Food" prefix="$" value={food} onChange={setFood} />
              <NumberField label="Beverages" prefix="$" value={bev} onChange={setBev} />
            </div>
            <h2 className="mt-5 text-[17px] font-bold">Labor</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <NumberField label="Hourly wages" prefix="$" value={wages} onChange={setWages} />
              <NumberField label="Salaries" prefix="$" value={salaries} onChange={setSalaries} />
              <NumberField label="Taxes & benefits" suffix="%" value={burden} onChange={setBurden} />
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">Use the same period for everything, ideally one week. Cost of goods = what you actually used, not what you bought.</p>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">Result</h2>
            <div className="mt-2">
              <Result label="Prime cost %" value={pct1(result.pct)} strong />
              <Result label="Prime cost" value={usd(result.prime)} />
              <Result label="Cost of goods sold" value={usd(cogs)} hint={`${share(cogs)} of sales`} />
              <Result label="Total labor" value={usd(labor)} hint={`${share(labor)} of sales`} />
              <Result label={result.prime > target ? "Over the 60% target by" : "Under the 60% target by"} value={num(sales) ? usd(Math.abs(result.prime - target)) : "—"} />
            </div>
            {result.pct ? (
              result.pct <= 60 ? (
                <Verdict tone="good" label="On target">At or below 60% of sales, the usual goal.</Verdict>
              ) : result.pct <= 65 ? (
                <Verdict tone="ok" label="Watch it">60–65% is common for full-service restaurants but leaves a thin margin.</Verdict>
              ) : (
                <Verdict tone="high" label="Too high">Above 65%. Start with labor: shifts that start before the rush and overtime are the quickest wins.</Verdict>
              )
            ) : null}
          </Card>
        </div>
      </Container>
      <PlatofyCta context="prime-cost-calculator" title="Keep the labor half of prime cost in check" body="Platofy shows labor % against sales while you build the schedule and flags overtime before it happens." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Break-even

/** Monthly sales and covers needed to cover fixed costs, given variable costs as a % of sales. */
export function breakEven(fixed: number, variablePct: number, avgCheck: number, daysOpen: number): { sales: number; covers: number; perDay: number; coversPerDay: number } | null {
  const margin = 1 - variablePct / 100;
  if (margin <= 0) return null;
  const sales = fixed / margin;
  const covers = avgCheck ? sales / avgCheck : 0;
  return { sales, covers, perDay: daysOpen ? sales / daysOpen : 0, coversPerDay: daysOpen ? covers / daysOpen : 0 };
}

type CostRow = { name: string; amount: string };

export function BreakEvenPage() {
  const page = seoPage("/tools/restaurant-break-even-calculator");
  useSeo(page);
  const [fixedRows, setFixedRows] = useState<CostRow[]>([
    { name: "Rent", amount: "9000" },
    { name: "Salaried staff", amount: "11000" },
    { name: "Utilities", amount: "2800" },
    { name: "Insurance, software, licenses", amount: "1700" },
    { name: "Loan payments", amount: "3000" },
  ]);
  const [food, setFood] = useState("30");
  const [hourly, setHourly] = useState("22");
  const [other, setOther] = useState("6");
  const [check, setCheck] = useState("38");
  const [days, setDays] = useState("26");
  const fixed = fixedRows.reduce((sum, row) => sum + num(row.amount), 0);
  const variable = num(food) + num(hourly) + num(other);
  const result = breakEven(fixed, variable, num(check), num(days));
  const update = (index: number, patch: Partial<CostRow>) => setFixedRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <h2 className="text-[17px] font-bold">Fixed costs per month</h2>
            <div className="mt-2 space-y-3">
              {fixedRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">Cost</span>
                    <input value={row.name} onChange={(event) => update(index, { name: event.target.value })} className={textInput} />
                  </label>
                  <NumberField label="Per month" prefix="$" value={row.amount} onChange={(amount) => update(index, { amount })} />
                  <button type="button" onClick={() => setFixedRows((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${row.name}`} className="grid min-h-[48px] w-10 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                    <Trash2 className="size-5" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setFixedRows((current) => [...current, { name: "", amount: "" }])} className="mt-3 inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
              <Plus className="size-5" /> Add a cost
            </button>
            <h2 className="mt-6 text-[17px] font-bold">Variable costs, as % of sales</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <NumberField label="Food & drink" suffix="%" value={food} onChange={setFood} />
              <NumberField label="Hourly labor" suffix="%" value={hourly} onChange={setHourly} />
              <NumberField label="Card fees, packaging, other" suffix="%" value={other} onChange={setOther} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <NumberField label="Average check per guest" prefix="$" value={check} onChange={setCheck} />
              <NumberField label="Days open per month" value={days} onChange={setDays} />
            </div>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">To break even</h2>
            {result ? (
              <div className="mt-2">
                <Result label="Sales per month" value={usd(result.sales)} strong />
                <Result label="Sales per day open" value={result.perDay ? usd(result.perDay) : "—"} />
                <Result label="Guests per month" value={result.covers ? Math.ceil(result.covers).toLocaleString("en-US") : "—"} />
                <Result label="Guests per day open" value={result.coversPerDay ? Math.ceil(result.coversPerDay).toLocaleString("en-US") : "—"} />
                <Result label="Fixed costs" value={usd(fixed)} hint={`Each $1 of sales leaves ${usd(1 - variable / 100)} toward them`} />
              </div>
            ) : (
              <p className="mt-3 text-[15px] text-[var(--color-danger)]">Variable costs are 100% of sales or more, so no amount of sales covers the fixed costs.</p>
            )}
            {result ? <p className="mt-4 text-[13px] leading-5 text-[var(--color-text-muted)]">Every point you take off variable costs lowers this line. Two points less hourly labor here means {usd(Math.max(result.sales - (breakEven(fixed, variable - 2, 0, 0)?.sales ?? 0), 0))} less in sales needed each month.</p> : null}
          </Card>
        </div>
      </Container>
      <PlatofyCta context="break-even-calculator" title="Take points off hourly labor" body="Platofy builds the week around your busy hours and team availability, and shows labor % before you publish." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Time card

/** Paid hours for one day from "HH:MM" clock times; a clock-out before clock-in ends the next day. */
export function shiftHours(start: string, end: string, breakMinutes: number): number {
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = parse(start);
  const to = parse(end);
  if (from === null || to === null) return 0;
  let minutes = to - from;
  if (minutes <= 0) minutes += 24 * 60;
  return Math.max(minutes - breakMinutes, 0) / 60;
}

type TimeRow = { start: string; end: string; breakMin: string };

const hhmm = (hours: number) => `${Math.floor(hours)}:${String(Math.round((hours % 1) * 60)).padStart(2, "0")}`;

export function TimeCardPage() {
  const page = seoPage("/tools/time-card-calculator");
  useSeo(page);
  const [rate, setRate] = useState("17");
  const [rows, setRows] = useState<TimeRow[]>([
    { start: "10:00", end: "18:30", breakMin: "30" },
    { start: "10:00", end: "18:30", breakMin: "30" },
    { start: "", end: "", breakMin: "" },
    { start: "16:00", end: "23:45", breakMin: "30" },
    { start: "16:00", end: "00:30", breakMin: "30" },
    { start: "15:00", end: "01:00", breakMin: "30" },
    { start: "", end: "", breakMin: "" },
  ]);
  const daily = rows.map((row) => shiftHours(row.start, row.end, num(row.breakMin)));
  const week = overtimeHours(daily, "federal");
  const total = week.regular + week.overtime;
  const base = num(rate);
  const pay = base * week.regular + base * 1.5 * week.overtime;
  const update = (index: number, patch: Partial<TimeRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const timeInput = "min-h-[44px] w-full rounded-[10px] bg-white px-2 tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]";

  return (
    <MarketingShell>
      <PageHero eyebrow="Free calculator" title={page.h1} intro={page.intro} />
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[15px]">
                <thead>
                  <tr className="text-left text-[13px] text-[var(--color-text-muted)]">
                    <th className="pb-2 font-semibold">Day</th>
                    <th className="pb-2 font-semibold">Clock in</th>
                    <th className="pb-2 font-semibold">Clock out</th>
                    <th className="pb-2 font-semibold">Unpaid break, min</th>
                    <th className="pb-2 text-right font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={DAYS[index]}>
                      <td className="py-1 pr-2 font-semibold">{DAYS[index]}</td>
                      <td className="py-1 pr-2">
                        <input type="time" value={row.start} onChange={(event) => update(index, { start: event.target.value })} aria-label={`${DAYS[index]} clock in`} className={timeInput} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="time" value={row.end} onChange={(event) => update(index, { end: event.target.value })} aria-label={`${DAYS[index]} clock out`} className={timeInput} />
                      </td>
                      <td className="w-28 py-1 pr-2">
                        <input type="number" min={0} inputMode="numeric" value={row.breakMin} onChange={(event) => update(index, { breakMin: event.target.value })} aria-label={`${DAYS[index]} break minutes`} className={timeInput} />
                      </td>
                      <td className="py-1 text-right font-bold tabular-nums">{daily[index] ? daily[index].toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <NumberField label="Hourly rate" prefix="$" value={rate} onChange={setRate} />
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
              Clock-out earlier than clock-in counts as the next day. Overtime here follows federal rules (over 40 hours a week). For California's daily overtime, use the <Link to="/tools/overtime-calculator" className="font-semibold text-[var(--color-primary-strong)]">overtime calculator</Link>.
            </p>
          </Card>
          <Card className="h-fit bg-white ring-1 ring-[var(--color-separator)] lg:sticky lg:top-20">
            <h2 className="text-[19px] font-bold">This week</h2>
            <div className="mt-2">
              <Result label="Total hours" value={total.toFixed(2)} strong hint={`${hhmm(total)} in hours and minutes`} />
              <Result label="Regular hours" value={week.regular.toFixed(2)} />
              <Result label="Overtime hours (1.5×)" value={week.overtime.toFixed(2)} />
              <Result label="Gross pay" value={usd(pay)} />
            </div>
          </Card>
        </div>
      </Container>
      <PlatofyCta context="time-card-calculator" title="Stop adding up time cards by hand" body="With Platofy your team clocks in and out on their phones. Hours, breaks and overtime are counted for you and export straight to payroll." />
      <Faq items={page.faq} />
    </MarketingShell>
  );
}
