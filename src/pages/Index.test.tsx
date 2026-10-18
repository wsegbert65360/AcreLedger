/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const farmState = vi.hoisted(() => ({
  fields: [{
    id: 'field-1',
    name: 'North Field',
    acreage: 29,
    intendedUse: 'Corn',
    farm_id: 'farm-1',
    deleted_at: null,
  }],
  cluAssignments: [],
  plantRecords: [],
  sprayRecords: [],
  fertilizerApplications: [],
  harvestRecords: [],
  hayHarvestRecords: [],
  viewingSeason: 2026,
  equipment: [],
  maintenanceSchedules: [],
}));

vi.mock('@/store/farmStore', () => ({ useFarm: () => farmState }));
vi.mock('@/context/AskAcreLedgerContext', () => ({
  useAskAcreLedger: () => ({ openAsk: vi.fn() }),
}));
vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/FieldList', () => ({ default: () => <div>Field list</div> }));
vi.mock('@/components/FieldManageModal', () => ({ default: () => null }));
vi.mock('@/components/FieldManager', () => ({ default: () => null }));
vi.mock('@/components/Logo', () => ({ default: () => <div>Logo</div> }));
vi.mock('@/components/SeasonSelect', () => ({ default: () => <div>Season</div> }));
vi.mock('@/components/WeatherWidget', () => ({ default: () => <div>Weather</div> }));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/equipment/feature', () => ({ isEquipmentUiEnabled: () => false }));

import Index from './Index';

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

describe('Index field search keyboard visibility', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    } else {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: undefined,
      });
    }
    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewport);
    } else {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: undefined,
      });
    }
  });

  it('scrolls the field search into view when it receives focus', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });

    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.focus(screen.getByLabelText('Search fields'));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end', inline: 'nearest' });
    });
  });

  it('adds scroll room and re-scrolls when the iOS visual viewport shrinks', async () => {
    let resizeListener: (() => void) | undefined;
    const viewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'resize') resizeListener = listener as () => void;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });

    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    const input = screen.getByLabelText('Search fields');
    act(() => input.focus());
    scrollIntoView.mockClear();

    viewport.height = 500;
    act(() => resizeListener?.());

    await waitFor(() => {
      expect(input.closest('main')).toHaveStyle({ paddingBottom: '300px' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end', inline: 'nearest' });
    });
  });

  it('re-scrolls without extra padding when Android resizes both viewports', async () => {
    let resizeListener: (() => void) | undefined;
    const viewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'resize') resizeListener = listener as () => void;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });

    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    const input = screen.getByLabelText('Search fields');
    act(() => input.focus());
    scrollIntoView.mockClear();

    window.innerHeight = 500;
    viewport.height = 500;
    act(() => resizeListener?.());

    await waitFor(() => {
      expect(input.closest('main')).not.toHaveStyle({ paddingBottom: '300px' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end', inline: 'nearest' });
    });
  });

  // jsdom's cssstyle cannot clear a padding longhand once set, so assert the reset path via the
  // viewport listeners being detached instead of reading main.style after close.
  it('stops tracking the keyboard when search closes', async () => {
    let resizeListener: (() => void) | undefined;
    const viewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'resize') resizeListener = listener as () => void;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });

    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    const main = screen.getByLabelText('Search fields').closest('main')!;
    viewport.height = 500;
    act(() => resizeListener?.());
    await waitFor(() => expect(main).toHaveStyle({ paddingBottom: '300px' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByLabelText('Search fields')).toBeNull();
    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

/** `absolute` at the mobile breakpoint, allowing only an `sm:`-prefixed token. */
function hasMobileAbsolute(className: string): boolean {
  return className.split(/\s+/).some((token) => {
    if (!token || token === 'sm:absolute') return false;
    return token === 'absolute' || (token.endsWith(':absolute') && !token.split(':').includes('sm'));
  });
}

describe('dashboard header season pill at 360px and 400px (#63)', () => {
  it('keeps the season selector in flow below the Manage button instead of overlapping it', () => {
    render(<Index />);

    const manage = screen.getByRole('button', { name: 'Manage fields' });
    const actionRow = manage.parentElement as HTMLElement;
    expect(hasMobileAbsolute(actionRow.className)).toBe(false);

    const seasonRow = screen.getAllByText('Season')
      .map((node) => node.parentElement as HTMLElement)
      .find((row) => row.className.split(/\s+/).includes('sm:hidden'));
    expect(seasonRow).toBeTruthy();
    expect(hasMobileAbsolute(seasonRow!.className)).toBe(false);
    expect(actionRow.contains(seasonRow!)).toBe(false);
    expect(seasonRow!.parentElement).toBe(actionRow.parentElement);

    const siblings = Array.from(actionRow.parentElement!.children);
    expect(siblings.indexOf(seasonRow!)).toBeGreaterThan(siblings.indexOf(actionRow));
  });
});
