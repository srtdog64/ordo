export interface OrdoClockInput {
  readonly deltaSeconds: number;
  readonly scale?: number;
  readonly paused?: boolean;
  readonly minDelta?: number;
  readonly maxDelta?: number;
}

export function scaleOrdoDelta(input: OrdoClockInput): number {
  if (input.paused) return 0;

  const scaleInput = input.scale ?? 1;
  const scale = Number.isFinite(scaleInput) ? Math.max(0, scaleInput) : 1;
  const base = Number.isFinite(input.deltaSeconds) ? Math.max(0, input.deltaSeconds) : 0;
  const scaled = base * scale;
  const min = Number.isFinite(input.minDelta ?? 0) ? input.minDelta ?? 0 : 0;
  const max = Number.isFinite(input.maxDelta ?? Number.POSITIVE_INFINITY)
    ? input.maxDelta ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;

  return Math.min(Math.max(scaled, min), max);
}

export function createOrdoClock(defaultScale = 1): (deltaSeconds: number, scale?: number) => number {
  return (deltaSeconds, scale = defaultScale) => scaleOrdoDelta({ deltaSeconds, scale });
}
