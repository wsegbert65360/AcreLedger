/**
 * @vitest-environment jsdom
 *
 * Signed-out visitors get the ledger-styled product and pricing page at /.
 * Account CTAs deep-link into signup, the header keeps sign-in reachable,
 * and privacy/support plus the approved FSA footer disclaimer stay intact.
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Landing from '../Landing';

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );

describe('Landing', () => {
  it('renders the ledger product story and reporting benefits', () => {
    renderLanding();

    expect(screen.getAllByText('AcreLedger').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: /field records in\. fsa paperwork out\./i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /what goes in the book\./i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /an fsa-578 worksheet built for the office/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/works where signal doesn’t/i)).toBeInTheDocument();
    expect(screen.getByAltText(/AcreLedger dashboard with live weather/i)).toBeInTheDocument();
  });

  it('explains the introductory period and standard annual price', () => {
    renderLanding();

    expect(screen.getByText('full access, no charge')).toBeInTheDocument();
    expect(screen.getByText('per farm / year, billed annually')).toBeInTheDocument();
    expect(screen.getByText('$299.00 / year')).toBeInTheDocument();
    expect(
      screen.getByText(/no charge when you create an account today/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/web subscriptions are rolling out in stages/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/about \$24\.92 per month, billed annually/i)).toBeInTheDocument();
  });

  it('carries the approved FSA footer disclaimer', () => {
    renderLanding();
    expect(
      screen.getByText(
        'Working documents for your records and appointments. FSA acceptance is not guaranteed. Follow labels and your county office.'
      )
    ).toBeInTheDocument();
  });

  it('keeps the USDA and product-label disclaimer in the FAQ', () => {
    renderLanding();

    expect(
      screen.getByText(/does acreledger replace official usda or product-label requirements\?/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/follow product labels and confirm filing requirements/i)
    ).toBeInTheDocument();
  });

  it('routes account actions to auth modes', () => {
    renderLanding();

    const signupLinks = screen.getAllByRole('link', {
      name: /open the book|open your farm book|create your account/i,
    });
    expect(signupLinks.length).toBeGreaterThanOrEqual(3);
    signupLinks.forEach((link) => expect(link).toHaveAttribute('href', '/auth?mode=signup'));

    const header = screen.getByRole('banner');
    const headerSignIn = within(header).getByRole('link', { name: /sign in/i });
    expect(headerSignIn).toHaveAttribute('href', '/auth?mode=signin');
    const headerSignup = within(header).getByRole('link', { name: /open the book/i });
    expect(headerSignup).toHaveAttribute('href', '/auth?mode=signup');
  });

  it('keeps privacy, support, and contact paths available', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
    expect(screen.getByRole('link', { name: /^support$/i })).toHaveAttribute(
      'href',
      '/support'
    );
    expect(screen.getByRole('link', { name: 'support@acreledger.com' })).toHaveAttribute(
      'href',
      'mailto:support@acreledger.com'
    );
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute(
      'href',
      'mailto:support@acreledger.com'
    );
  });
});
