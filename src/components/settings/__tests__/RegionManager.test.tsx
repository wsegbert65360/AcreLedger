/**
 * @vitest-environment jsdom
 *
 * RegionManager must use the same per-user preference scope as useSprayForm.
 * Regression test for P1-1: RegionManager previously called useAppPreferences()
 * without a userId (key: al_app_prefs) while useSprayForm used
 * useAppPreferences(session?.user?.id) (key: <userId>_al_app_prefs),
 * so the country selector had no effect on the spray form.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUpdatePreferences = vi.fn();
let capturedUserId: string | null | undefined;

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: (userId?: string | null) => {
    capturedUserId = userId;
    return {
      preferences: { country: 'US', locale: 'en-US', unitSystem: 'imperial' },
      updatePreferences: mockUpdatePreferences,
    };
  },
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: { user: { id: 'test-user-123' } },
  }),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <select data-testid="country-select" onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

import RegionManager from '../RegionManager';

describe('RegionManager preference scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUserId = undefined;
  });

  it('passes the session user id to useAppPreferences (same scope as useSprayForm)', () => {
    render(<RegionManager />);
    expect(capturedUserId).toBe('test-user-123');
  });

  it('sets AU locale and metric units when country changes to AU', () => {
    render(<RegionManager />);
    const select = screen.getByTestId('country-select');
    fireEvent.change(select, { target: { value: 'AU' } });
    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      country: 'AU',
      locale: 'en-AU',
      unitSystem: 'metric',
    });
  });
});
