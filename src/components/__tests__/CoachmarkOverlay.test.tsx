/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CoachmarkOverlay from '@/components/CoachmarkOverlay';
import { TARGET_WAIT_MS, findCoachmarkTarget } from '@/lib/coachmarkTarget';
import { useCoachmarks, type CoachmarkStep } from '@/hooks/useCoachmarks';

const step: CoachmarkStep = {
  id: 'addField',
  targetId: 'coachmark-test-target',
  title: 'Add your fields',
  body: 'Tap here to add a field.',
  placement: 'bottom',
};

function box(el: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

function addTarget(attrs: { id?: string; coachmark?: string }, rect = { top: 100, left: 40, width: 44, height: 44 }) {
  const el = document.createElement('button');
  if (attrs.id) el.id = attrs.id;
  if (attrs.coachmark) el.setAttribute('data-coachmark', attrs.coachmark);
  box(el, rect);
  document.body.appendChild(el);
  return el;
}

const handlers = () => ({ onNext: vi.fn(), onBack: vi.fn(), onSkip: vi.fn() });

function renderOverlay(h = handlers(), stepIndex = 0) {
  render(
    <CoachmarkOverlay step={step} stepIndex={stepIndex} totalSteps={4} isLast={false} {...h} />,
  );
  return h;
}

describe('CoachmarkOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the title, body, Next and Skip when the target exists', () => {
    addTarget({ id: step.targetId });
    renderOverlay();
    expect(screen.getByRole('dialog', { name: /Add your fields/ })).toBeVisible();
    expect(screen.getByText('Tap here to add a field.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('step 1 of 4');
  });

  it('places the tooltip in viewport coordinates, ignoring page scroll', () => {
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    addTarget({ id: step.targetId }, { top: 100, left: 40, width: 44, height: 44 });
    renderOverlay();
    const dialog = screen.getByRole('dialog');
    // bottom placement: target bottom (144) + 12 margin. No scrollY added.
    expect(dialog.style.top).toBe('156px');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('recovers when the target mounts after the overlay', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    renderOverlay();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    addTarget({ id: step.targetId });
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByRole('dialog', { name: /Add your fields/ })).toBeInTheDocument();
  });

  it('skips a step whose target never appears instead of hanging invisibly', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const h = renderOverlay();
    act(() => { vi.advanceTimersByTime(TARGET_WAIT_MS + 100); });
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });

  it('prefers the visible desktop target over a hidden mobile one', () => {
    addTarget({ id: step.targetId }, { top: 0, left: 0, width: 0, height: 0 });
    const desktop = addTarget({ coachmark: step.targetId }, { top: 10, left: 10, width: 200, height: 40 });
    expect(findCoachmarkTarget(step.targetId)).toBe(desktop);
  });

  it('focuses Next, skips on Escape and keeps Tab inside the tooltip', () => {
    addTarget({ id: step.targetId });
    const h = renderOverlay(handlers(), 1);
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Skip tour' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onSkip).toHaveBeenCalledTimes(1);
  });

  it('uses 44px controls', () => {
    addTarget({ id: step.targetId });
    renderOverlay(handlers(), 1);
    for (const name of ['Next', 'Back', 'Skip tour']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/\bh-11\b/);
    }
  });
});

describe('coachmark target contract', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

  it('every step target exists in the app shell or Fields page', () => {
    const { result } = (() => {
      let value: ReturnType<typeof useCoachmarks> | null = null;
      function Probe() { value = useCoachmarks({ userId: 'contract', enabled: false }); return null; }
      render(<Probe />);
      return { result: value! };
    })();
    const sources = ['pages/Index.tsx', 'App.tsx', 'components/BottomNav.tsx', 'components/Sidebar.tsx']
      .map(src).join('\n');
    for (const s of result.steps) {
      expect(sources, s.targetId).toContain(s.targetId);
    }
  });

  it('step 1 points at the Add field button, not Manage', () => {
    expect(src('pages/Index.tsx')).toMatch(/id="coachmark-add-field"\s+onClick=\{\(\) => setAddOpen\(true\)\}\s+aria-label="Add new field"/);
  });

  it('Quick Add is targeted on both mobile and desktop', () => {
    expect(src('App.tsx')).toContain('id="coachmark-quick-add"');
    expect(src('components/Sidebar.tsx')).toContain('data-coachmark="coachmark-quick-add"');
  });
});
