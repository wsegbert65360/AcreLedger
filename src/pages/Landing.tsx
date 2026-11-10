import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link } from 'react-router-dom';
import './landing.css';
import dashboardShot from '@/assets/landing/dashboard.png';
import fieldShot from '@/assets/landing/field-detail.png';
import reportsShot from '@/assets/landing/reports.png';
import activityShot from '@/assets/landing/activity.png';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

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
    accent: ACCENTS.green,
    title: 'The field book, kept current',
    copy:
      'Planting, spraying, fertilizer, harvest, and hay stay with each field instead of in a notebook and a camera roll.',
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
    accent: ACCENTS.sky,
    title: 'Works where signal doesn\u2019t',
    copy:
      'Save the entry on your phone. It syncs when you\u2019re back in range.',
  },
  {
    no: 'NO. 004',
    accent: ACCENTS.pumpkin,
    title: 'Rainfall on two fields, free',
    copy:
      'A free farm gets automatic rainfall on its two oldest fields in the contiguous US. Those two are locked, and you can\u2019t change them. Pro unlocks rainfall on all remaining fields.',
  },
  {
    no: 'NO. 005',
    accent: ACCENTS.red,
    title: 'Paperwork for the office',
    copy:
      'Prepared FSA reports and landlord summaries are built from your own records. The finished worksheet is part of Pro.',
  },
  {
    no: 'NO. 006',
    accent: ACCENTS.red,
    title: 'Your records stay yours',
    copy:
      'Export what you logged on the free book or on Pro. We back up a free farm\u2019s data too. Restoring a backup is part of Pro.',
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
    alt: 'AcreLedger Pro reports screen showing the FSA-578 acreage worksheet ready to export',
    frame: 'landing-phone--sky',
    caption: 'Prepared FSA reports (Pro)',
    detail: 'See missing details before you drive to the FSA office.',
  },
  {
    src: activityShot,
    alt: 'AcreLedger activity feed (Pro grain movement shown) listing grain going into a bin and harvested corn records',
    frame: 'landing-phone--red',
    caption: 'The whole season, one feed',
    detail: 'Harvest stays on the free book. Grain bins are part of Pro, and that\u2019s what\u2019s shown here.',
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
      'Export your records any time. Pro adds prepared FSA acreage worksheets, prepared spray logs, and landlord summaries as a PDF or CSV when the co-op, landlord, or FSA office asks.',
  },
];

const includedFree = [
  'Field records on up to 50 active fields',
  'Add fields by hand. FSA tract entry is part of Pro',
  'Automatic rainfall on your two oldest fields in the contiguous US. Those two are locked, and you can\u2019t change them',
  'History, offline entry, and cloud sync',
  'Export your records. We back up a free farm\u2019s data too. Restoring a backup is part of Pro',
  'No ads, and no card needed',
];

const includedPro = [
  'Automatic rainfall on all remaining fields',
  'Prepared FSA reports',
  'Backup restore',
  'Landlord summaries and the business tools, including grain bins, equipment, FSA tract entry, and landlord splits',
];

const faqs = [
  {
    question: 'Do I need FSA boundary files before I start?',
    answer:
      'No. Add fields by hand and start recording the same day. FSA tract entry is part of Pro. Your earlier records stay with their fields.',
  },
  {
    question: 'Does AcreLedger replace official USDA or product-label requirements?',
    answer:
      'No. AcreLedger creates working documents from the information you enter. Follow product labels and confirm filing requirements with your county FSA office or other authority.',
  },
  {
    question: 'What does AcreLedger cost?',
    answer:
      'Each farm starts on the free record book. You can keep records on up to 50 active fields, with automatic rainfall on your two oldest fields. You can\u2019t change those two, and no card is needed. Pro is $299 per farm per year (A$299 in Australia) for rainfall on all remaining fields, prepared FSA reports, backup restore, and the business tools (including grain bins, equipment, FSA tract entry, and landlord splits). If you never upgrade, you keep the free record book. You can export your records any time, and skipping Pro never deletes anything. We back up a free farm\u2019s data too.',
  },
  {
    question: 'Who owns the records I keep here?',
    answer:
      'You do. Export PDFs and CSVs whenever you need them. We back up a free farm\u2019s data too. Restoring a backup is part of Pro. AcreLedger keeps the book; the records stay yours.',
  },
  {
    question: 'Does automatic rainfall work everywhere?',
    answer:
      'Automatic rainfall is for fields in the contiguous United States. It isn\u2019t available for fields outside that area, including Australia. You can still log weather by hand.',
  },
  {
    question: 'Does it work without cell service?',
    answer:
      'Yes. Entries save on your phone first and sync when you are back in range.',
  },
];

const Landing = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isNative = Capacitor.isNativePlatform();

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
            {!isNative && (
              <Link
                className="landing-header-cta landing-header-cta--solid"
                to="/auth?mode=signup"
              >
                Open the book
              </Link>
            )}
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
                Keep field work and FSA paperwork in one place
              </h1>
              <p className="landing-hero-sub" data-reveal style={revealDelay(160)}>
                AcreLedger is the field book that rides in the truck. Log planting,
                spraying, fertilizer, harvest, and hay by field, even with no
                signal. Prepared FSA reports, landlord summaries, and rainfall on
                all remaining fields are part of Pro.
              </p>
              <p className="landing-hero-sub">Works in any web browser.</p>
              <div className="landing-hero-actions" data-reveal style={revealDelay(240)}>
                <Link
                  className="landing-btn"
                  to={isNative ? '/auth?mode=signin' : '/auth?mode=signup'}
                >
                  {isNative ? 'Sign in to AcreLedger' : 'Open your farm book'}
                </Link>
                <a className="landing-btn landing-btn--ghost" href="#features">
                  See what it handles
                </a>
              </div>
              {!isNative && (
                <>
                  <p className="landing-hero-terms" data-reveal style={revealDelay(320)}>
                    Free record book. No card needed. Pro is $299 per farm per year.
                  </p>
                </>
              )}
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
              <strong>AcreLedger is that book</strong>, kept current. Prepared
              FSA reports and landlord summaries are part of Pro.
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

        {!isNative && (
          <>
            <hr className="landing-hr" data-reveal="rule" />

            {/* ENTRY 006 — Pricing as a scale ticket */}
            <section className="landing-section" id="pricing">
              <span className="landing-entry-no">Entry 006</span>
              <h2 className="landing-h2" data-reveal>
                What it costs.
              </h2>
              <p className="landing-lede" data-reveal style={revealDelay(80)}>
                Free record book. No card needed. Pro is $299 per farm per year.
              </p>
              <div className="landing-ticket-wrap">
                <dl className="landing-ticket" data-reveal>
                  <div className="landing-ticket-head">
                    <span>AcreLedger</span>
                    <span>No. 2026-001</span>
                  </div>
                  <div className="landing-ticket-line" style={accent(ACCENTS.green)}>
                    <dt>Farm subscription</dt>
                    <dd>Free record book. Pro is $299.00 per farm / year, billed annually.</dd>
                  </div>
                  <div className="landing-ticket-line" style={accent(ACCENTS.gold)}>
                    <dt>Your records</dt>
                    <dd>
                      Yours
                      <small>PDF · CSV · full backup export</small>
                    </dd>
                  </div>
                  <p className="landing-ticket-note">
                    Your farm starts on the free record book the day you set it up, and you don’t need a card. Pro is $299 per farm per year, billed annually, for rainfall on all remaining fields, prepared FSA reports, backup restore, and the business tools. Internet service, third-party services, and professional or government filing fees cost extra.
                  </p>
                </dl>

                <div data-reveal style={revealDelay(120)}>
                  <p className="landing-included-title">The free record book</p>
                  <ul className="landing-included">
                    {includedFree.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="landing-included-title">Pro — $299 per farm per year</p>
                  <ul className="landing-included">
                    {includedPro.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="landing-hero-actions">
                    <Link className="landing-btn" to="/auth?mode=signup">
                      Open your farm book
                    </Link>
                  </div>
                  <p className="landing-hero-terms">
                    Free record book. No card needed. Pro is $299 per farm per year.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        <hr className="landing-hr" data-reveal="rule" />

        {/* ENTRY 007 — FAQ */}
        <section className="landing-section" id="faq">
          <span className="landing-entry-no">Entry 007</span>
          <h2 className="landing-h2" data-reveal>
            The practical details.
          </h2>
          <p className="landing-lede" data-reveal style={revealDelay(80)}>
            Have a question about using AcreLedger on your farm? Email{" "}
            <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
          </p>
          <div className="landing-faq" data-reveal style={revealDelay(120)}>
            {faqs
              .filter(
                (faq) =>
                  !isNative || faq.question !== 'What does AcreLedger cost?',
              )
              .map((faq) => (
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
              <Link
                className="landing-btn landing-btn--light"
                to={isNative ? '/auth?mode=signin' : '/auth?mode=signup'}
              >
                {isNative ? 'Sign in to AcreLedger' : 'Open your farm book'}
              </Link>
            </div>
            {!isNative && (
              <p className="landing-final-terms" data-reveal style={revealDelay(200)}>
                Free record book. No card needed. Pro is $299 per farm per year.
              </p>
            )}
            <div className="landing-stamp" data-reveal="stamp" style={revealDelay(320)}>
              FIELD NOTES IN
              <small>WHEN YOU NEED THEM</small>
            </div>
          </section>
        </div>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span>AcreLedger</span>
          <a href={SUPPORT_MAILTO}>Contact</a>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of service</Link>
          <Link to="/refund">Refund policy</Link>
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
