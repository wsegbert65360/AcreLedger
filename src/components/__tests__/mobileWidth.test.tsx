/**
 * @vitest-environment jsdom
 *
 * 400px is the narrowest phone width we QA. These class and CSS guards stop a
 * slightly-too-wide descendant from creating page-level horizontal scroll.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({
  native: { haptic: { light: vi.fn() } },
}));

import BottomNav from '@/components/BottomNav';
import { MobileReportExportPanel } from '@/components/reports/MobileReportExportPanel';
import { ReportPreview } from '@/components/reports/ReportPreview';
import { buildReportReadinessSummary } from '@/lib/reportReadiness';

const src = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('400px overflow guards', () => {
  it('clips horizontal overflow at html and #root without overflow-x: hidden', () => {
    const css = src('src/index.css');
    expect(css).toMatch(/html\s*,\s*#root\s*\{[^}]*overflow-x:\s*clip/);
    expect(css).toMatch(/html\s*,\s*#root\s*\{[^}]*max-width:\s*100%/);
    const rootBlock = css.slice(css.search(/html\s*,\s*#root\s*\{/), css.indexOf('body {'));
    expect(rootBlock).not.toMatch(/overflow-x:\s*hidden/);
    expect(css).toMatch(/\.app-shell\s*\{[^}]*min-width:\s*0/);
  });

  it('shares BottomNav width across equal shrinking columns', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const row = nav.firstElementChild as HTMLElement;
    expect(row).toHaveClass('flex', 'w-full', 'min-w-0');
    expect(row).not.toHaveClass('justify-around');

    const tabs = screen.getAllByRole('link');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Fields',
      'Storage',
      'Activity',
      'Reports',
      'Settings',
    ]);
    for (const tab of tabs) {
      expect(tab).toHaveClass('flex-1', 'min-w-0', 'h-16');
      expect(tab).not.toHaveClass('touch-target');
      const label = tab.querySelector('span');
      expect(label).toHaveClass('truncate', 'max-w-full', 'text-center');
    }
  });

  it('wraps the FSA-578 preview heading and clips the watermark on small screens', () => {
    render(
      <MemoryRouter>
        <ReportPreview
          title="FSA-578 Acreage Reporting Worksheet"
          headers={['Field']}
          rows={[]}
        />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { name: 'FSA-578 Acreage Reporting Worksheet' });
    expect(heading).toHaveClass('min-w-0', 'break-words');

    const css = src('src/index.css');
    expect(css).toMatch(/\.report-preview-watermark\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.report-preview-watermark\s*\{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.report-preview-watermark/);
  });

  it('lets the mobile export title wrap beside the icon', () => {
    const summary = buildReportReadinessSummary({ totalItems: 0, issues: [] });
    render(
      <MobileReportExportPanel
        title="FSA-578 Acreage Reporting Worksheet"
        description="Prepare the worksheet for county office review."
        summary={summary}
        itemLabel="fields"
      />,
    );

    const heading = screen.getByRole('heading', { name: 'FSA-578 Acreage Reporting Worksheet' });
    expect(heading).toHaveClass('break-words');
    expect(heading.parentElement).toHaveClass('min-w-0');
  });

  it('keeps Activity and Reports scroll rows from expanding the page', () => {
    const activity = src('src/pages/Activity.tsx');
    expect(activity).toMatch(/relative min-w-0 flex-1/);
    expect(activity).toMatch(/className="min-w-0 w-full px-4 py-3/);
    expect(activity).toMatch(/flex min-w-0 gap-1\.5 overflow-x-auto/);
    expect(activity).toMatch(/relative min-w-0/);
    expect(activity).toMatch(/flex min-w-0 flex-wrap items-center gap-1\.5/);

    const reports = src('src/pages/Reports.tsx');
    expect(reports).toMatch(/relative min-w-0 max-w-full print:hidden/);
    expect(reports).toMatch(/flex h-auto w-full min-w-0 max-w-full justify-start gap-1 overflow-x-auto/);
  });
});
