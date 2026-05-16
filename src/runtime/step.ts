import { ok, type OrdoResult } from "../core/result.js";
import { getOrdoTransitionPolicy, logOrdoEvent, resolveOrdoPolicy } from "../core/policy.js";
import { findOrdoState } from "../machine/state-index.js";
import { consumeOrdoTriggers } from "../machine/trigger.js";
import {
  advanceOrdoTransition,
  createOrdoTransitionRuntime,
  selectOrdoTransition
} from "../machine/transition.js";
import { createOrdoSnapshot } from "./snapshot.js";
import type {
  OrdoCondition,
  OrdoDefinition,
  OrdoPolicy,
  OrdoPolicyInput,
  OrdoRuntime,
  OrdoStateDefinition,
  OrdoStepOptions,
  OrdoStepResult,
  OrdoTransitionRuntime,
  OrdoTransitionSelection
} from "../definition/types.js";

interface StepContext<TPayload> {
  readonly definition: OrdoDefinition<TPayload>;
  readonly runtime: OrdoRuntime;
  readonly policy: OrdoPolicy;
  readonly state: OrdoStateDefinition<TPayload>;
  readonly delta: number;
  readonly elapsed: number;
  readonly consumeTriggers: boolean;
}

type StepMode<TPayload> =
  | { readonly kind: "forced" }
  | { readonly kind: "holdingBlocking"; readonly transition: OrdoTransitionRuntime }
  | {
      readonly kind: "inPlace";
      readonly transition?: OrdoTransitionRuntime;
      readonly selected?: OrdoTransitionSelection;
    }
  | {
      readonly kind: "transitioning";
      readonly selected: OrdoTransitionSelection;
      readonly nextState: OrdoStateDefinition<TPayload>;
    };

interface StepDraft<TPayload> {
  readonly nextRuntime: OrdoRuntime;
  readonly nextState: OrdoStateDefinition<TPayload>;
  readonly actions: readonly string[];
  readonly conditions: readonly OrdoCondition[];
  readonly transitioned: boolean;
  readonly selectedTransition?: OrdoTransitionSelection;
}

export function runStepPipeline<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number,
  policyInput?: OrdoPolicyInput,
  options: OrdoStepOptions = {}
): OrdoResult<OrdoStepResult<TPayload>> {
  const ctxResult = prepareStepContext(definition, runtime, deltaSeconds, policyInput, options);
  if (!ctxResult.ok) return ctxResult;

  const modeResult = resolveStepMode(ctxResult.value);
  if (!modeResult.ok) return modeResult;

  const draft = applyStepMode(ctxResult.value, modeResult.value);
  return ok(finalizeStep(ctxResult.value, draft));
}

function prepareStepContext<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number,
  policyInput: OrdoPolicyInput | undefined,
  options: OrdoStepOptions
): OrdoResult<StepContext<TPayload>> {
  const policy = resolveOrdoPolicy(policyInput);
  const stateResult = findOrdoState(definition, runtime.state);
  if (!stateResult.ok) return stateResult;

  const delta = Math.max(0, deltaSeconds);
  return ok({
    definition,
    runtime,
    policy,
    state: stateResult.value,
    delta,
    elapsed: runtime.elapsed + delta,
    consumeTriggers: options.consumeTriggers ?? true
  });
}

function resolveStepMode<TPayload>(
  ctx: StepContext<TPayload>
): OrdoResult<StepMode<TPayload>> {
  if (ctx.runtime.forced) {
    return ok({ kind: "forced" });
  }

  const advanced = advanceOrdoTransition(ctx.runtime.transition, ctx.delta);
  const blocking = getOrdoTransitionPolicy(ctx.definition, ctx.policy) === "blocking";

  if (advanced && blocking) {
    return ok({ kind: "holdingBlocking", transition: advanced });
  }

  const selected = selectOrdoTransition(
    ctx.definition,
    ctx.state,
    ctx.runtime.parameters,
    ctx.elapsed
  );

  if (!selected || selected.transition.to === ctx.state.id) {
    return ok({
      kind: "inPlace",
      ...(advanced ? { transition: advanced } : {}),
      ...(selected ? { selected } : {})
    });
  }

  const nextStateResult = findOrdoState(ctx.definition, selected.transition.to);
  if (!nextStateResult.ok) return nextStateResult;

  return ok({ kind: "transitioning", selected, nextState: nextStateResult.value });
}

function applyStepMode<TPayload>(
  ctx: StepContext<TPayload>,
  mode: StepMode<TPayload>
): StepDraft<TPayload> {
  if (mode.kind === "forced") {
    return {
      nextRuntime: copyRuntime(ctx.runtime, { elapsed: ctx.elapsed }),
      nextState: ctx.state,
      actions: ctx.state.onUpdate ?? [],
      conditions: [],
      transitioned: false
    };
  }

  if (mode.kind === "holdingBlocking") {
    return {
      nextRuntime: copyRuntime(ctx.runtime, { elapsed: ctx.elapsed, transition: mode.transition }),
      nextState: ctx.state,
      actions: ctx.state.onUpdate ?? [],
      conditions: [],
      transitioned: false
    };
  }

  if (mode.kind === "inPlace") {
    return {
      nextRuntime: copyRuntime(ctx.runtime, { elapsed: ctx.elapsed, transition: mode.transition }),
      nextState: ctx.state,
      actions: ctx.state.onUpdate ?? [],
      conditions: mode.selected?.transition.conditions ?? [],
      transitioned: false,
      ...(mode.selected ? { selectedTransition: mode.selected } : {})
    };
  }

  const nextTransition = createOrdoTransitionRuntime(ctx.state.id, mode.selected.transition);
  return {
    nextRuntime: {
      state: mode.nextState.id,
      previousState: ctx.state.id,
      elapsed: 0,
      parameters: ctx.runtime.parameters,
      ...(nextTransition ? { transition: nextTransition } : {})
    },
    nextState: mode.nextState,
    actions: [...(ctx.state.onExit ?? []), ...(mode.nextState.onEnter ?? [])],
    conditions: mode.selected.transition.conditions ?? [],
    transitioned: true,
    selectedTransition: mode.selected
  };
}

function finalizeStep<TPayload>(
  ctx: StepContext<TPayload>,
  draft: StepDraft<TPayload>
): OrdoStepResult<TPayload> {
  const consumedRuntime = ctx.consumeTriggers
    ? consumeOrdoTriggers(ctx.definition, draft.nextRuntime, draft.conditions)
    : draft.nextRuntime;

  if (consumedRuntime !== draft.nextRuntime) {
    logOrdoEvent(ctx.policy, "debug", "StateMachineStep", "TriggerConsumed", {
      state: draft.nextState.id,
      conditions: draft.conditions.map((condition) => condition.parameter)
    });
  }

  if (draft.transitioned && draft.selectedTransition) {
    logOrdoEvent(ctx.policy, "info", "StateMachineStep", "StateTransition", {
      from: ctx.state.id,
      to: draft.nextState.id,
      source: draft.selectedTransition.source
    });
  } else if (draft.selectedTransition) {
    logOrdoEvent(ctx.policy, "debug", "StateMachineStep", "TransitionSelected", {
      from: ctx.state.id,
      to: draft.selectedTransition.transition.to,
      source: draft.selectedTransition.source
    });
  } else if (ctx.runtime.forced) {
    logOrdoEvent(ctx.policy, "debug", "StateMachineStep", "ForcedState_Held", {
      state: ctx.state.id
    });
  }

  return {
    runtime: consumedRuntime,
    snapshot: createOrdoSnapshot(ctx.definition, consumedRuntime, draft.nextState, draft.actions),
    ...(draft.selectedTransition ? { selectedTransition: draft.selectedTransition } : {})
  };
}

function copyRuntime(
  runtime: OrdoRuntime,
  patch: { elapsed: number; transition?: OrdoTransitionRuntime | undefined }
): OrdoRuntime {
  return {
    state: runtime.state,
    elapsed: patch.elapsed,
    parameters: runtime.parameters,
    ...(runtime.previousState !== undefined ? { previousState: runtime.previousState } : {}),
    ...(runtime.forced !== undefined ? { forced: runtime.forced } : {}),
    ...(patch.transition !== undefined ? { transition: patch.transition } : {})
  };
}
