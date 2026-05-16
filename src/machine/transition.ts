import {
  collectOrdoParameterConditions,
  evaluateOrdoConditionExpression
} from "./condition.js";
import type {
  OrdoDefinition,
  OrdoCondition,
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
  elapsed: number,
  events: ReadonlySet<string> = new Set()
): OrdoTransitionSelection | undefined {
  return (
    selectFromTransitions("global", state.id, definition.globalTransitions ?? [], parameters, elapsed, events) ??
    selectFromTransitions("state", state.id, state.transitions ?? [], parameters, elapsed, events)
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
  elapsed: number,
  events: ReadonlySet<string>
): OrdoTransitionSelection | undefined {
  let selected: OrdoTransitionDefinition | undefined;
  let selectedPriority = Number.NEGATIVE_INFINITY;

  for (const transition of transitions) {
    if (!canTakeTransition(transition, parameters, elapsed, events)) continue;

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
  elapsed: number,
  events: ReadonlySet<string>
): boolean {
  if (transition.exitTime !== undefined && elapsed < transition.exitTime) return false;
  const context = { parameters, events };
  const legacyConditions = transition.conditions ?? [];
  const legacyOk = legacyConditions.every((condition) =>
    evaluateOrdoConditionExpression(condition, context)
  );
  return legacyOk && (
    transition.condition
      ? evaluateOrdoConditionExpression(transition.condition, context)
      : true
  );
}

export function getOrdoTransitionParameterConditions(
  transition: OrdoTransitionDefinition
): readonly OrdoCondition[] {
  return [
    ...(transition.conditions ?? []),
    ...collectOrdoParameterConditions(transition.condition)
  ];
}
