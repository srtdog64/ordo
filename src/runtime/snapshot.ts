import { getOrdoStateIndex } from "../machine/state-index.js";
import type {
  OrdoActionTrace,
  OrdoDefinition,
  OrdoRuntime,
  OrdoSnapshot,
  OrdoStateDefinition
} from "../definition/types.js";

export interface OrdoSnapshotOptions {
  readonly actions?: readonly string[];
  readonly actionTrace?: readonly OrdoActionTrace[];
  readonly delta?: number;
  readonly timeScale?: number;
}

export function createOrdoSnapshot<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  state?: OrdoStateDefinition<TPayload>,
  options: readonly string[] | OrdoSnapshotOptions = {}
): OrdoSnapshot<TPayload> {
  const resolvedState = state ?? getOrdoStateIndex(definition).get(runtime.state);
  let snapshotOptions: OrdoSnapshotOptions;
  if (Array.isArray(options as unknown)) {
    snapshotOptions = { actions: options as readonly string[] };
  } else {
    snapshotOptions = options as OrdoSnapshotOptions;
  }
  const actions = snapshotOptions.actions ?? [];

  return {
    state: runtime.state,
    elapsed: runtime.elapsed,
    ...(snapshotOptions.delta !== undefined ? { delta: snapshotOptions.delta } : {}),
    ...(snapshotOptions.timeScale !== undefined ? { timeScale: snapshotOptions.timeScale } : {}),
    ...(runtime.previousState !== undefined ? { previousState: runtime.previousState } : {}),
    ...(runtime.forced ? { forced: true } : {}),
    ...(resolvedState?.payload !== undefined ? { payload: resolvedState.payload } : {}),
    ...(runtime.transition !== undefined ? { transition: runtime.transition } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(snapshotOptions.actionTrace && snapshotOptions.actionTrace.length > 0
      ? { actionTrace: snapshotOptions.actionTrace }
      : {})
  };
}
