/** @vitest-environment jsdom */
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ completeOnboarding: vi.fn(), updateFarmName: vi.fn() }));
vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({ farmName: 'Oak Creek', ...actions }),
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
});
