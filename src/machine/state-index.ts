import { err, ok, ordoError, type OrdoResult } from "../core/result.js";
import type { OrdoDefinition, OrdoStateDefinition } from "../definition/types.js";

const stateIndexCache = new WeakMap<
  OrdoDefinition<unknown>,
  ReadonlyMap<string, OrdoStateDefinition<unknown>>
>();

export function findOrdoState<TPayload>(
  definition: OrdoDefinition<TPayload>,
  id: string
): OrdoResult<OrdoStateDefinition<TPayload>> {
  const state = getOrdoStateIndex(definition).get(id);
  if (!state) {
    return err(ordoError("STATE_MISSING", `State not found: ${id}`, "StateMachineStep", { id }));
  }
  return ok(state);
}

export function getOrdoStateIndex<TPayload>(
  definition: OrdoDefinition<TPayload>
): ReadonlyMap<string, OrdoStateDefinition<TPayload>> {
  const cached = stateIndexCache.get(definition as OrdoDefinition<unknown>);
  if (cached) {
    return cached as ReadonlyMap<string, OrdoStateDefinition<TPayload>>;
  }

  const index = new Map<string, OrdoStateDefinition<TPayload>>();
  for (const state of definition.states) {
    if (!index.has(state.id)) {
      index.set(state.id, state);
    }
  }

  stateIndexCache.set(
    definition as OrdoDefinition<unknown>,
    index as ReadonlyMap<string, OrdoStateDefinition<unknown>>
  );
  return index;
}

export function assertOrdoStateExists<TPayload>(
  definition: OrdoDefinition<TPayload>,
  state: string
): OrdoResult<void> {
  const result = findOrdoState(definition, state);
  if (result.ok) return ok(undefined);
  return err(ordoError("STATE_MISSING", `State not found: ${state}`, "StateMachineStep", { id: state }));
}
