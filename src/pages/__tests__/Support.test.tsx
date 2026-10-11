/**
 * @vitest-environment jsdom
 *
 * Public support surface: App Store support URLs can target this page on the
 * live host. It must name support@acreledger.app and stay a presentational
 * page (no signed-in chrome of its own).
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Support from '../Support';

const renderSupport = () =>
  render(
    <MemoryRouter>
      <Support />
    </MemoryRouter>
  );

describe('Support', () => {
  it('renders the support heading', () => {
    renderSupport();
    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByText('AcreLedger Support')).toBeInTheDocument();
  });

  it('names support@acreledger.app as a mailto contact', () => {
    renderSupport();
    expect(screen.getByRole('link', { name: 'support@acreledger.app' })).toHaveAttribute(
      'href',
      'mailto:support@acreledger.app'
    );
  });

  it('links to the public privacy policy', () => {
    renderSupport();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
