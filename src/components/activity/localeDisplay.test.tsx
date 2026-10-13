import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GrainTab from './GrainTab';
import HarvestTab from './HarvestTab';
import HistoryFeed from './HistoryFeed';

const mocks = vi.hoisted(() => ({
  preferences: vi.fn(),
  session: { user: { id: 'farmer-1' } } as { user: { id: string } } | null,
  format: vi.fn(),
}));
vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({ session: mocks.session }),
}));
vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: mocks.preferences,
}));
vi.mock('@/lib/locale/numbers', () => ({ formatNumber: mocks.format }));
vi.mock('@/components/RecordListItem', () => ({
  default: ({ subtitle }: { subtitle: string }) => <p>{subtitle}</p>,
}));

const harvest = {
  id: 'h1', fieldId: 'f1', fieldName: 'Field', destination: 'town' as const,
  moisturePercent: 11, landlordSplitPercent: 0, bushels: 1234.5678,
  timestamp: 0, seasonYear: 2026, crop: 'Corn', harvestDate: '2026-10-10',
  farm_id: 'farm', deleted_at: null,
};
const grain = {
  id: 'g1', binId: 'b1', binName: 'Bin', type: 'in' as const,
  bushels: 1234.5678, moisturePercent: 11, timestamp: 0, seasonYear: 2026,
  farm_id: 'farm', deleted_at: null,
};
const props = { selected: new Set<string>(), onToggle: vi.fn(), onEdit: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: 'farmer-1' } };
  mocks.format.mockReturnValue('locale-formatted');
});

describe.each(['en-US', 'en-AU'] as const)('activity card locale wiring: %s', (locale) => {
  beforeEach(() => {
    mocks.preferences.mockReturnValue({ preferences: { locale } });
  });
  it('uses signed-in preferences on the harvest tab', () => {
    render(<HarvestTab {...props} records={[harvest]} />);
    expect(screen.getByText('Corn · locale-formatted BU')).toBeInTheDocument();
    expect(mocks.preferences).toHaveBeenCalledWith('farmer-1');
    expect(mocks.format).toHaveBeenCalledWith(1234.5678, locale, { maximumFractionDigits: 3 });
  });
  it('uses signed-in preferences on the grain tab', () => {
    render(<GrainTab {...props} records={[grain]} />);
    expect(screen.getByText('In · locale-formatted BU')).toBeInTheDocument();
    expect(mocks.preferences).toHaveBeenCalledWith('farmer-1');
    expect(mocks.format).toHaveBeenCalledWith(1234.5678, locale, { maximumFractionDigits: 3 });
  });
  it('passes preferences to both card types in the history feed', () => {
    render(<HistoryFeed {...props} records={[{ type: 'harvest', data: harvest }, { type: 'grain', data: grain }]} />);
    expect(screen.getByText('Corn · locale-formatted BU')).toBeInTheDocument();
    expect(screen.getByText('In · locale-formatted BU')).toBeInTheDocument();
    expect(mocks.preferences).toHaveBeenCalledWith('farmer-1');
    expect(mocks.format).toHaveBeenCalledTimes(2);
    expect(mocks.format).toHaveBeenNthCalledWith(1, 1234.5678, locale, { maximumFractionDigits: 3 });
    expect(mocks.format).toHaveBeenNthCalledWith(2, 1234.5678, locale, { maximumFractionDigits: 3 });
  });
});


describe('signed-out activity locale scope', () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.preferences.mockImplementation((userId?: string | null) => ({
      preferences: { locale: userId === null ? 'en-US' : 'en-AU' },
    }));
    mocks.format.mockImplementation((value: number, locale: string) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value));
  });

  it.each(['harvest', 'grain', 'history'] as const)('uses null scope and en-US defaults on %s', (tab) => {
    if (tab === 'harvest') render(<HarvestTab {...props} records={[harvest]} />);
    if (tab === 'grain') render(<GrainTab {...props} records={[grain]} />);
    if (tab === 'history') render(<HistoryFeed {...props} records={[{ type: 'harvest', data: harvest }, { type: 'grain', data: grain }]} />);
    expect(mocks.preferences).toHaveBeenCalledWith(null);
    expect(mocks.preferences).not.toHaveBeenCalledWith(undefined);
    expect(mocks.format).toHaveBeenCalledWith(1234.5678, 'en-US', { maximumFractionDigits: 3 });
    expect(screen.getAllByText(/1,234\.568 BU/)).toHaveLength(tab === 'history' ? 2 : 1);
  });
});
