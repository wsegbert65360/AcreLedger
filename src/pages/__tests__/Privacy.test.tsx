/**
 * @vitest-environment jsdom
 *
 * Public privacy policy: App Store privacy URLs can target this page on the
 * live host. It must name support@acreledger.com and stay a presentational
 * page (no signed-in chrome of its own).
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Privacy from '../Privacy';

const renderPrivacy = () =>
  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>
  );

describe('Privacy', () => {
  it('renders the privacy policy heading', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('AcreLedger Privacy Policy')).toBeInTheDocument();
  });

  it('names support@acreledger.com as the contact address', () => {
    renderPrivacy();
    expect(screen.getByRole('link', { name: 'support@acreledger.com' })).toHaveAttribute(
      'href',
      'mailto:support@acreledger.com'
    );
  });

  it('links to the public support page', () => {
    renderPrivacy();
    expect(screen.getByRole('link', { name: /support page/i })).toHaveAttribute(
      'href',
      '/support'
    );
  });
});
