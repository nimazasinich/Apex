export interface ReadPlaneMessage<T> {
  type: 'SNAPSHOT' | 'PATCH' | 'HEARTBEAT' | 'RESYNC_REQUIRED';
  channel: string;
  sequence: number;
  generatedAt: number;
  payload: T;
}
