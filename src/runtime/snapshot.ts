import { getOrdoStateIndex } from "../machine/state-index.js";
import type {
  OrdoDefinition,
  OrdoRuntime,
  OrdoSnapshot,
  OrdoStateDefinition
} from "../definition/types.js";

export function createOrdoSnapshot<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  state?: OrdoStateDefinition<TPayload>,
  actions: readonly string[] = []
): OrdoSnapshot<TPayload> {
  const resolvedState = state ?? getOrdoStateIndex(definition).get(runtime.state);

  return {
    state: runtime.state,
    elapsed: runtime.elapsed,
    ...(runtime.previousState !== undefined ? { previousState: runtime.previousState } : {}),
    ...(runtime.forced ? { forced: true } : {}),
    ...(resolvedState?.payload !== undefined ? { payload: resolvedState.payload } : {}),
    ...(runtime.transition !== undefined ? { transition: runtime.transition } : {}),
    ...(actions.length > 0 ? { actions } : {})
  };
}
