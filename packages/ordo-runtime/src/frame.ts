import type { OrdoParameterValue } from "@exornea/ordo";

export interface OrdoFrameInput {
  readonly deltaSeconds: number;
  readonly events?: readonly string[];
  readonly parameterPatch?: Readonly<Record<string, OrdoParameterValue>>;
  readonly timeScale?: number;
  readonly paused?: boolean;
}

export interface OrdoFrameEnvelope {
  readonly deltaSeconds: number;
  readonly events: readonly string[];
  readonly parameterPatch: Readonly<Record<string, OrdoParameterValue>>;
  readonly timeScale?: number;
  readonly paused?: boolean;
}

export function createOrdoFrame(input: OrdoFrameInput): OrdoFrameEnvelope {
  return {
    deltaSeconds: input.deltaSeconds,
    events: input.events ?? [],
    parameterPatch: input.parameterPatch ?? {},
    ...(input.timeScale !== undefined ? { timeScale: input.timeScale } : {}),
    ...(input.paused !== undefined ? { paused: input.paused } : {})
  };
}
