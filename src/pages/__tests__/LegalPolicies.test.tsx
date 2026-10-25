import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Refund from '../Refund';
import Terms from '../Terms';

describe('approved legal policies', () => {
  it.each([['Terms of Service', Terms], ['Refund Policy', Refund]] as const)('renders %s with approved dates and legal navigation', (title, Page) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByText(`AcreLedger ${title}`)).toBeInTheDocument();
    expect(screen.getByText('Last updated: November 1, 2026')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/FINAL, attorney|DRAFT|internal|effective date, set/);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute('href', '/refund');
    expect(container).toHaveTextContent('Australian Consumer Law');
  });
  it('keeps the approved refund timing', () => {
    const { container } = render(<MemoryRouter><Refund /></MemoryRouter>);
    expect(container).toHaveTextContent('if you ask within 30 days of any charge (your first payment or a yearly renewal), we refund that charge in full.');
    expect(container).toHaveTextContent('If a renewal payment fails, you have 14 days to update your card before the farm goes read-only. There are no late fees.');
  });
});
