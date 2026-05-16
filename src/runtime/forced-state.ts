import type { OrdoRuntime } from "../definition/types.js";

export function forceOrdoState(runtime: OrdoRuntime, state: string): OrdoRuntime {
  return {
    state,
    elapsed: 0,
    parameters: runtime.parameters,
    previousState: runtime.state,
    forced: {
      previousState: runtime.state,
      previousElapsed: runtime.elapsed
    }
  };
}

export function releaseOrdoForcedState(runtime: OrdoRuntime): OrdoRuntime {
  if (!runtime.forced) return runtime;

  return {
    state: runtime.forced.previousState,
    elapsed: runtime.forced.previousElapsed,
    parameters: runtime.parameters,
    previousState: runtime.state
  };
}
