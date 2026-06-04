/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SprayModal from '../SprayModal';
import { Field, SprayRecord } from '@/types/farm';

// --- Mocks ---
const addSprayRecordMock = vi.fn().mockResolvedValue(true);
const updateSprayRecordMock = vi.fn().mockResolvedValue(true);

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addSprayRecord: addSprayRecordMock,
    updateSprayRecord: updateSprayRecordMock,
    sprayRecipes: [],
    session: { user: { id: 'test-user-id' } },
    viewingSeason: 2026,
    farmName: 'Test Farm'
  })
}));

vi.mock('@/services/WeatherService', () => ({
  WeatherService: {
    fetchCurrentWeather: vi.fn().mockResolvedValue(null),
    fetchHistoricalConditions: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
      light: vi.fn()
    }
  }
}));

// Mock custom UI elements to avoid jsdom Radix portal bugs
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={e => onValueChange(e.target.value)} data-testid="select">
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>
}));

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children }: any) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onCheckedChange(e.target.checked)}
      data-testid="switch"
    />
  )
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onCheckedChange(e.target.checked)}
      data-testid="checkbox"
    />
  )
}));

describe('SprayModal Data Retention', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  const fullyCompliantData: SprayRecord = {
    id: 'spray-123',
    fieldId: 'field-1',
    fieldName: 'North Field',
    products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
    windSpeed: 5,
    temperature: 75,
    timestamp: Date.now(),
    seasonYear: 2025, // Record created in past season (2025)
    treatedAreaSize: 80,
    totalAmountApplied: 1770,
    nonCompliant: false,
    deleted_at: null,
    applicatorName: 'Cert Applicator',
    licenseNumber: 'L12345',
    epaRegNumber: '524-549',
    sprayDate: '2025-05-01',
    startTime: '08:00',
    endTime: '09:00',
    cropOrSiteTreated: 'Corn',
    applicationMethod: 'Ground Broadcast',
    equipmentId: 'Miller Nitro',
    windDirection: 'NW',
    relativeHumidity: 45,
    farm_id: 'farm-1'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the original seasonYear when updating an existing spray record', async () => {
    render(
      <SprayModal
        field={field}
        open={true}
        onClose={vi.fn()}
        initialData={fullyCompliantData}
      />
    );

    // Find and click the Update button
    const updateBtn = screen.getByRole('button', { name: /Update Spray Record/i });
    fireEvent.click(updateBtn);

    // Verify updateSprayRecord is called with the original seasonYear (2025), not the global viewingSeason (2026)
    expect(updateSprayRecordMock).toHaveBeenCalledTimes(1);
    expect(updateSprayRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'spray-123',
        seasonYear: 2025
      })
    );
  });

  it('correctly maps and retains wind speed of 0', async () => {
    const dataWithZeroWind: SprayRecord = {
      ...fullyCompliantData,
      windSpeed: 0,
      windDirection: 'CALM'
    };

    render(
      <SprayModal
        field={field}
        open={true}
        onClose={vi.fn()}
        initialData={dataWithZeroWind}
      />
    );

    // Check that wind speed input displays 0
    const windSpeedInput = screen.getByLabelText(/Wind Speed/i) as HTMLInputElement;
    expect(windSpeedInput.value).toBe('0');

    // Submit the form
    const updateBtn = screen.getByRole('button', { name: /Update Spray Record/i });
    fireEvent.click(updateBtn);

    // Verify updateSprayRecord is called preserving the 0 wind speed
    expect(updateSprayRecordMock).toHaveBeenCalledTimes(1);
    expect(updateSprayRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        windSpeed: 0
      })
    );
  });
});
