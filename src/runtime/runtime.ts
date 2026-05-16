import { ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy, getOrdoTransitionPolicy, logOrdoEvent, resolveOrdoPolicy } from "../core/policy.js";
import { findOrdoState } from "../machine/state-index.js";
import { consumeOrdoTriggers } from "../machine/trigger.js";
import {
  advanceOrdoTransition,
  createOrdoTransitionRuntime,
  selectOrdoTransition
} from "../machine/transition.js";
import { validateOrdoDefinition } from "../definition/validation.js";
import { getOrdoParameterDefaults } from "./parameters.js";
import { createOrdoSnapshot } from "./snapshot.js";
import type {
  OrdoDefinition,
  OrdoCondition,
  OrdoPolicyInput,
  OrdoRuntime,
  OrdoStepOptions,
  OrdoStepResult,
  OrdoTransitionRuntime
} from "../definition/types.js";

export function createOrdoRuntime<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoRuntime> {
  const policy = resolveOrdoPolicy(policyInput);
  const validation = validateOrdoDefinition(definition, policy);

  if (!validation.ok) {
    logOrdoEvent(policy, "ValidateInput", "RuntimeCreation_Failed", { initial: definition.initial }, validation.error);
    return validation;
  }

  logOrdoEvent(policy, "ValidateInput", "RuntimeCreated", { state: definition.initial });

  return ok({
    state: definition.initial,
    elapsed: 0,
    parameters: getOrdoParameterDefaults(definition)
  });
}

export function stepOrdo<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number,
  policyInput?: OrdoPolicyInput
): OrdoResult<OrdoStepResult<TPayload>>;
export function stepOrdo<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number,
  policyInput: OrdoPolicyInput | undefined,
  options: OrdoStepOptions
): OrdoResult<OrdoStepResult<TPayload>>;
export function stepOrdo<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy,
  options: OrdoStepOptions = {}
): OrdoResult<OrdoStepResult<TPayload>> {
  const policy = resolveOrdoPolicy(policyInput);
  const shouldConsumeTriggers = options.consumeTriggers ?? true;
  const stateResult = findOrdoState(definition, runtime.state);

  if (!stateResult.ok) {
    return stateResult;
  }

  const state = stateResult.value;
  const delta = Math.max(0, deltaSeconds);
  const elapsed = runtime.elapsed + delta;

  if (runtime.forced) {
    const nextRuntime: OrdoRuntime = {
      ...runtime,
      elapsed,
      forced: runtime.forced
    };
    return ok({
      runtime: nextRuntime,
      snapshot: createOrdoSnapshot(definition, nextRuntime, state, state.onUpdate ?? [])
    });
  }

  const transition = advanceOrdoTransition(runtime.transition, delta);

  if (transition && getOrdoTransitionPolicy(definition, policy) === "blocking") {
    const nextRuntime = buildRuntime(runtime, elapsed, transition);
    const consumedRuntime = consumeStepTriggers(definition, nextRuntime, [], shouldConsumeTriggers);
    return ok({
      runtime: consumedRuntime,
      snapshot: createOrdoSnapshot(definition, consumedRuntime, state, state.onUpdate ?? [])
    });
  }

  const selectedTransition = selectOrdoTransition(definition, state, runtime.parameters, elapsed);

  if (!selectedTransition || selectedTransition.transition.to === state.id) {
    const nextRuntime = buildRuntime(runtime, elapsed, transition);
    const consumedRuntime = consumeStepTriggers(
      definition,
      nextRuntime,
      selectedTransition?.transition.conditions ?? [],
      shouldConsumeTriggers
    );
    return ok({
      runtime: consumedRuntime,
      snapshot: createOrdoSnapshot(definition, consumedRuntime, state, state.onUpdate ?? []),
      ...(selectedTransition ? { selectedTransition } : {})
    });
  }

  const nextStateResult = findOrdoState(definition, selectedTransition.transition.to);
  if (!nextStateResult.ok) {
    return nextStateResult;
  }

  const nextState = nextStateResult.value;
  const nextTransition = createOrdoTransitionRuntime(state.id, selectedTransition.transition);
  const nextRuntime: OrdoRuntime = {
    state: nextState.id,
    previousState: state.id,
    elapsed: 0,
    parameters: runtime.parameters,
    ...(nextTransition ? { transition: nextTransition } : {})
  };

  logOrdoEvent(policy, "StateMachineStep", "StateTransition", {
    from: state.id,
    to: nextState.id,
    source: selectedTransition.source
  });

  const actions = [...(state.onExit ?? []), ...(nextState.onEnter ?? [])];
  const consumedRuntime = consumeStepTriggers(
    definition,
    nextRuntime,
    selectedTransition.transition.conditions ?? [],
    shouldConsumeTriggers
  );

  return ok({
    runtime: consumedRuntime,
    snapshot: createOrdoSnapshot(definition, consumedRuntime, nextState, actions),
    selectedTransition
  });
}

function consumeStepTriggers<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  conditions: readonly OrdoCondition[],
  enabled: boolean
): OrdoRuntime {
  return enabled ? consumeOrdoTriggers(definition, runtime, conditions) : runtime;
}

function buildRuntime(
  runtime: OrdoRuntime,
  elapsed: number,
  transition: OrdoTransitionRuntime | undefined
): OrdoRuntime {
  return {
    state: runtime.state,
    elapsed,
    parameters: runtime.parameters,
    ...(runtime.previousState !== undefined ? { previousState: runtime.previousState } : {}),
    ...(runtime.forced !== undefined ? { forced: runtime.forced } : {}),
    ...(transition !== undefined ? { transition } : {})
  };
}
