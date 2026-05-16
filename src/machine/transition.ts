import { evaluateOrdoCondition } from "./condition.js";
import type {
  OrdoDefinition,
  OrdoParameterValue,
  OrdoStateDefinition,
  OrdoTransitionDefinition,
  OrdoTransitionRuntime,
  OrdoTransitionSelection,
  OrdoTransitionSource
} from "../definition/types.js";

export function selectOrdoTransition<TPayload>(
  definition: OrdoDefinition<TPayload>,
  state: OrdoStateDefinition<TPayload>,
  parameters: Record<string, OrdoParameterValue>,
  elapsed: number
): OrdoTransitionSelection | undefined {
  return (
    selectFromTransitions("global", state.id, definition.globalTransitions ?? [], parameters, elapsed) ??
    selectFromTransitions("state", state.id, state.transitions ?? [], parameters, elapsed)
  );
}

export function advanceOrdoTransition(
  transition: OrdoTransitionRuntime | undefined,
  delta: number
): OrdoTransitionRuntime | undefined {
  if (!transition) return undefined;
  const elapsed = transition.elapsed + delta;
  if (elapsed >= transition.duration) return undefined;
  return { ...transition, elapsed };
}

export function createOrdoTransitionRuntime(
  from: string,
  transition: OrdoTransitionDefinition
): OrdoTransitionRuntime | undefined {
  const duration = transition.duration ?? 0;
  if (duration <= 0) return undefined;
  return { from, to: transition.to, duration, elapsed: 0 };
}

function selectFromTransitions(
  source: OrdoTransitionSource,
  from: string,
  transitions: readonly OrdoTransitionDefinition[],
  parameters: Record<string, OrdoParameterValue>,
  elapsed: number
): OrdoTransitionSelection | undefined {
  let selected: OrdoTransitionDefinition | undefined;
  let selectedPriority = Number.NEGATIVE_INFINITY;

  for (const transition of transitions) {
    if (!canTakeTransition(transition, parameters, elapsed)) continue;

    const priority = transition.priority ?? 0;
    if (!selected || priority > selectedPriority) {
      selected = transition;
      selectedPriority = priority;
    }
  }

  return selected ? { source, from, transition: selected } : undefined;
}

function canTakeTransition(
  transition: OrdoTransitionDefinition,
  parameters: Record<string, OrdoParameterValue>,
  elapsed: number
): boolean {
  if (transition.exitTime !== undefined && elapsed < transition.exitTime) return false;
  return (transition.conditions ?? []).every((condition) =>
    evaluateOrdoCondition(condition, parameters[condition.parameter])
  );
}
