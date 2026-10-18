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
