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
  it('blocks direct opens and hides an open drawer after the farm changes', () => {
    const view = render(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Closed')).toBeInTheDocument();
    farm.farm_id = 'cc3280e8-8fe3-49a8-9020-7132a7e8241c';
    view.rerender(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Open')).toBeInTheDocument();
    farm.farm_id = 'd4124658-d3dc-41e8-9792-b3327954c5c5';
    view.rerender(<AskAcreLedgerProvider><Consumer /></AskAcreLedgerProvider>);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
