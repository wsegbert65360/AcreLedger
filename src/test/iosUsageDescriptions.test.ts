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
    expectUsageDescription('NSMicrophoneUsageDescription');
    expectUsageDescription('NSSpeechRecognitionUsageDescription');
  });

  it('does not request always-on location', () => {
    expect(plist).not.toContain('NSLocationAlwaysAndWhenInUseUsageDescription');
  });
});
