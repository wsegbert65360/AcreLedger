/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SprayModal from '../SprayModal';
import { Field, SprayRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { WeatherService } from '@/services/WeatherService';

// --- Mocks ---
const addSprayRecordMock = vi.fn().mockResolvedValue(true);
const updateSprayRecordMock = vi.fn().mockResolvedValue(true);
let mockCluAssignments: FieldCluAssignment[] = [];

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addSprayRecord: addSprayRecordMock,
    updateSprayRecord: updateSprayRecordMock,
    sprayRecipes: [],
    sprayRecords: [],
    cluAssignments: mockCluAssignments,
    session: { user: { id: 'test-user-id' } },
    viewingSeason: 2026,
    farmName: 'Test Farm'
  })
}));

vi.mock('@/services/WeatherService', () => ({
  WeatherService: {
    fetchCurrentWeather: vi.fn(),
    fetchHistoricalConditions: vi.fn()
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
  Select: ({ children, value, onValueChange }: any) => {
    const trigger = (Array.isArray(children) ? children : [children]).find((c: any) => c?.props?.id);
    const collectOptions = (node: any): any[] => {
      if (!node) return [];
      if (Array.isArray(node)) return node.flatMap(collectOptions);
      if (node.props?.value != null) return [node];
      return collectOptions(node.props?.children);
    };

    return (
      <select
        id={trigger?.props?.id}
        value={value}
        onChange={e => onValueChange(e.target.value)}
        data-testid="select"
      >
        {collectOptions(children)}
      </select>
    );
  },
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null
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
    mockCluAssignments = [];
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue({
      wind: 0, temp: 0, humidity: 0, windDirection: '—', isError: true,
    });
    vi.mocked(WeatherService.fetchHistoricalConditions).mockResolvedValue(null);
  });

  const fillCoreStep = () => {
    act(() => {
      fireEvent.change(screen.getByLabelText(/application date/i), { target: { value: '2026-06-23' } });
      fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '08:00' } });
      fireEvent.change(screen.getByLabelText(/cert\. applicator/i), { target: { value: 'Cert Applicator' } });
      fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'L12345' } });
      fireEvent.change(screen.getByLabelText(/target pest/i), { target: { value: 'Grass' } });
    });
  };

  const clickNext = async () => {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    });
  };

  const fillMixStep = () => {
    act(() => {
      fireEvent.change(screen.getByLabelText(/trade name/i), { target: { value: 'Roundup' } });
    });
  };

  const navigateToConditions = async () => {
    fillCoreStep();
    await clickNext(); // core -> mix
    await waitFor(() => expect(screen.getByText(/Herbicide Mix/i)).toBeInTheDocument());
    fillMixStep();
    await clickNext(); // mix -> conditions
    await waitFor(() => expect(screen.getByLabelText(/Wind Speed/i)).toBeInTheDocument());
  };

  const navigateToReview = async () => {
    fillCoreStep();
    await clickNext(); // core -> mix
    await waitFor(() => expect(screen.getByText(/Herbicide Mix/i)).toBeInTheDocument());
    fillMixStep();
    await clickNext(); // mix -> conditions
    await waitFor(() => expect(screen.getByLabelText(/Wind Speed/i)).toBeInTheDocument());
    await clickNext(); // conditions -> review
    await waitFor(() => expect(screen.getByRole('button', { name: /Spray Record/i })).toBeInTheDocument());
  };

  it('auto-populates wind direction and speed when weather fetch succeeds for a new record', async () => {
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue({
      temp: 72,
      humidity: 45,
      wind: 8,
      windDirection: 'SSE',
      isError: false,
      precip24h: 0,
      precip72h: 0,
      precipProb: 0
    });

    const fieldWithLocation: Field = { ...field, lat: 41.5, lng: -93.6 };

    render(
      <SprayModal
        field={fieldWithLocation}
        open={true}
        onClose={vi.fn()}
      />
    );
    // Flush the mount-time weather fetch (useSprayForm auto-fetch effect) inside act
    await act(async () => {});

    await navigateToConditions();

    await waitFor(() => {
      const windSpeedInput = screen.getByLabelText(/Wind Speed/i) as HTMLInputElement;
      expect(windSpeedInput.value).toBe('8');
    });

    const windDirectionSelect = screen.getByLabelText(/Wind Direction/i) as HTMLSelectElement;
    expect(windDirectionSelect.value).toBe('SSE');
  });

  it('falls back to CALM/0 when weather API omits wind fields', async () => {
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue({
      temp: 72,
      humidity: 45,
      wind: NaN,
      windDirection: undefined as any,
      isError: false,
      precip24h: 0,
      precip72h: 0,
      precipProb: 0
    });

    const fieldWithLocation: Field = { ...field, lat: 41.5, lng: -93.6 };

    render(
      <SprayModal
        field={fieldWithLocation}
        open={true}
        onClose={vi.fn()}
      />
    );
    // Flush the mount-time weather fetch (useSprayForm auto-fetch effect) inside act
    await act(async () => {});

    await navigateToConditions();

    await waitFor(() => {
      const windSpeedInput = screen.getByLabelText(/Wind Speed/i) as HTMLInputElement;
      expect(windSpeedInput.value).toBe('0');
    });

    const windDirectionSelect = screen.getByLabelText(/Wind Direction/i) as HTMLSelectElement;
    expect(windDirectionSelect.value).toBe('CALM');
  });

  it('does not overwrite user-entered wind values when weather fetch returns later', async () => {
    let resolveWeather: (value: any) => void;
    vi.mocked(WeatherService.fetchCurrentWeather).mockImplementation(
      () => new Promise(resolve => { resolveWeather = resolve; })
    );

    const fieldWithLocation: Field = { ...field, lat: 41.5, lng: -93.6 };

    render(
      <SprayModal
        field={fieldWithLocation}
        open={true}
        onClose={vi.fn()}
      />
    );

    await navigateToConditions();

    const windSpeedInput = screen.getByLabelText(/Wind Speed/i) as HTMLInputElement;
    const windDirectionSelect = screen.getByLabelText(/Wind Direction/i) as HTMLSelectElement;

    // User types manual values before weather arrives
    act(() => {
      fireEvent.change(windSpeedInput, { target: { value: '12' } });
      fireEvent.change(windDirectionSelect, { target: { value: 'NW' } });
    });

    // Now weather arrives (resolve inside act so the hook's state updates are wrapped)
    await act(async () => {
      resolveWeather!({
        temp: 72,
        humidity: 45,
        wind: 8,
        windDirection: 'SSE',
        isError: false,
        precip24h: 0,
        precip72h: 0,
        precipProb: 0
      });
    });

    await waitFor(() => {
      expect(windSpeedInput.value).toBe('12');
    });
    expect(windDirectionSelect.value).toBe('NW');
  });

  it('refreshes untouched treated acreage when CLU assignments load after opening', async () => {
    const { rerender } = render(
      <SprayModal field={field} open={true} onClose={vi.fn()} />
    );

    await navigateToConditions();
    const treatedAreaInput = screen.getByLabelText(/Treated Area Size/i) as HTMLInputElement;
    expect(treatedAreaInput.value).toBe('80');

    mockCluAssignments = [{
      id: 'assignment-1',
      farmId: 'farm-1',
      fieldId: field.id,
      tractKey: '100-200',
      cluNumber: '1',
      acres: 55,
      landUse: 'cropland',
      assignedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }];
    rerender(<SprayModal field={field} open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(treatedAreaInput.value).toBe('55'));
  });

  it('preserves user-entered treated acreage when CLU assignments load later', async () => {
    const { rerender } = render(
      <SprayModal field={field} open={true} onClose={vi.fn()} />
    );

    await navigateToConditions();
    const treatedAreaInput = screen.getByLabelText(/Treated Area Size/i) as HTMLInputElement;
    fireEvent.change(treatedAreaInput, { target: { value: '12.5' } });

    mockCluAssignments = [{
      id: 'assignment-1',
      farmId: 'farm-1',
      fieldId: field.id,
      tractKey: '100-200',
      cluNumber: '1',
      acres: 55,
      landUse: 'cropland',
      assignedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }];
    rerender(<SprayModal field={field} open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(treatedAreaInput.value).toBe('12.5'));
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

    await navigateToReview();

    // Find and click the Update button
    const updateBtn = screen.getByRole('button', { name: /Update Spray Record/i });
    act(() => {
      fireEvent.click(updateBtn);
    });

    // Verify updateSprayRecord is called with the original seasonYear (2025), not the global viewingSeason (2026)
    await waitFor(() => expect(updateSprayRecordMock).toHaveBeenCalledTimes(1));
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

    await navigateToConditions();

    // Check that wind speed input displays 0
    const windSpeedInput = screen.getByLabelText(/Wind Speed/i) as HTMLInputElement;
    expect(windSpeedInput.value).toBe('0');

    await clickNext(); // conditions -> review
    await waitFor(() => expect(screen.getByRole('button', { name: /Update Spray Record/i })).toBeInTheDocument());

    // Submit the form
    const updateBtn = screen.getByRole('button', { name: /Update Spray Record/i });
    act(() => {
      fireEvent.click(updateBtn);
    });

    // Verify updateSprayRecord is called preserving the 0 wind speed
    await waitFor(() => expect(updateSprayRecordMock).toHaveBeenCalledTimes(1));
    expect(updateSprayRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        windSpeed: 0
      })
    );
  });
});

describe('SprayModal product deletion', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCluAssignments = [];
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue({
      wind: 0, temp: 0, humidity: 0, windDirection: '—', isError: true,
    });
    vi.mocked(WeatherService.fetchHistoricalConditions).mockResolvedValue(null);
  });

  const gotoMix = async () => {
    act(() => {
      fireEvent.change(screen.getByLabelText(/application date/i), { target: { value: '2026-06-23' } });
      fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '08:00' } });
      fireEvent.change(screen.getByLabelText(/cert\. applicator/i), { target: { value: 'Cert Applicator' } });
      fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'L12345' } });
      fireEvent.change(screen.getByLabelText(/target pest/i), { target: { value: 'Grass' } });
    });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Next/i })); });
    await waitFor(() => expect(screen.getByText(/Herbicide Mix/i)).toBeInTheDocument());
  };

  it('can delete the SECOND product from the tank mix', async () => {
    render(<SprayModal field={field} open={true} onClose={vi.fn()} />);
    await gotoMix();

    // fill first product
    const tradeNameInputs = screen.getAllByLabelText(/trade name/i);
    expect(tradeNameInputs.length).toBe(1);
    act(() => { fireEvent.change(tradeNameInputs[0], { target: { value: 'Roundup' } }); });

    // add a second product
    act(() => { fireEvent.click(screen.getByRole('button', { name: /add another product/i })); });
    await waitFor(() => expect(screen.getAllByLabelText(/trade name/i).length).toBe(2));
    act(() => { fireEvent.change(screen.getAllByLabelText(/trade name/i)[1], { target: { value: 'Dicamba' } }); });

    // click the Red X on the SECOND product
    const removeBtns = screen.getAllByRole('button', { name: /remove .+ from spray mix/i });
    expect(removeBtns.length).toBe(2);
    act(() => { fireEvent.click(removeBtns[1]); });

    // confirm removal
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent(/Remove Product/i);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^Remove$/i })); });

    // second product (Dicamba) should be gone, first (Roundup) stays
    await waitFor(() => expect(screen.getAllByLabelText(/trade name/i).length).toBe(1));
    expect((screen.getByLabelText(/trade name/i) as HTMLInputElement).value).toBe('Roundup');
  });

  it('can delete the FIRST product when two exist', async () => {
    render(<SprayModal field={field} open={true} onClose={vi.fn()} />);
    await gotoMix();

    act(() => { fireEvent.change(screen.getByLabelText(/trade name/i), { target: { value: 'Roundup' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /add another product/i })); });
    await waitFor(() => expect(screen.getAllByLabelText(/trade name/i).length).toBe(2));
    act(() => { fireEvent.change(screen.getAllByLabelText(/trade name/i)[1], { target: { value: 'Dicamba' } }); });

    const removeBtns = screen.getAllByRole('button', { name: /remove .+ from spray mix/i });
    act(() => { fireEvent.click(removeBtns[0]); });
    await waitFor(() => expect(screen.getByText(/Remove Product/i)).toBeInTheDocument());
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^Remove$/i })); });

    await waitFor(() => expect(screen.getAllByLabelText(/trade name/i).length).toBe(1));
    expect((screen.getByLabelText(/trade name/i) as HTMLInputElement).value).toBe('Dicamba');
  });
});
