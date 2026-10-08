import { describe, expect, it } from 'vitest';
import { isEquipmentUiEnabled } from './feature';

describe('isEquipmentUiEnabled', () => {
  it('is enabled by default', () => {
    expect(isEquipmentUiEnabled()).toBe(true);
  });
});
