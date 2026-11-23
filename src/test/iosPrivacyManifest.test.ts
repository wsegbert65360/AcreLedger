import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const manifest = readFileSync(resolve(process.cwd(), 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');

const collectedDataTypes = [
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypePhysicalAddress',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypePreciseLocation',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeSearchHistory',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeCrashData',
];

describe('iOS privacy manifest', () => {
  it.each(collectedDataTypes)('declares %s', (dataType) => {
    expect(manifest).toContain(`<string>${dataType}</string>`);
  });

  it.each([
    ['NSPrivacyAccessedAPICategoryUserDefaults', 'CA92.1'],
    ['NSPrivacyAccessedAPICategoryFileTimestamp', 'C617.1'], // @capacitor/filesystem
  ])('declares required-reason API %s (%s)', (api, reason) => {
    expect(manifest).toMatch(new RegExp(`<string>${api}</string>\\s*<key>NSPrivacyAccessedAPITypeReasons</key>\\s*<array>\\s*<string>${reason}</string>`));
  });

  it('declares no tracking', () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).not.toMatch(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
  });
});
