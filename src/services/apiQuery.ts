export class ApiQueryError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 0, code = 'request_failed') {
    super(message);
    this.name = 'ApiQueryError';
    this.status = status;
    this.code = code;
  }
}

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchJsonWithTimeout<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 12_000);
  const timeoutId = window.setTimeout(() => controller.abort('request_timeout'), timeoutMs);
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason || 'request_cancelled');
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: options.credentials ?? 'same-origin',
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });

    let payload: any = null;
    try { payload = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      const code = String(payload?.error || payload?.code || `http_${response.status}`);
      const message = String(payload?.message || payload?.error || `Request failed with status ${response.status}`);
      throw new ApiQueryError(message, response.status, code);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiQueryError) throw error;
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || 'request_timeout');
      throw new ApiQueryError(reason === 'request_timeout' ? 'The data provider did not respond in time.' : 'Request cancelled.', 0, reason);
    }
    throw new ApiQueryError(error instanceof Error ? error.message : 'Network request failed.', 0, 'network_error');
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}
