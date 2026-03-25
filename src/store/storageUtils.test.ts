import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadFromStorage, saveToStorage } from './storageUtils';

describe('storageUtils', () => {
  const mockGetItem = vi.fn();
  const mockSetItem = vi.fn();
  const mockConsoleError = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: mockGetItem,
      setItem: mockSetItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    vi.spyOn(console, 'error').mockImplementation(mockConsoleError);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
    mockConsoleError.mockClear();
  });

  describe('loadFromStorage', () => {
    it('returns parsed JSON from localStorage if it exists', () => {
      mockGetItem.mockReturnValue(JSON.stringify({ test: 'value' }));
      const result = loadFromStorage('testKey', { default: true });
      expect(mockGetItem).toHaveBeenCalledWith('testKey');
      expect(result).toEqual({ test: 'value' });
    });

    it('uses the scopedKey format when userId is provided', () => {
      mockGetItem.mockReturnValue(JSON.stringify({ test: 'value' }));
      loadFromStorage('testKey', { default: true }, 'user123');
      expect(mockGetItem).toHaveBeenCalledWith('user123_testKey');
    });

    it('returns fallback value if key does not exist', () => {
      mockGetItem.mockReturnValue(null);
      const result = loadFromStorage('testKey', { default: true });
      expect(mockGetItem).toHaveBeenCalledWith('testKey');
      expect(result).toEqual({ default: true });
    });

    it('returns fallback value and logs error if JSON.parse fails', () => {
      mockGetItem.mockReturnValue('invalid-json');
      const result = loadFromStorage('testKey', { default: true });
      expect(result).toEqual({ default: true });
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error loading from storage (testKey):',
        expect.any(SyntaxError)
      );
    });
  });

  describe('saveToStorage', () => {
    it('saves JSON stringified value to localStorage', () => {
      saveToStorage('testKey', { test: 'value' });
      expect(mockSetItem).toHaveBeenCalledWith('testKey', JSON.stringify({ test: 'value' }));
    });

    it('uses the scopedKey format when userId is provided', () => {
      saveToStorage('testKey', { test: 'value' }, 'user123');
      expect(mockSetItem).toHaveBeenCalledWith('user123_testKey', JSON.stringify({ test: 'value' }));
    });

    it('handles errors gracefully and logs them', () => {
      // Create a circular structure to force JSON.stringify to throw
      const circularObj: any = {};
      circularObj.circularRef = circularObj;

      saveToStorage('testKey', circularObj);
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error saving to storage:',
        expect.any(TypeError)
      );
    });
  });
});
