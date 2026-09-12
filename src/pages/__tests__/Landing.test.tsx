/**
 * @vitest-environment jsdom
 *
 * Ticket C thin landing: signed-out visitors get a marketing landing at /
 * whose CTAs deep-link into /auth?mode=signup|signin, with the privacy
 * policy and support page reachable from the header and footer.
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Landing from '../Landing';

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );

describe('Landing', () => {
  it('renders the approved headline, subhead, and bullets', () => {
    renderLanding();
    expect(screen.getByText('AcreLedger')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Keep field work and FSA paperwork in one place',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'AcreLedger helps row-crop operators log field work, track grain and hay, and build FSA and spray reports from the same records. Mobile-friendly. Built for how you already talk about fields.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Log planting, spraying, fertilizer, harvest, and hay by field')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Import FSA tracts when you have them — or add fields by hand and finish CLUs later'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Export FSA-578, spray audit, fall production, hay, fertilizer, and landlord summaries'
      )
    ).toBeInTheDocument();
  });

  it('carries the approved FSA footer disclaimer', () => {
    renderLanding();
    expect(
      screen.getByText(
        'Working documents for your records and appointments — not a guarantee of FSA acceptance. Follow labels and your county office.'
      )
    ).toBeInTheDocument();
  });

  it('links Create account to /auth?mode=signup', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/auth?mode=signup'
    );
  });

  it('links Sign in to /auth?mode=signin', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth?mode=signin'
    );
  });

  it('exposes the privacy policy from header and footer', () => {
    renderLanding();
    const links = screen.getAllByRole('link', { name: /privacy/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/privacy'));
  });

  it('exposes support from header and footer', () => {
    renderLanding();
    const links = screen.getAllByRole('link', { name: /^support$/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/support'));
  });

  it('names support@acreledger.com in the footer', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'support@acreledger.com' })).toHaveAttribute(
      'href',
      'mailto:support@acreledger.com'
    );
  });
});
