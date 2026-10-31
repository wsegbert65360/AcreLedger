/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/SeasonSelect', () => ({ default: () => <div>Season</div> }));
vi.mock('@/context/AskAcreLedgerContext', () => ({ useAskAcreLedger: () => ({ openAsk: vi.fn() }) }));
vi.mock('@/context/QuickAddContext', () => ({ useQuickAdd: () => ({ openQuickAdd: vi.fn() }) }));
vi.mock('@/lib/native', () => ({ native: { haptic: { light: vi.fn() } } }));

const farmState = vi.hoisted(() => ({ farm_id: 'd4124658-d3dc-41e8-9792-b3327954c5c5' }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farmState }));

import Sidebar from '../Sidebar';

const packageVersion = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
).version as string;

describe('Sidebar version', () => {
  it('displays the package.json version from the build-time constant', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(__APP_VERSION__).toBe(packageVersion);
    expect(screen.getByText(`v${packageVersion}`)).toBeInTheDocument();
  });
});

describe('Ask the book farm access', () => {
  it.each([
    ['d4124658-d3dc-41e8-9792-b3327954c5c5', false],
    ['28e107ba-3384-4b6e-9917-8a694803cb82', true],
    ['cc3280e8-8fe3-49a8-9020-7132a7e8241c', false],
  ])('checks entry visibility for %s', (farmId, enabled) => {
    farmState.farm_id = farmId;
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Ask the book' }) !== null).toBe(enabled);
  });
});
