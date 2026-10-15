import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const plist = read('ios/App/App/Info.plist');

function expectUsageDescription(key: string) {
  expect(plist).toMatch(new RegExp(`<key>${key}</key>\\s*<string>[^<\\s][^<]+</string>`));
}

describe('iOS capability usage descriptions', () => {
  it('declares camera and photo-library access for the spray photo input', () => {
    const wizard = read('src/components/spray/SprayWizardCoreStep.tsx');
    expect(wizard).toMatch(/accept="image\/\*"/);
    expect(wizard).toMatch(/capture="environment"/);
    expectUsageDescription('NSCameraUsageDescription');
    expectUsageDescription('NSPhotoLibraryUsageDescription');
  });

  it('declares location, microphone and speech capabilities used by the app', () => {
    expect(read('src/lib/native.ts')).toContain('Geolocation.getCurrentPosition');
    expect(read('src/lib/speech.ts')).toContain('SpeechRecognition');
    expectUsageDescription('NSLocationWhenInUseUsageDescription');
    expectUsageDescription('NSLocationAlwaysAndWhenInUseUsageDescription');
    expectUsageDescription('NSMicrophoneUsageDescription');
    expectUsageDescription('NSSpeechRecognitionUsageDescription');
  });

  it('explains foreground-only location and does not enable background location', () => {
    expect(plist).toMatch(
      /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>\s*<string>AcreLedger uses your location only while the app is open, to find weather data and set field coordinates\. It does not track your location in the background\.<\/string>/,
    );
    expect(plist).toMatch(
      /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>AcreLedger uses your location to find weather data and set field coordinates\.<\/string>/,
    );
    expect(plist).not.toContain('<key>UIBackgroundModes</key>');
  });
});
