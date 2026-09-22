import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import './landing.css';
import dashboardShot from '@/assets/landing/dashboard.png';
import fieldShot from '@/assets/landing/field-detail.png';
import reportsShot from '@/assets/landing/reports.png';
import activityShot from '@/assets/landing/activity.png';

/**
 * Public landing page ("Field Margin" design) — a ledger-book-styled launch
 * page, fully self-contained: all styles are scoped under `.landing` in
 * landing.css, and page-specific screenshot assets live in src/assets/landing.
 */

const revealDelay = (ms: number) =>
  ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

const accent = (color: string) =>
  ({ '--ald-accent': color }) as CSSProperties;

const ACCENTS = {
  red: 'var(--ald-red)',
  gold: 'var(--ald-gold)',
  green: 'var(--ald-green)',
  pumpkin: 'var(--ald-pumpkin)',
  sky: 'var(--ald-sky)',
} as const;

const features = [
  {
    no: 'NO. 001',
    accent: ACCENTS.red,
    title: 'An FSA-578 worksheet built for the office',
    copy:
      'Acreage by tract and CLU, crops, planting dates, and reconciliation totals, laid out for your FSA appointment.',
  },
  {
    no: 'NO. 002',
    accent: ACCENTS.gold,
    title: 'Spray records that match the work',
    copy:
      'Each field keeps its own product, EPA number, rate, acreage, and weather. Carry the mix to the next field without combining the records.',
  },
  {
    no: 'NO. 003',
    accent: ACCENTS.green,
    title: 'One book for the whole season',
    copy:
      'Planting, spraying, fertilizer, harvest, hay, and grain movements stay organized by field instead of scattered across notebooks and camera rolls.',
  },
  {
    no: 'NO. 004',
    accent: ACCENTS.pumpkin,
    title: 'Bin inventory without the spreadsheet math',
    copy:
      'Every movement and sale adjusts the bin total, season-long. You know what is actually in each bin before you price a load.',
  },
  {
    no: 'NO. 005',
    accent: ACCENTS.sky,
    title: 'Works where signal doesn’t',
    copy:
      'No signal at the back forty? Save the entry on your phone. It syncs when you’re back in range.',
  },
  {
    no: 'NO. 006',
    accent: ACCENTS.red,
    title: 'Landlord summaries in two clicks',
    copy:
      'Get each landlord’s activity, yields, and crop-share math in a clean PDF or CSV when the lease conversation comes up.',
  },
];

const gallery = [
  {
    src: fieldShot,
    alt: 'AcreLedger field screen: satellite map with the field boundary highlighted and quick-log buttons for spray, plant, till, and harvest',
    frame: 'landing-phone--pumpkin',
    caption: 'Every field, mapped',
    detail: 'Boundaries and quick logging, right from the truck seat.',
  },
  {
    src: reportsShot,
    alt: 'AcreLedger reports screen showing the FSA-578 acreage worksheet ready to export, with all fields ready',
    frame: 'landing-phone--sky',
    caption: 'Office-ready, season-long',
    detail: 'See missing details before you drive to the FSA office.',
  },
  {
    src: activityShot,
    alt: 'AcreLedger activity feed listing grain movements into a grain bin and harvested corn records with the season selector',
    frame: 'landing-phone--red',
    caption: 'The whole season, one feed',
    detail: 'Grain, harvest, and everything in between, ready when you need it.',
  },
];

const steps = [
  {
    accent: ACCENTS.green,
    title: 'Log the field before you leave it',
    copy:
      'Choose the field, record the work, and save. Start the next field as a new record, then carry over the mix or other reusable details.',
  },
  {
    accent: ACCENTS.pumpkin,
    title: 'Each field stays separate',
    copy:
      'Date, acreage, weather, and compliance checks stay with that field. Nothing gets lumped together at the end of the day.',
  },
  {
    accent: ACCENTS.sky,
    title: 'Print what the office needs',
    copy:
      'Print FSA acreage worksheets, spray logs, and landlord summaries as a PDF or CSV when the co-op, landlord, or FSA office asks.',
  },
];

const included = [
  'Unlimited field activity records',
  'Field boundaries and FSA CLU assignments',
  'Grain bin and movement tracking',
  'Weather and rainfall views',
  'PDF and CSV compliance exports',
  'Landlord summaries and work requests',
  'Offline record entry and cloud sync',
  'Downloadable farm backup',
];

const faqs = [
  {
    question: 'Do I need FSA boundary files before I start?',
    answer:
      'No. Add fields by hand and start recording the same day. Import FSA tract and CLU boundary files whenever your office provides them. Your earlier records stay with their fields.',
  },
  {
    question: 'Does AcreLedger replace official USDA or product-label requirements?',
    answer:
      'No. AcreLedger creates working documents from the information you enter. Follow product labels and confirm filing requirements with your county FSA office or other authority.',
  },
  {
    question: 'What happens after the four free months?',
    answer:
      'The standard price is $299 per farm for a year, billed annually. Everything you have recorded stays in the book, and you can export any of it at any time.',
  },
  {
    question: 'Does it work without cell service?',
    answer:
      'Yes. Entries save on your phone first and sync when you are back in range.',
  },
  {
    question: 'Who owns the records I keep here?',
    answer:
      'You do. Export PDFs and CSVs whenever you need them, or download a complete backup of your farm’s data. AcreLedger keeps the book; the records stay yours.',
  },
];

const Landing = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>('[data-reveal]'),
    );
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((target) => target.classList.add('in-view'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing-spine" aria-hidden="true" />
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="landing-wordmark" to="/">
            Acre<span>Ledger</span>
          </Link>
          <div className="landing-header-actions">
            <Link className="landing-header-signin" to="/auth?mode=signin">
              Sign in
            </Link>
            <Link
              className="landing-header-cta landing-header-cta--solid"
              to="/auth?mode=signup"
            >
              Open the book
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ENTRY 001 — Hero */}
        <section className="landing-section" id="top">
          <span className="landing-entry-no">Entry 001</span>
          <div className="landing-hero-grid">
            <div>
              <p className="landing-eyebrow" data-reveal>
                Farm records for row-crop operations
              </p>
              <h1 className="landing-h1" data-reveal style={revealDelay(80)}>
                Field records in. <em>FSA paperwork out.</em>
              </h1>
              <p className="landing-hero-sub" data-reveal style={revealDelay(160)}>
                AcreLedger keeps planting, spraying, harvest, grain, and reports
                in one farm book. Log each field from the truck cab, even without
                signal, then print the paperwork you need.
              </p>
              <div className="landing-hero-actions" data-reveal style={revealDelay(240)}>
                <Link className="landing-btn" to="/auth?mode=signup">
                  Open your farm book
                </Link>
                <a className="landing-btn landing-btn--ghost" href="#features">
                  See what it handles
                </a>
              </div>
              <p className="landing-hero-terms" data-reveal style={revealDelay(320)}>
                Free for four months · No charge today · Then $299 per farm,
                billed annually
              </p>
              <div className="landing-stamp" data-reveal="stamp" style={revealDelay(480)}>
                NO CHARGE TODAY
                <small>4 MONTHS FREE</small>
              </div>
            </div>

            <figure className="landing-hero-shot" data-reveal style={revealDelay(200)}>
              <span className="landing-phone landing-phone--gold">
                <img
                  src={dashboardShot}
                  alt="AcreLedger dashboard with live weather, total acres, and field cards for the whole operation"
                />
              </span>
              <figcaption className="landing-phone-caption">
                <strong>The actual app</strong>
                Your weather, acres, and every field at a glance.
              </figcaption>
            </figure>
          </div>
        </section>

        <hr className="landing-hr" data-reveal="rule" />

        {/* Manifesto — answers "paper works fine" head-on */}
        <div className="landing-band--gold">
          <section className="landing-section landing-manifesto">
            <span className="landing-entry-no">Entry 002</span>
            <p data-reveal>
              Every farm already keeps a book: a notebook in the truck,
              receipts in the drawer, yields in your head.{' '}
              <strong>AcreLedger is that book</strong>, kept current, that also
              finishes the paperwork.
            </p>
          </section>
        </div>

        {/* ENTRY 003 — Features as ledger entries */}
        <section className="landing-section" id="features">
          <span className="landing-entry-no">Entry 003</span>
          <h2 className="landing-h2" data-reveal>
            What goes in the book.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            Keep the season the way you work it. AcreLedger organizes the
            details the way the office needs them.
          </p>
          <ul className="landing-features">
            {features.map((feature, index) => (
              <li
                data-reveal
                key={feature.no}
                style={{ ...accent(feature.accent), ...revealDelay(index * 60) }}
              >
                <span className="landing-feature-no">{feature.no}</span>
                <h3 className="landing-feature-title">{feature.title}</h3>
                <p className="landing-feature-copy">{feature.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        <hr className="landing-hr" data-reveal="rule" />

        {/* ENTRY 004 — Real screens */}
        <section className="landing-section" id="screens">
          <span className="landing-entry-no">Entry 004</span>
          <h2 className="landing-h2" data-reveal>
            See it work.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            These are screens from the working app, not mock-ups.
          </p>
          <ul className="landing-gallery">
            {gallery.map((shot, index) => (
              <li data-reveal key={shot.caption} style={revealDelay(index * 120)}>
                <span className={`landing-phone ${shot.frame}`}>
                  <img src={shot.src} alt={shot.alt} />
                </span>
                <p className="landing-phone-caption">
                  <strong>{shot.caption}</strong>
                  {shot.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <hr className="landing-hr" data-reveal="rule" />

        {/* ENTRY 005 — How it works */}
        <section className="landing-section" id="how">
          <span className="landing-entry-no">Entry 005</span>
          <h2 className="landing-h2" data-reveal>
            One field at a time.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            Recordkeeping that fits the cab, not the office chair.
          </p>
          <ol className="landing-steps">
            {steps.map((step, index) => (
              <li
                data-reveal
                key={step.title}
                style={{ ...accent(step.accent), ...revealDelay(index * 120) }}
              >
                <span className="landing-step-no">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="landing-step-title">{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <hr className="landing-hr" data-reveal="rule" />

        {/* ENTRY 006 — Pricing as a scale ticket */}
        <section className="landing-section" id="pricing">
          <span className="landing-entry-no">Entry 006</span>
          <h2 className="landing-h2" data-reveal>
            Terms of the book.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            One annual price per farm, with no per-seat charge.
          </p>
          <div className="landing-ticket-wrap">
            <dl className="landing-ticket" data-reveal>
              <div className="landing-ticket-head">
                <span>AcreLedger</span>
                <span>No. 2026-001</span>
              </div>
              <div className="landing-ticket-line" style={accent(ACCENTS.green)}>
                <dt>Trial</dt>
                <dd>
                  4 months
                  <small>full access, no charge</small>
                </dd>
              </div>
              <div className="landing-ticket-line" style={accent(ACCENTS.red)}>
                <dt>Thereafter</dt>
                <dd>
                  $299.00
                  <small>per farm / year, billed annually</small>
                </dd>
              </div>
              <div className="landing-ticket-line" style={accent(ACCENTS.gold)}>
                <dt>Your records</dt>
                <dd>
                  Yours
                  <small>PDF · CSV · full backup export</small>
                </dd>
              </div>
              <div className="landing-ticket-net">
                <span>Net due after trial</span>
                <span>$299.00 / year</span>
              </div>
              <p className="landing-ticket-note">
                About $24.92 per month, billed annually. The price covers
                AcreLedger access. Internet service, third-party services, and
                professional or government filing fees cost extra. You will not
                be charged when you create an account; web subscriptions are
                rolling out in stages.
              </p>
            </dl>

            <div data-reveal style={revealDelay(120)}>
              <p className="landing-included-title">Included in every book</p>
              <ul className="landing-included">
                {included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="landing-hero-actions">
                <Link className="landing-btn" to="/auth?mode=signup">
                  Open your farm book
                </Link>
              </div>
              <p className="landing-hero-terms">
                No charge when you create an account today.
              </p>
            </div>
          </div>
        </section>

        <hr className="landing-hr" data-reveal="rule" />

        {/* ENTRY 007 — FAQ */}
        <section className="landing-section" id="faq">
          <span className="landing-entry-no">Entry 007</span>
          <h2 className="landing-h2" data-reveal>
            The practical details.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            Have a question about using AcreLedger on your farm? Email{" "}
            <a href="mailto:support@acreledger.com">support@acreledger.com</a>.
          </p>
          <div className="landing-faq" data-reveal style={revealDelay(120)}>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA on the green plate */}
        <div className="landing-band--green">
          <section className="landing-section landing-final" id="start">
            <h2 data-reveal>Start this season’s book.</h2>
            <div className="landing-hero-actions" data-reveal style={revealDelay(120)}>
              <Link className="landing-btn landing-btn--light" to="/auth?mode=signup">
                Open your farm book
              </Link>
            </div>
            <p className="landing-final-terms" data-reveal style={revealDelay(200)}>
              Free for four months · No charge today · Then $299 per farm,
              billed annually
            </p>
            <div className="landing-stamp" data-reveal="stamp" style={revealDelay(320)}>
              FIELD NOTES IN
              <small>REPORTS READY</small>
            </div>
          </section>
        </div>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span>AcreLedger</span>
          <a href="mailto:support@acreledger.com">Contact</a>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy policy</Link>
          <span>© 2026 AcreLedger</span>
          <span className="landing-footer-legal">
            Working documents for your records and appointments. FSA acceptance
            is not guaranteed. Follow labels and your county office.
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
