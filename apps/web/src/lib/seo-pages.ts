/**
 * Public marketing pages: titles, descriptions and the text search engines should see.
 * Pure data (no imports): the pages render it, and the build writes a static HTML file per path
 * (vite.config.ts) so crawlers get the content without running JavaScript.
 */

export type SeoFaq = { q: string; a: string };

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  faq: SeoFaq[];
};

export const SITE_URL = "https://platofy.app";

export const TOOL_PAGES: SeoPage[] = [
  {
    path: "/tools/restaurant-schedule-template",
    title: "Free Restaurant Schedule Template (Excel & Google Sheets) | Platofy",
    description:
      "Download a free weekly restaurant employee schedule template for Excel and Google Sheets. Hours, overnight shifts and labor cost add up automatically.",
    h1: "Free restaurant schedule template",
    intro:
      "A weekly staff schedule for Excel and Google Sheets. Enter in and out times; hours per person, hours per day and labor cost add up on their own, even for shifts that end after midnight. Add your sales forecast to see labor cost as a percent of sales.",
    faq: [
      {
        q: "How do I make a restaurant schedule in Excel?",
        a: "List each employee with their position and hourly rate, then enter a start and end time for every shift. This template calculates daily and weekly hours, handles overnight shifts and totals labor cost, so you only type the times.",
      },
      {
        q: "Does it work in Google Sheets?",
        a: "Yes. Open Google Sheets, choose File → Import and upload the .xlsx file, or download the CSV version. The formulas keep working.",
      },
      {
        q: "How far in advance should a restaurant post the schedule?",
        a: "At least a week ahead is common, and some US cities (New York, Chicago, Seattle, San Francisco, Philadelphia, Los Angeles and others) require up to 14 days for larger employers under fair workweek laws. Check the rules for your city.",
      },
      {
        q: "What is a good labor cost percentage for a restaurant?",
        a: "Most full-service restaurants aim for roughly 25–35% of sales; quick-service places often run lower. The template shows your percentage as soon as you enter a sales forecast.",
      },
    ],
  },
  {
    path: "/tools/labor-cost-calculator",
    title: "Restaurant Labor Cost Calculator (Labor % of Sales) | Platofy",
    description:
      "Free restaurant labor cost calculator: enter hours, wages and sales to get labor cost and labor cost percentage, with payroll taxes and benchmarks.",
    h1: "Restaurant labor cost calculator",
    intro:
      "Enter the hours and hourly wage for each role and your sales for the same period. You get total labor cost, including payroll taxes and benefits, and labor cost as a percentage of sales.",
    faq: [
      {
        q: "How do you calculate restaurant labor cost percentage?",
        a: "Add up wages for the period, including payroll taxes and benefits, and divide by sales for the same period. For example, $8,000 of labor on $28,000 of sales is 28.6%.",
      },
      {
        q: "What is a good labor cost percentage?",
        a: "Many full-service restaurants target about 25–35% of sales. Fine dining and places with more scratch cooking tend to run higher; counter service tends to run lower.",
      },
      {
        q: "Should I include payroll taxes?",
        a: "Yes. Employer payroll taxes, workers' comp and benefits are part of what a shift really costs. If you don't know the exact figure, 8–12% on top of wages is a common starting estimate.",
      },
      {
        q: "How can I lower labor cost without cutting service?",
        a: "Schedule to your busiest hours instead of fixed blocks, avoid unplanned overtime, and compare scheduled hours with sales every week. Seeing labor % daily makes it much easier to adjust.",
      },
    ],
  },
  {
    path: "/tools/overtime-calculator",
    title: "Overtime Pay Calculator for Restaurants (Federal & California) | Platofy",
    description:
      "Free overtime calculator for hourly restaurant staff: weekly overtime under the federal FLSA and daily overtime and double time under California rules.",
    h1: "Overtime calculator for restaurant staff",
    intro:
      "Enter an hourly rate and the hours worked each day of the week. See regular hours, overtime and double time, and the total pay for the week under federal rules or California's daily overtime rules.",
    faq: [
      {
        q: "When does overtime start under federal law?",
        a: "Under the Fair Labor Standards Act, non-exempt employees earn at least one and a half times their regular rate for hours over 40 in a workweek. Federal law has no daily overtime.",
      },
      {
        q: "How is overtime different in California?",
        a: "California also pays overtime by the day: 1.5× after 8 hours in a day and 2× after 12. On the seventh consecutive day of work in a workweek, the first 8 hours are 1.5× and anything beyond is 2×. Weekly hours over 40 are overtime too, without counting the same hour twice.",
      },
      {
        q: "Do tipped employees get overtime?",
        a: "Yes. Overtime for tipped employees is based on the full minimum wage, not the reduced cash wage, so the math differs. This calculator uses the hourly rate you enter; check with your payroll provider for tipped overtime.",
      },
      {
        q: "Is this legal advice?",
        a: "No. States and cities can have extra rules. Use the result as an estimate and confirm with your payroll provider or an employment lawyer.",
      },
    ],
  },
  {
    path: "/tools/tip-pool-calculator",
    title: "Tip Pool Calculator for Restaurants (by Hours or Points) | Platofy",
    description:
      "Free tip pool calculator: split pooled tips fairly by hours worked, by role points or equally. Instant payout per person.",
    h1: "Tip pool calculator",
    intro:
      "Enter the total tips and who worked. Split them by hours worked, by points per role times hours, or equally, and see exactly what each person takes home.",
    faq: [
      {
        q: "What is the fairest way to split a tip pool?",
        a: "Splitting by hours worked is the most common: everyone earns the same per hour in the pool. Points systems give roles like bartenders or servers a higher weight per hour than bussers or hosts.",
      },
      {
        q: "Can managers take part in the tip pool?",
        a: "Under US federal law, managers and supervisors may not keep any part of employees' tips. Back-of-house staff can join a pool in many cases, but rules vary by state.",
      },
      {
        q: "How do tip points work?",
        a: "Each role gets a number of points per hour, for example server 10, bartender 10, busser 5, host 4. A person's share is their points × hours divided by everyone's total, times the tip pool.",
      },
    ],
  },
];

export const TOOLS_HUB: SeoPage = {
  path: "/tools",
  title: "Free Tools for Restaurant Managers | Platofy",
  description:
    "Free restaurant schedule template and calculators for labor cost, overtime and tip pooling. No sign-up needed.",
  h1: "Free tools for restaurant managers",
  intro: "Templates and calculators for the numbers you deal with every week. No sign-up needed.",
  faq: [],
};

export const ALL_SEO_PAGES: SeoPage[] = [TOOLS_HUB, ...TOOL_PAGES];

export function seoPage(path: string): SeoPage {
  return ALL_SEO_PAGES.find((page) => page.path === path) ?? TOOLS_HUB;
}

export type Competitor = {
  slug: "7shifts" | "homebase" | "when-i-work";
  name: string;
  /** How they charge, in general terms (check their pricing page for current numbers). */
  pricing: string;
  freePlan: string;
  bestFor: string;
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "7shifts",
    name: "7shifts",
    pricing: "Per location per month, several tiers",
    freePlan: "Limited free plan for one location",
    bestFor: "Restaurant groups that want deep POS integrations and many add-ons",
  },
  {
    slug: "homebase",
    name: "Homebase",
    pricing: "Per location per month, several tiers",
    freePlan: "Free basic plan for one location",
    bestFor: "Small businesses of any kind that also want hiring and HR tools in one place",
  },
  {
    slug: "when-i-work",
    name: "When I Work",
    pricing: "Per user per month",
    freePlan: "Free trial",
    bestFor: "Hourly teams across many industries that are fine paying per person",
  },
];

export const COMPARE_PAGES: SeoPage[] = COMPETITORS.map((competitor) => ({
  path: `/compare/${competitor.slug}`,
  title: `${competitor.name} Alternative for Restaurants: Platofy vs ${competitor.name}`,
  description: `Looking for a ${competitor.name} alternative? Compare Platofy and ${competitor.name} for restaurant scheduling: pricing, auto-scheduling, time clock and payroll export. Free switch-over.`,
  h1: `Platofy vs ${competitor.name}`,
  intro: `${competitor.name} is a solid tool. Platofy is built only for independent restaurants: the week is built from your team's availability in minutes, pricing is a flat price per location (never per person), and we move your team and schedule over for free.`,
  faq: [
    {
      q: `How do I switch from ${competitor.name} to Platofy?`,
      a: `Export your employee list from ${competitor.name} (or send a photo of this week's schedule) through the free switch-over form. We set up your team, positions and shift templates and send you a link when it's ready, usually within one business day.`,
    },
    {
      q: "How much does Platofy cost?",
      a: "Free for one location and up to 15 people. Starter is $26 a month for one location and up to 30 people. Pro is $58 a month for up to three locations with unlimited people, and each extra location is $15. New businesses get 30 days of Pro free, no card.",
    },
    {
      q: "Do my staff need to download an app?",
      a: "No. Platofy runs in the phone's browser and can be added to the home screen, with notifications for new schedules, swaps and time-off answers.",
    },
    {
      q: `Can I run Platofy next to ${competitor.name} for a week first?`,
      a: "Yes. Many managers build one week in Platofy while the old tool is still running, then switch once the team is in. The free plan and the 30-day Pro trial make that easy.",
    },
  ],
}));

export const SWITCH_PAGE: SeoPage = {
  path: "/switch",
  title: "Switch to Platofy for Free — We Move Your Schedule for You | Platofy",
  description:
    "Moving from 7shifts, Homebase, When I Work or a spreadsheet? Send us your export or a photo of your schedule and we set up Platofy for your restaurant for free.",
  h1: "We'll move your schedule to Platofy, free",
  intro:
    "Send us your team list or export from your current tool, or just a photo of this week's schedule. We set up your team, positions, pay rates and shift templates, and send you a link when it's ready.",
  faq: [
    { q: "What do you need from me?", a: "An export of your employees (CSV or Excel from any tool) or a photo of your current schedule. That's it." },
    { q: "How long does it take?", a: "Usually within one business day. You get an email with a link when your restaurant is ready." },
    { q: "What does it cost?", a: "Nothing. The switch-over is free, and Platofy itself is free for one location and up to 15 people." },
  ],
};

/** The landing page and How it works: prerendered too (search engines saw an empty page before). */
export const SITE_PAGES: SeoPage[] = [
  {
    path: "/",
    title: "Platofy — Restaurant Scheduling App, Time Clock & Payroll Export",
    description:
      "Restaurant employee scheduling built from your team's availability, shift swaps on every phone, a tablet time clock and approved hours exported for payroll. Free for one location.",
    h1: "Restaurant scheduling in 10 minutes",
    intro:
      "Platofy builds the week from your team's availability, positions and priorities, sends it to every phone, handles swaps and time off, clocks people in on a phone or a tablet by the door, and exports approved hours for payroll. Free for one location and up to 15 people; paid plans from $26 a month per location.",
    faq: [
      {
        q: "What does Platofy do?",
        a: "It replaces the spreadsheet and the group chat: availability, auto-built weekly schedules, shift swaps and pickups, a time clock, timesheet approval, labor cost and a payroll export, in one app for managers and staff.",
      },
      {
        q: "How much does it cost?",
        a: "Free for one location and up to 15 people. Starter is $26 a month for one location and up to 30 people; Pro is $58 a month for up to three locations with no people limit. Every new business gets 30 days of Pro free, no card needed.",
      },
      {
        q: "Do my employees need to install an app?",
        a: "No download needed: Platofy works in the phone's browser and can be added to the home screen, with push notifications for new schedules and swaps.",
      },
    ],
  },
  {
    path: "/how-it-works",
    title: "How Platofy Works — Restaurant Scheduling, Time Clock & Payroll",
    description:
      "See the real Platofy app step by step: collect availability, build the week in minutes, clock in by phone or tablet, approve only the exceptions and export payroll hours.",
    h1: "From availability to payroll, in one loop",
    intro:
      "Set up positions and pay rates and import your team from a spreadsheet. Staff send availability from their phones, Platofy builds the week, everyone gets it instantly, swaps are approved in one tap, people clock in on a phone or tablet, and approved hours go to payroll.",
    faq: [],
  },
];

/** Links every prerendered page carries, so crawlers can reach the whole public site. */
export const SITE_LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Platofy home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/tools", label: "Free tools" },
  { href: "/tools/restaurant-schedule-template", label: "Restaurant schedule template" },
  { href: "/tools/labor-cost-calculator", label: "Labor cost calculator" },
  { href: "/tools/overtime-calculator", label: "Overtime calculator" },
  { href: "/tools/tip-pool-calculator", label: "Tip pool calculator" },
  { href: "/compare/7shifts", label: "7shifts alternative" },
  { href: "/compare/homebase", label: "Homebase alternative" },
  { href: "/compare/when-i-work", label: "When I Work alternative" },
  { href: "/switch", label: "Free switch-over" },
  { href: "/demo", label: "Try the live demo" },
  { href: "/login?mode=onboarding", label: "Start free" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export const PRERENDERED: SeoPage[] = [...SITE_PAGES, ...ALL_SEO_PAGES, ...COMPARE_PAGES, SWITCH_PAGE];
