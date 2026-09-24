/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'web' }));
const appInfo = vi.hoisted(() => ({
  version: '3.6.0',
  fail: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform.value,
    isNativePlatform: () => platform.value !== 'web',
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: async () => {
      if (appInfo.fail) throw new Error('unavailable');
      return { name: 'AcreLedger', id: 'com.wsegbert.acreledger', build: '185', version: appInfo.version };
    },
  },
}));

import VersionFooter from '../VersionFooter';

function listing(version: string, url = 'https://apps.apple.com/us/app/acreledger/id1') {
  return {
    ok: true,
    json: async () => ({
      resultCount: 1,
      results: [{ version, trackViewUrl: url }],
    }),
  };
}

describe('VersionFooter', () => {
  beforeEach(() => {
    platform.value = 'web';
    appInfo.version = '3.6.0';
    appInfo.fail = false;
    vi.unstubAllGlobals();
  });

  it('keeps the manual check on the web app', () => {
    render(<VersionFooter />);
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument();
    expect(screen.queryByText('You need to update')).not.toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('shows that the iOS app needs an App Store update', async () => {
    platform.value = 'ios';
    vi.stubGlobal('fetch', vi.fn(async () => listing('3.7.0')));

    render(<VersionFooter />);

    const link = await screen.findByRole('link', { name: 'You need to update' });
    expect(link).toHaveAttribute('href', 'https://apps.apple.com/us/app/acreledger/id1');
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
  });

  it('shows up to date when the installed iOS version matches the store', async () => {
    platform.value = 'ios';
    vi.stubGlobal('fetch', vi.fn(async () => listing('3.6.0')));

    render(<VersionFooter />);

    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check for updates/i })).not.toBeInTheDocument();
  });

  it('shows nothing on iOS when the store version cannot be read', async () => {
    platform.value = 'ios';
    appInfo.fail = true;
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<VersionFooter />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/v3\.6\.0/)).toBeInTheDocument();
    expect(screen.queryByText('You need to update')).not.toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check for updates/i })).not.toBeInTheDocument();
  });

  it('does not start a service-worker check from the iOS status', async () => {
    platform.value = 'ios';
    const update = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ update }) } });
    vi.stubGlobal('fetch', vi.fn(async () => listing('9.0.0', '')));

    render(<VersionFooter />);
    fireEvent.click(await screen.findByText('You need to update'));

    expect(update).not.toHaveBeenCalled();
  });
});
