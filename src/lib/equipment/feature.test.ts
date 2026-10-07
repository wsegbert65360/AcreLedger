import { describe, expect, it } from 'vitest';
import { isEquipmentUiEnabled } from './feature';

describe('isEquipmentUiEnabled', () => {
  it('is off unless the build flag is exactly true', () => {
    expect(isEquipmentUiEnabled({})).toBe(false);
    expect(isEquipmentUiEnabled({ VITE_EQUIPMENT_UI_ENABLED: 'True' })).toBe(false);
    expect(isEquipmentUiEnabled({ VITE_EQUIPMENT_UI_ENABLED: '1' })).toBe(false);
    expect(isEquipmentUiEnabled({ VITE_EQUIPMENT_UI_ENABLED: 'true' })).toBe(true);
  });
});
