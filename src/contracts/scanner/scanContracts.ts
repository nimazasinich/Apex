/** Shared scanner result shapes. This leaf module must not import scanner behavior. */
export interface ScanGateSnapshot {
  shortObi: boolean;
  shortVolume: boolean;
  shortQStruct: boolean;
  longObi: boolean;
  longVolume: boolean;
  longQStruct: boolean;
  obiThreshold: number;
  volumeThreshold: number;
  qStructThreshold: number;
  smoothedObi: number;
  smoothedVolDelta: number;
  qStructDirectional: number;
}
