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

  it('declares no tracking', () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).not.toMatch(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
  });
});
