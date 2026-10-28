/**
 * @vitest-environment jsdom
 *
 * Signed-out visitors get the ledger-styled product and pricing page at /.
 * Account CTAs deep-link into signup, the header keeps sign-in reachable,
 * and privacy/support plus the approved FSA footer disclaimer stay intact.
 */
import { MemoryRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import Landing from '../Landing';

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );

describe('Landing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ledger product story and reporting benefits', () => {
    renderLanding();

    expect(screen.getAllByText('AcreLedger').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: /Keep field work and FSA paperwork in one place/i })
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

  it('uses the approved trial, price, and device copy', () => {
    renderLanding();
    expect(screen.getAllByText('3-month free trial, no card needed. Then $299 per farm per year.').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('iPhone and any web browser')).toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveTextContent(/coming soon|no charge|planned price|four[- ]month|4[- ]month|Android|iPad/i);
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
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /refund policy/i })).toHaveAttribute('href', '/refund');
    expect(screen.getByRole('link', { name: /^support$/i })).toHaveAttribute(
      'href',
      '/support'
    );
    expect(screen.getByRole('link', { name: 'acreledgerapp@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:acreledgerapp@gmail.com'
    );
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute(
      'href',
      'mailto:acreledgerapp@gmail.com'
    );
  });

  it('removes web purchase prompts from the native app landing page', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    renderLanding();

    expect(screen.getByRole('main')).not.toHaveTextContent(
      /\$299|limited rollout|billing|trial|sign ?up|subscribe|checkout|purchase/i
    );
    expect(screen.queryByRole('heading', { name: /terms of the book/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/what does acreledger cost/i)
    ).not.toBeInTheDocument();

    const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThanOrEqual(3);
    signInLinks.forEach((link) => expect(link).toHaveAttribute('href', '/auth?mode=signin'));
    expect(screen.queryByRole('link', { name: /open the book/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="mode=signup"]')).not.toBeInTheDocument();
  });
});
