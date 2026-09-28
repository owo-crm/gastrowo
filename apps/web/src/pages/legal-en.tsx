import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";

/**
 * English legal pages for customers outside Poland. The Polish documents stay at /regulamin,
 * /polityka-prywatnosci and /polityka-cookies. Company details are filled in once the operating
 * entity is registered; until then the operator is referred to by the service name.
 */

type Section = { title: string; paragraphs?: string[]; bullets?: string[] };

const EFFECTIVE = "October 1, 2026";
const SUPPORT = "support@gastrostuff.pl";
const SERVICE = "Platofy";

function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Section[] }) {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link to="/" aria-label={SERVICE}>
          <BrandLogo kind="wordmark" className="text-[1.6rem]" />
        </Link>
        <Link to="/" className="text-[15px] font-semibold text-[var(--color-primary-strong)]">
          Back to home
        </Link>
      </header>
      <main className="mx-auto max-w-[760px] px-4 pb-16 sm:px-8">
        <h1 className="mt-4 text-[34px] font-semibold leading-tight text-black">{title}</h1>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">Effective {EFFECTIVE}</p>
        <p className="mt-4 text-[17px] leading-7 text-black">{intro}</p>
        <div className="ios-island mt-8 space-y-8 px-5 py-6 sm:px-8 sm:py-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-[19px] font-semibold text-black">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[16px] leading-7 text-[#3c3c43]">
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[16px] leading-7 text-[#3c3c43]">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-semibold text-[var(--color-primary-strong)]">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/cookies">Cookie Policy</Link>
          <Link to="/regulamin">Polska wersja</Link>
        </nav>
      </main>
    </div>
  );
}

const terms: Section[] = [
  {
    title: "1. The service",
    paragraphs: [
      `${SERVICE} is an online tool for restaurants and other hospitality businesses to plan staff schedules, collect availability, record working time (including a phone and tablet time clock), review hours, estimate payroll and labor cost, and manage tasks. These Terms apply to everyone who uses ${SERVICE}: the business that opens an account ("Customer") and the people it invites ("Users").`,
    ],
  },
  {
    title: "2. Accounts",
    bullets: [
      "A business account is opened by an owner, who must be at least 18 and able to act for the business.",
      "Team members join only by an invitation from the business. The Customer decides who has access and at which role, and is responsible for everything done under its account.",
      "Keep passwords, time clock PINs and tablet devices secure. Tell us promptly if you believe an account was accessed without permission.",
    ],
  },
  {
    title: "3. Plans, trials and billing",
    bullets: [
      "The Free plan covers one location and up to 15 people. Paid plans (Starter and Pro) are billed per location, monthly or annually, as shown on the pricing page at the time of purchase.",
      "New businesses may receive a free trial of a paid plan. When a trial ends without a payment method, the account moves to the Free plan; no charge is made.",
      "Paid plans renew automatically at the end of each billing period until cancelled. You can cancel at any time in Billing; the plan stays active until the end of the period already paid, and payments are not refunded except where the law requires.",
      "The number of billed locations follows the locations in your account. Prices exclude taxes that may apply in your jurisdiction.",
      "Payments are processed by Stripe. We do not store full card numbers.",
      "We may change prices with at least 30 days' notice by email. The new price applies from your next renewal after the notice period.",
    ],
  },
  {
    title: "4. Your data",
    paragraphs: [
      "The Customer owns the data it and its Users put into the service (schedules, hours, pay rates, revenue, tasks and similar). We use it only to provide and support the service, as described in the Privacy Policy. You can export payroll data at any time and ask us to delete your account.",
    ],
  },
  {
    title: "5. Labor law and payroll",
    paragraphs: [
      `${SERVICE} helps apply common rules such as weekly overtime, rest periods and approved hours, but it is not legal, tax or payroll advice. The Customer remains responsible for complying with wage-and-hour, labor, tax and record-keeping laws that apply to it, for checking hours and pay before paying staff, and for the settings it chooses.`,
    ],
  },
  {
    title: "6. Acceptable use",
    bullets: [
      "Do not use the service to break the law, to harm or harass anyone, or to store content you have no right to use.",
      "Do not try to access accounts or data that are not yours, probe or overload the service, or copy it to build a competing product.",
      "We may suspend access that puts the service or other customers at risk, and will tell you why unless the law prevents it.",
    ],
  },
  {
    title: "7. Availability and changes",
    paragraphs: [
      "We work to keep the service available and secure, but it is provided \"as is\" and may occasionally be interrupted for maintenance or by events outside our control. We may improve or change features; we will not remove core scheduling or time tracking from a paid plan during a period you have already paid for.",
    ],
  },
  {
    title: "8. Liability",
    paragraphs: [
      "To the extent the law allows, we are not liable for indirect or consequential losses such as lost profits or lost data, and our total liability for any claim is limited to the amount the Customer paid us in the 12 months before the claim. Nothing in these Terms limits liability that cannot be limited by law.",
    ],
  },
  {
    title: "9. Ending the agreement",
    paragraphs: [
      "You may stop using the service and delete your account at any time. We may end the agreement for serious or repeated breach of these Terms. After an account is deleted we remove its data within 30 days, except records we must keep by law (such as invoices).",
    ],
  },
  {
    title: "10. Changes to these Terms and contact",
    paragraphs: [
      `We may update these Terms. For material changes we will notify account owners by email at least 30 days in advance. Questions: ${SUPPORT}.`,
    ],
  },
];

const privacy: Section[] = [
  {
    title: "1. Who we are and our role",
    paragraphs: [
      `This policy explains how ${SERVICE} handles personal information. For account and billing data of the business owner we decide how data is used (we are the "controller"). For information about a business's staff that the business puts into ${SERVICE} — schedules, hours, pay rates, time clock records — the business is the controller and we process it on its behalf as a processor / service provider.`,
    ],
  },
  {
    title: "2. What we collect",
    bullets: [
      "Account data: name, email, password (stored only as a secure hash), role, business name and country.",
      "Workforce data the business enters or its staff submit: positions, pay rates, availability, shifts, clock-in and clock-out times, hours, tasks and task photos, revenue figures.",
      "Time clock data: when someone clocks in or out, from the phone app or a tablet PIN pad, and at which location. We do not track location continuously.",
      "Billing data: plan, invoices and payment status from Stripe. Card details are handled by Stripe, not by us.",
      "Technical data: log records (IP address, browser, errors), and push notification tokens for devices that turn notifications on.",
    ],
  },
  {
    title: "3. How we use it",
    bullets: [
      "To provide the service: build schedules, calculate hours, overtime and labor cost, send notifications and emails you need (sign-in codes, invitations, schedule changes).",
      "To bill paid plans and keep records required by law.",
      "To keep the service secure, prevent abuse, fix errors and provide support.",
      "We do not sell or share personal information for cross-context behavioral advertising, and we do not use staff data for our own marketing.",
    ],
  },
  {
    title: "4. Who we share it with",
    paragraphs: ["Only with service providers that help us run the service, under contracts that protect the data:"],
    bullets: [
      "Hosting and database (Railway).",
      "Email delivery (Resend).",
      "Payments (Stripe).",
      "Push notifications (the push services of Apple, Google and Mozilla, which receive only the notification text).",
      "Error monitoring (Sentry), when enabled.",
    ],
  },
  {
    title: "5. Keeping and deleting data",
    paragraphs: [
      "We keep data while the account is active. When a business deletes its account, we delete its data within 30 days, except invoices and records we must keep by law. A business can remove a team member at any time; their personal access ends immediately.",
    ],
  },
  {
    title: "6. Security",
    paragraphs: [
      "Data is encrypted in transit, passwords are hashed, time clock PINs are stored only as a keyed digest, and access inside a business follows the roles and permissions the owner sets.",
    ],
  },
  {
    title: "7. Your rights",
    paragraphs: [
      "Depending on where you live (for example under the GDPR in the EU or the CCPA/CPRA in California), you may have the right to access, correct, delete or export your personal information, to object to or restrict some processing, and not to be discriminated against for using these rights. Staff of a business should usually contact their employer first, since the employer controls workforce data; we will help the employer respond. You can also contact us directly.",
    ],
  },
  {
    title: "8. International transfers and children",
    paragraphs: [
      "Our providers may process data in the United States and the European Union; where required we rely on standard contractual clauses. The service is not intended for children under 16.",
    ],
  },
  {
    title: "9. Contact and changes",
    paragraphs: [`Questions or requests: ${SUPPORT}. We will post changes to this policy here and email account owners about material changes.`],
  },
];

const cookies: Section[] = [
  {
    title: "What we use",
    bullets: [
      "A session cookie that keeps you signed in for up to 30 days. It is strictly necessary and cannot be turned off.",
      "Local storage in your browser for preferences: language, the tablet time clock setting on a shared device, and similar. It never leaves your device.",
    ],
  },
  {
    title: "Analytics and marketing",
    paragraphs: [
      "If we use analytics or advertising measurement on our public website, it loads only after you accept it in the cookie banner, and you can change your choice at any time by clearing this site's data in your browser. The app itself does not use advertising cookies.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [`Questions: ${SUPPORT}.`],
  },
];

export function TermsPageEn() {
  return <LegalPage title="Terms of Service" intro={`These Terms govern the use of ${SERVICE}. By creating an account or using the service you agree to them.`} sections={terms} />;
}

export function PrivacyPageEn() {
  return <LegalPage title="Privacy Policy" intro={`How ${SERVICE} collects, uses and protects personal information.`} sections={privacy} />;
}

export function CookiesPageEn() {
  return <LegalPage title="Cookie Policy" intro="Which cookies and browser storage the website and app use." sections={cookies} />;
}
