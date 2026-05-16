export interface OrdoTimeScaleInput {
  readonly deltaSeconds: number;
  readonly scale?: number;
  readonly paused?: boolean;
  readonly minDelta?: number;
  readonly maxDelta?: number;
}

export function scaleOrdoDelta(input: OrdoTimeScaleInput): number {
  if (input.paused) return 0;

  const scale = Math.max(0, input.scale ?? 1);
  const scaled = Math.max(0, input.deltaSeconds) * scale;
  const min = input.minDelta ?? 0;
  const max = input.maxDelta ?? Number.POSITIVE_INFINITY;

  return Math.min(Math.max(scaled, min), max);
}

export function createOrdoTimeScaler(defaultScale = 1): (deltaSeconds: number, scale?: number) => number {
  return (deltaSeconds, scale = defaultScale) => scaleOrdoDelta({ deltaSeconds, scale });
}
