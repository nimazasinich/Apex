import { describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  isThemePreference,
  readThemePreference,
  resolveTheme,
} from '../lib/theme';

describe('integrated appearance system', () => {
  it('validates persisted preferences and falls back safely', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('unknown')).toBe(false);
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
    expect(readThemePreference({ getItem: () => 'invalid' })).toBe('system');
    expect(readThemePreference({ getItem: () => { throw new Error('blocked'); } })).toBe('system');
  });

  it('keeps the persisted preference separate from the resolved theme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('applies both preference and resolved theme to the root element', () => {
    const root = { dataset: {}, style: {} } as unknown as HTMLElement;
    expect(applyThemeToDocument('system', root, true)).toBe('dark');
    expect(root.dataset.apexTheme).toBe('system');
    expect(root.dataset.apexThemeResolved).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(applyThemeToDocument('light', root, true)).toBe('light');
    expect(root.dataset.apexThemeResolved).toBe('light');
  });
});
