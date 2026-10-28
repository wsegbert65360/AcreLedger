import { MemoryRouter } from 'react-router-dom';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Auth } from './Auth';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} }, isSupabaseConfigured: true }));

afterEach(cleanup);

describe('signup legal agreement', () => {
  it('shows plain-text consent with policy links directly below the sign-up button', () => {
    render(<MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter>);

    const button = screen.getByRole('button', { name: 'Sign Up' });
    const agreement = button.nextElementSibling as HTMLElement;
    expect(agreement.tagName).toBe('P');
    expect(agreement).toHaveTextContent('By creating an account, I agree to the Terms and Privacy Policy');
    expect(within(agreement).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(within(agreement).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('does not show signup consent on the sign-in screen', () => {
    render(<MemoryRouter initialEntries={['/auth?mode=signin']}><Auth /></MemoryRouter>);

    expect(screen.queryByText(/By creating an account/)).not.toBeInTheDocument();
  });
});
