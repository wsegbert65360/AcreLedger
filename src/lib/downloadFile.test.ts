import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ native: false, shareResult: true as boolean }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => env.native } }));
vi.mock('@/lib/native', () => ({ native: { shareFile: vi.fn(async () => env.shareResult) } }));

import { native } from '@/lib/native';
import { downloadFile } from './downloadFile';

describe('downloadFile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.native = false;
    env.shareResult = true;
  });

  it('on the web, clicks a link and revokes the URL only after a delay', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await downloadFile('a,b', 'x.csv', 'text/csv')).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('on native, uses the share sheet and reports a failed share', async () => {
    env.native = true;
    expect(await downloadFile('{}', 'b.json', 'application/json', 'Backup')).toBe(true);
    expect(native.shareFile).toHaveBeenCalledWith({ fileName: 'b.json', data: '{}', title: 'Backup', encoding: 'utf8' });
    env.shareResult = false;
    expect(await downloadFile('{}', 'b.json', 'application/json')).toBe(false);
  });
});
