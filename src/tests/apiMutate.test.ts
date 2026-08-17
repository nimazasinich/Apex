import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiMutate, mutationHeaders } from '../services/apiMutate';

afterEach(() => vi.unstubAllGlobals());

describe('apiMutate', () => {
  it('adds mutation headers while preserving caller headers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiMutate('/api/example', { method: 'PATCH', headers: { 'X-Custom': 'yes', 'Content-Type': 'application/merge-patch+json' }, body: '{}' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    const init = call[1];
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({ 'X-APEX-CSRF': '1', 'X-Custom': 'yes', 'Content-Type': 'application/merge-patch+json' });
  });

  it('uses POST by default', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiMutate('/api/example');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(mutationHeaders()['X-APEX-CSRF']).toBe('1');
  });
});
