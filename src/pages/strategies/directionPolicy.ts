import type { ScannerConfig, TradeDirection } from '../../types';

export function allowedDirectionsForBias(
  bias: ScannerConfig['directionBias'] | undefined,
): TradeDirection[] {
  if (bias === 'LONG_ONLY') return ['LONG'];
  if (bias === 'SHORT_ONLY') return ['SHORT'];
  return ['LONG', 'SHORT'];
}
