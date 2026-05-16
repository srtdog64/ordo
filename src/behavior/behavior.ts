import { ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy, logOrdoEvent, resolveOrdoPolicy } from "../core/policy.js";
import { createOrdoRuntime, stepOrdo } from "../runtime/runtime.js";
import { createOrdoSnapshot } from "../runtime/snapshot.js";
import type {
  OrdoBehaviorDefinition,
  OrdoBehaviorRuntime,
  OrdoBehaviorSnapshot,
  OrdoBehaviorStepResult,
  OrdoPolicy,
  OrdoPolicyInput,
  OrdoStepOptions
} from "../definition/types.js";

export function createOrdoBehaviorRuntime<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoBehaviorRuntime> {
  const policy = resolveOrdoPolicy(policyInput);
  return createBehaviorRuntimeInternal(definition, policyInput, policy);
}

function createBehaviorRuntimeInternal<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  policyInput: OrdoPolicyInput,
  policy: OrdoPolicy
): OrdoResult<OrdoBehaviorRuntime> {
  const root = createOrdoRuntime(definition.machine, policyInput);
  if (!root.ok) return root;

  const childDefinition = getActiveChildDefinition(definition, root.value.state);
  if (!childDefinition) {
    return ok({ id: definition.id, runtime: root.value });
  }

  const child = createBehaviorRuntimeInternal(childDefinition, policyInput, policy);
  if (!child.ok) return child;

  logOrdoEvent(policy, "info", "StateMachineStep", "BehaviorChild_Activated", {
    parent: definition.id,
    state: root.value.state,
    child: childDefinition.id
  });

  return ok({
    id: definition.id,
    runtime: root.value,
    activeChild: childDefinition.id,
    child: child.value
  });
}

export function stepOrdoBehavior<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  runtime: OrdoBehaviorRuntime,
  deltaSeconds: number,
  policyInput?: OrdoPolicyInput
): OrdoResult<OrdoBehaviorStepResult<TPayload>>;
export function stepOrdoBehavior<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  runtime: OrdoBehaviorRuntime,
  deltaSeconds: number,
  policyInput: OrdoPolicyInput | undefined,
  options: OrdoStepOptions
): OrdoResult<OrdoBehaviorStepResult<TPayload>>;
export function stepOrdoBehavior<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  runtime: OrdoBehaviorRuntime,
  deltaSeconds: number,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy,
  options: OrdoStepOptions = {}
): OrdoResult<OrdoBehaviorStepResult<TPayload>> {
  const policy = resolveOrdoPolicy(policyInput);
  const steppedRoot = stepOrdo(definition.machine, runtime.runtime, deltaSeconds, policyInput, options);
  if (!steppedRoot.ok) return steppedRoot;

  const history = rememberActiveChild(definition, runtime);
  const childDefinition = getActiveChildDefinition(definition, steppedRoot.value.runtime.state);
  if (!childDefinition) {
    if (runtime.activeChild !== undefined) {
      logOrdoEvent(policy, "info", "StateMachineStep", "BehaviorChild_Released", {
        parent: definition.id,
        state: steppedRoot.value.runtime.state,
        child: runtime.activeChild
      });
    }
    return ok({
      runtime: {
        id: definition.id,
        runtime: steppedRoot.value.runtime,
        ...(hasKeys(history) ? { history } : {})
      },
      snapshot: {
        id: definition.id,
        snapshot: steppedRoot.value.snapshot
      }
    });
  }

  const reusingChild = runtime.activeChild === childDefinition.id && runtime.child !== undefined;
  if (!reusingChild && runtime.activeChild !== undefined && runtime.activeChild !== childDefinition.id) {
    logOrdoEvent(policy, "info", "StateMachineStep", "BehaviorChild_Released", {
      parent: definition.id,
      state: steppedRoot.value.runtime.state,
      child: runtime.activeChild
    });
  }

  const historicalChild = definition.history
    ? history[steppedRoot.value.runtime.state]
    : undefined;
  const childRuntimeResult = reusingChild
    ? ok(runtime.child!)
    : historicalChild
      ? ok(historicalChild)
      : createBehaviorRuntimeInternal(childDefinition, policyInput, policy);
  if (!childRuntimeResult.ok) return childRuntimeResult;

  if (!reusingChild) {
    logOrdoEvent(policy, "info", "StateMachineStep", "BehaviorChild_Activated", {
      parent: definition.id,
      state: steppedRoot.value.runtime.state,
      child: childDefinition.id
    });
  }

  const childStep = reusingChild
    ? stepOrdoBehavior(childDefinition, childRuntimeResult.value, deltaSeconds, policyInput, options)
    : ok({
        runtime: childRuntimeResult.value,
        snapshot: createOrdoBehaviorSnapshot(childDefinition, childRuntimeResult.value)
      });
  if (!childStep.ok) return childStep;

  if (reusingChild) {
    logOrdoEvent(policy, "debug", "StateMachineStep", "BehaviorChild_Stepped", {
      parent: definition.id,
      child: childDefinition.id
    });
  }

  return ok({
    runtime: {
      id: definition.id,
      runtime: steppedRoot.value.runtime,
      activeChild: childDefinition.id,
      child: childStep.value.runtime,
      ...(hasKeys(history) ? { history } : {})
    },
    snapshot: {
      id: definition.id,
      snapshot: steppedRoot.value.snapshot,
      activeChild: childDefinition.id,
      child: childStep.value.snapshot
    }
  });
}

export function createOrdoBehaviorSnapshot<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  runtime: OrdoBehaviorRuntime
): OrdoBehaviorSnapshot<TPayload> {
  const childDefinition =
    runtime.activeChild && runtime.child
      ? getActiveChildDefinitionById(definition, runtime.activeChild)
      : undefined;

  return {
    id: definition.id,
    snapshot: createOrdoSnapshot(definition.machine, runtime.runtime),
    ...(runtime.activeChild !== undefined ? { activeChild: runtime.activeChild } : {}),
    ...(childDefinition && runtime.child
      ? { child: createOrdoBehaviorSnapshot(childDefinition, runtime.child) }
      : {})
  };
}

function rememberActiveChild(
  definition: OrdoBehaviorDefinition<unknown>,
  runtime: OrdoBehaviorRuntime
): Readonly<Record<string, OrdoBehaviorRuntime>> {
  if (!definition.history || !runtime.child) {
    return runtime.history ?? {};
  }

  return {
    ...(runtime.history ?? {}),
    [runtime.runtime.state]: runtime.child
  };
}

function getActiveChildDefinition<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  state: string
): OrdoBehaviorDefinition<TPayload> | undefined {
  return definition.children?.[state];
}

function getActiveChildDefinitionById<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  id: string
): OrdoBehaviorDefinition<TPayload> | undefined {
  return Object.values(definition.children ?? {}).find((child) => child.id === id);
}

function hasKeys(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).length > 0;
}
