/**
 * @vitest-environment jsdom
 */
import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddProvider, useQuickAdd } from '@/context/QuickAddContext';
import { buttonVariants } from '@/components/ui/button';

const farm = vi.hoisted(() => ({
  session: null as { user?: { id: string } } | null,
  fields: [] as Array<{
    id: string;
    name: string;
    acreage: number;
    lat: number | null;
    lng: number | null;
    deleted_at: null;
    farm_id: string;
  }>,
  cluAssignments: [] as unknown[],
  plantRecords: [] as unknown[],
  sprayRecords: [] as unknown[],
  harvestRecords: [] as unknown[],
  hayHarvestRecords: [] as unknown[],
  customSprayRecords: [] as unknown[],
  fertilizerApplications: [] as unknown[],
  tillageRecords: [] as unknown[],
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farm,
}));

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({
    preferences: { country: 'US', locale: 'en-US', unitSystem: 'imperial' },
  }),
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn() },
    geolocation: {
      getCurrentPosition: vi.fn().mockResolvedValue({ coords: { latitude: 41, longitude: -93 } }),
    },
  },
}));

vi.mock('@/components/SprayTypeChooser', () => ({ default: () => null }));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (next: string) => void;
    children?: ReactNode;
  }) => (
    <select
      id="quickAddField"
      aria-label="Target Field"
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">Select a field</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => (
    <option value={value}>{value}</option>
  ),
}));

import QuickAddDialog from '../QuickAddDialog';

const northField = {
  id: 'field-1',
  name: 'North Field',
  acreage: 40,
  lat: null,
  lng: null,
  deleted_at: null,
  farm_id: 'farm-1',
};

function HarvestHarness() {
  const { openQuickAdd } = useQuickAdd();
  const [, setRevision] = useState(0);
  return (
    <>
      <button type="button" onClick={() => openQuickAdd('harvest')}>Open harvest</button>
      <button
        type="button"
        onClick={() => {
          farm.fields = [northField];
          setRevision((revision) => revision + 1);
        }}
      >
        Add field
      </button>
      <QuickAddDialog />
    </>
  );
}

describe('Quick Add disabled Log button', () => {
  beforeEach(() => {
    farm.fields = [];
  });

  it('gives the default variant a muted disabled treatment', () => {
    const classes = buttonVariants({ variant: 'default' });
    expect(classes).toContain('disabled:bg-muted');
    expect(classes).toContain('disabled:text-muted-foreground');
    expect(classes).toContain('disabled:cursor-not-allowed');
  });

  it('shows Pick a field first while Harvesting has no field, then enables Log after one is picked', () => {
    render(
      <QuickAddProvider>
        <HarvestHarness />
      </QuickAddProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open harvest' }));

    const logButton = screen.getByRole('button', { name: 'Log Harvesting' });
    const hint = screen.getByText('Pick a field first');
    expect(logButton).toBeDisabled();
    expect(logButton).toHaveAttribute('aria-describedby', 'quick-add-pick-field-hint');
    expect(hint).toHaveAttribute('id', 'quick-add-pick-field-hint');
    expect(hint).toHaveClass('text-xs', 'text-muted-foreground');
    expect(logButton.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(logButton).toHaveClass('disabled:bg-muted', 'disabled:text-muted-foreground', 'disabled:cursor-not-allowed');

    fireEvent.click(screen.getByRole('button', { name: 'Add field', hidden: true }));

    expect(screen.getByRole('button', { name: 'Log Harvesting' })).toBeDisabled();
    expect(screen.getByText('Pick a field first')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Target Field' }), {
      target: { value: 'field-1' },
    });

    expect(screen.queryByText('Pick a field first')).not.toBeInTheDocument();
    const enabled = screen.getByRole('button', { name: 'Log Harvesting' });
    expect(enabled).toBeEnabled();
    expect(enabled).not.toHaveAttribute('aria-describedby');
  });
});
