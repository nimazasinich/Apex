/** Monotonic serial keeps IDs unique when several theses are created in one tick. */
let signalIdSerial = 0;

/**
 * Allocate a display-grade shadow signal identifier.
 *
 * It is deliberately separate from order and exchange IDs. The identifier only
 * links scanner observability, lifecycle transitions and decision-memory rows.
 * Timestamp + serial prevents collisions across reloads while the symbol/side
 * suffix keeps the value readable during audits.
 */
export function allocateSignalId(ticker: string, direction?: 'LONG' | 'SHORT'): string {
  signalIdSerial += 1;
  const sym = ticker.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10) || 'PAIR';
  const side = direction ? direction[0] : 'X';
  const stamp = Date.now().toString(36).toUpperCase();
  const serial = signalIdSerial.toString(36).toUpperCase().padStart(2, '0');
  return `ALPHA-QX-${stamp}-${serial}-${sym}-${side}`;
}

/** Test-only deterministic reset; not used by runtime code. */
export function resetSignalIdSerialForTests(): void {
  signalIdSerial = 0;
}
