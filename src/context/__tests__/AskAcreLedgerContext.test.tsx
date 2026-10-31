/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AskAcreLedgerProvider, useAskAcreLedger } from '../AskAcreLedgerContext';

const farm = vi.hoisted(() => ({ farm_id: 'd4124658-d3dc-41e8-9792-b3327954c5c5' }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));

function Consumer() {
  const { isAskOpen, openAsk } = useAskAcreLedger();
  return <button onClick={openAsk}>{isAskOpen ? 'Open' : 'Closed'}</button>;
}

describe('Ask drawer access', () => {
  it.each([
    'cc3280e8-8fe3-49a8-9020-7132a7e8241c',
    'd4124658-d3dc-41e8-9792-b3327954c5c5',
  ])('blocks direct opens and hides an open drawer for %s', (farmId) => {
    farm.farm_id = farmId;
    const view = render(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Closed')).toBeInTheDocument();
    farm.farm_id = '28e107ba-3384-4b6e-9917-8a694803cb82';
    view.rerender(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Open')).toBeInTheDocument();
    farm.farm_id = farmId;
    view.rerender(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
