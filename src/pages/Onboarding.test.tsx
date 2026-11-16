/** @vitest-environment jsdom */
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ completeOnboarding: vi.fn(), updateFarmName: vi.fn() }));
const farm = vi.hoisted(() => ({ isOnline: true as boolean, farmName: 'Oak Creek' }));
const plan = vi.hoisted(() => ({ entitlement: null as null | { plan: string; enforced: boolean } }));
const prefs = vi.hoisted(() => ({ country: 'US', updatePreferences: vi.fn() }));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    farmName: farm.farmName,
    isOnline: farm.isOnline,
    session: { user: { id: 'user-1', email: 'farmer@example.com' } },
    ...actions,
  }),
}));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ entitlement: plan.entitlement, loading: false, cachedEntitlement: null, failed: false }),
}));
vi.mock('@/store/useAppPreferences', async (importActual) => ({
  ...(await importActual<typeof import('@/store/useAppPreferences')>()),
  useAppPreferences: () => ({ preferences: { country: prefs.country }, updatePreferences: prefs.updatePreferences }),
}));
vi.mock('@/components/settings/RegionManager', () => ({
  default: ({ value, onChange }: { value?: string | null; onChange?: (c: 'US' | 'AU') => void }) => (
    <div data-testid="region-manager" data-value={value ?? ''}>
      <button type="button" onClick={() => onChange?.('US')}>Pick United States</button>
      <button type="button" onClick={() => onChange?.('AU')}>Pick Australia</button>
    </div>
  ),
}));
vi.mock('@/components/TractAssignmentFlow', () => ({
  default: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Done</button>,
}));

import Onboarding from './Onboarding';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/onboarding']}>
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<div>Dashboard</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('Onboarding completion', () => {
  beforeEach(() => {
    actions.completeOnboarding.mockReset().mockResolvedValue(false);
    actions.updateFarmName.mockReset().mockResolvedValue(true);
    farm.isOnline = true;
    farm.farmName = 'Oak Creek';
    plan.entitlement = null;
    prefs.country = 'US';
    prefs.updatePreferences.mockReset();
  });

  it('stays on setup after Skip fails, then allows a successful retry', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    await waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skip setup' })).toBeEnabled());
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    actions.completeOnboarding.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('stays on the field step when Done fails', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set Up Your Fields' })).toBeInTheDocument();
  });

  it('does not advance when saving the farm name fails', async () => {
    actions.updateFarmName.mockResolvedValue(false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(actions.updateFarmName).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'Welcome to AcreLedger' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('re-enables controls when completion rejects', async () => {
    actions.completeOnboarding.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    await waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skip setup' })).toBeEnabled());
  });

  it('sends one request for a quick double Skip', async () => {
    actions.completeOnboarding.mockResolvedValue(true);
    renderPage();
    const skip = screen.getByRole('button', { name: 'Skip setup' });
    fireEvent.click(skip);
    fireEvent.click(skip);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(actions.completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('keeps a typed farm name when skipping from the name step', async () => {
    actions.completeOnboarding.mockResolvedValue(true);
    renderPage();
    fireEvent.change(screen.getByLabelText('Farm Name'), { target: { value: 'Hilltop Farms' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(actions.updateFarmName).toHaveBeenCalledWith('Hilltop Farms');
  });

  it('finishes without FSA data through "Add fields by hand instead"', async () => {
    actions.completeOnboarding.mockResolvedValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add fields by hand instead' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('says the internet is required and disables setup while offline', () => {
    farm.isOnline = false;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Internet required to finish setup');
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('offers FSA import to a free farm under enforcement with no Pro note', async () => {
    plan.entitlement = { plan: 'free', enforced: true };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Set Up Your Fields' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument(); // TractAssignmentFlow
    expect(screen.getByRole('button', { name: 'Add fields by hand instead' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bPro\b/);
    expect(document.body.textContent).toContain('import FSA tracts later in Settings');
  });

  it('asks AU-pilot users for their region and needs an explicit choice', async () => {
    prefs.country = 'AU';
    actions.completeOnboarding.mockResolvedValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Choose Your Region' })).toBeInTheDocument();
    // Starts unselected, even with a saved country, and Done waits for a choice.
    expect(screen.getByTestId('region-manager')).toHaveAttribute('data-value', '');
    expect(screen.queryByText(/FSA/)).not.toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(actions.completeOnboarding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pick Australia' }));
    expect(screen.getByTestId('region-manager')).toHaveAttribute('data-value', 'AU');
    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    // Country, locale and units saved together, before setup is marked complete.
    expect(prefs.updatePreferences).toHaveBeenCalledWith({ country: 'AU', locale: 'en-AU', unitSystem: 'metric' });
    expect(prefs.updatePreferences.mock.invocationCallOrder[0])
      .toBeLessThan(actions.completeOnboarding.mock.invocationCallOrder[0]);
  });

  it('saves the US bundle when an AU-pilot user picks the United States', async () => {
    prefs.country = 'AU';
    actions.completeOnboarding.mockResolvedValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pick United States' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(prefs.updatePreferences).toHaveBeenCalledWith({ country: 'US', locale: 'en-US', unitSystem: 'imperial' });
  });

  it('does not promise the farm name on scale tickets', () => {
    renderPage();
    expect(screen.queryByText(/scale ticket/i)).not.toBeInTheDocument();
  });
});
