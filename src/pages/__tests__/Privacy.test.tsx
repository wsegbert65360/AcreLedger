/**
 * @vitest-environment jsdom
 *
 * Public privacy policy: App Store privacy URLs can target this page on the
 * live host. It must name acreledgerapp@gmail.com and stay a presentational
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

  it('names acreledgerapp@gmail.com as the contact address', () => {
    renderPrivacy();
    expect(screen.getByRole('link', { name: 'acreledgerapp@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:acreledgerapp@gmail.com'
    );
  });

  it('renders the approved error logging and offline storage wording', () => {
    const { container } = renderPrivacy();
    expect(container).toHaveTextContent("Error logs: when something goes wrong, the app logs the error on your device only. We don't send crash reports to anyone. If we ever add a crash-reporting provider, we'll update this policy first.");
    expect(container).toHaveTextContent('Saved on your device: the app keeps a copy of your records and settings on your phone, tablet or computer so it works offline.');
  });

  it('renders the approved Australia complaint and retention wording', () => {
    const { container } = renderPrivacy();
    expect(container).toHaveTextContent("If you're not satisfied, you can contact the Office of the Australian Information Commissioner (oaic.gov.au).");
    expect(container).toHaveTextContent('We will reply within 30 days.');
    expect(container).toHaveTextContent('Billing records are kept for 7 years for tax purposes.');
  });

  it('publishes the approved date without draft or internal notes', () => {
    const { container } = renderPrivacy();
    expect(screen.getByText('Last updated: October 20, 2026')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/DRAFT|internal|GST|set the final date|Source notes/i);
  });

  it('lists the approved service providers and optional AI disclosure', () => {
    const { container } = renderPrivacy();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Rain API (rain-api.vercel.app)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Google Fonts' })).toBeInTheDocument();
    expect(container).toHaveTextContent('That provider may log your question and records, or use them to improve its AI models.');
  });
});
