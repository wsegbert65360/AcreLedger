/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFromStorage, saveToStorage } from '../storageUtils';

describe('storageUtils', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('loadFromStorage', () => {
        it('should load a value correctly without userId', () => {
            const data = { foo: 'bar' };
            localStorage.setItem('test-key', JSON.stringify(data));
            
            const result = loadFromStorage('test-key', null);
            expect(result).toEqual(data);
        });

        it('should load a value correctly with userId', () => {
            const userId = 'user-123';
            const data = { foo: 'bar' };
            localStorage.setItem(`${userId}_test-key`, JSON.stringify(data));
            
            const result = loadFromStorage('test-key', null, userId);
            expect(result).toEqual(data);
        });

        it('should return fallback if key does not exist', () => {
            const fallback = { default: true };
            const result = loadFromStorage('non-existent', fallback);
            expect(result).toEqual(fallback);
        });

        it('should return fallback and log error on malformed JSON', () => {
            localStorage.setItem('bad-key', 'invalid-json{');
            const fallback = { default: true };
            
            const result = loadFromStorage('bad-key', fallback);
            
            expect(result).toEqual(fallback);
            expect(console.error).toHaveBeenCalled();
        });

        it('should handle null/undefined/empty userId by not prepending', () => {
            localStorage.setItem('test-key', JSON.stringify('plain'));
            expect(loadFromStorage('test-key', null, null)).toBe('plain');
            expect(loadFromStorage('test-key', null, undefined)).toBe('plain');
            expect(loadFromStorage('test-key', null, '')).toBe('plain');
        });
    });

    describe('saveToStorage', () => {
        it('should save a value correctly without userId', () => {
            const data = { a: 1 };
            saveToStorage('save-key', data);
            
            const stored = localStorage.getItem('save-key');
            expect(stored).toBe(JSON.stringify(data));
        });

        it('should save a value correctly with userId', () => {
            const userId = 'user-456';
            const data = { b: 2 };
            saveToStorage('save-key', data, userId);
            
            const stored = localStorage.getItem(`${userId}_save-key`);
            expect(stored).toBe(JSON.stringify(data));
        });

        it('should log error when stringify fails (cyclic object)', () => {
            const cyclic: any = {};
            cyclic.self = cyclic;
            
            saveToStorage('cyclic-key', cyclic);
            
            expect(console.error).toHaveBeenCalled();
            expect(localStorage.getItem('cyclic-key')).toBeNull();
        });

        it('should handle null/undefined/empty userId by not prepending on save', () => {
            saveToStorage('plain-key', 'val', null);
            expect(localStorage.getItem('plain-key')).toBe(JSON.stringify('val'));
            
            saveToStorage('plain-key-2', 'val2', undefined);
            expect(localStorage.getItem('plain-key-2')).toBe(JSON.stringify('val2'));

            saveToStorage('plain-key-3', 'val3', '');
            expect(localStorage.getItem('plain-key-3')).toBe(JSON.stringify('val3'));
        });
    });
});
