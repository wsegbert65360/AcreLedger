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
  body: 'This is where you add a field.',
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
    expect(screen.getByText('This is where you add a field.')).toBeInTheDocument();
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

  it('shows a step whose target never appears centered instead of skipping it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const h = renderOverlay();
    act(() => { vi.advanceTimersByTime(TARGET_WAIT_MS + 100); });
    expect(h.onNext).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /Add your fields/ });
    expect(dialog).toHaveAttribute('data-placement', 'centered');
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('keeps waiting while a lazy route is still loading, then finds the target', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const fallback = document.createElement('div');
    fallback.setAttribute('data-route-fallback', '');
    document.body.appendChild(fallback);
    const h = renderOverlay();
    act(() => { vi.advanceTimersByTime(TARGET_WAIT_MS * 3); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fallback.remove();
    addTarget({ id: step.targetId });
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'target');
    expect(h.onNext).not.toHaveBeenCalled();
  });

  it('blocks clicks on the spotlighted control', () => {
    const target = addTarget({ id: step.targetId });
    const clicked = vi.fn();
    target.addEventListener('click', clicked);
    const h = renderOverlay();
    const blocker = screen.getByTestId('coachmark-click-blocker');
    expect(blocker.className).toMatch(/\binset-0\b/);
    expect(blocker.className).toMatch(/pointer-events-auto/);
    fireEvent.click(blocker);
    expect(clicked).not.toHaveBeenCalled();
    expect(h.onNext).not.toHaveBeenCalled();
  });

  it('makes the app behind the tour inert and hidden from assistive technology, then restores it', () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    appRoot.setAttribute('aria-hidden', 'false');
    document.body.appendChild(appRoot);
    const target = addTarget({ id: step.targetId });
    const view = render(
      <CoachmarkOverlay step={step} stepIndex={0} totalSteps={4} isLast={false} {...handlers()} />,
    );
    expect(appRoot).toHaveAttribute('inert');
    expect(appRoot).toHaveAttribute('aria-hidden', 'true');
    expect(target).toHaveAttribute('inert');
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('[inert]')).toBeNull();
    expect(dialog.closest('[aria-hidden="true"]')).toBeNull();

    view.unmount();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(appRoot).toHaveAttribute('aria-hidden', 'false');
    expect(target).not.toHaveAttribute('inert');
    expect(target).not.toHaveAttribute('aria-hidden');
    expect(document.querySelector('[data-coachmark-host]')).toBeNull();
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

  it('tour copy says "This is where" and does not promise Quick Add from anywhere', () => {
    let steps: ReturnType<typeof useCoachmarks>['steps'] = [];
    function Probe() { steps = useCoachmarks({ userId: 'copy', enabled: false }).steps; return null; }
    render(<Probe />);
    const text = steps.map(s => s.body).join('\n');
    expect(text).not.toMatch(/Tap here/);
    expect(text).not.toMatch(/from anywhere/);
    expect(steps.find(s => s.id === 'addField')?.body).toMatch(/^This is where/);
    expect(steps.find(s => s.id === 'quickAdd')?.body).toMatch(/^Use Quick Add here/);
  });

  it('the lazy-route fallback is marked so the tour can wait for it', () => {
    expect(src('App.tsx')).toContain('data-route-fallback');
  });

  it('Quick Add is targeted on both mobile and desktop', () => {
    expect(src('App.tsx')).toContain('id="coachmark-quick-add"');
    expect(src('components/Sidebar.tsx')).toContain('data-coachmark="coachmark-quick-add"');
  });
});
