import { ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy } from "../core/policy.js";
import { createOrdoRuntime, stepOrdo } from "../runtime/runtime.js";
import { createOrdoSnapshot } from "../runtime/snapshot.js";
import type {
  OrdoBehaviorDefinition,
  OrdoBehaviorRuntime,
  OrdoBehaviorSnapshot,
  OrdoBehaviorStepResult,
  OrdoPolicyInput,
  OrdoStepOptions
} from "../definition/types.js";

export function createOrdoBehaviorRuntime<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoBehaviorRuntime> {
  const root = createOrdoRuntime(definition.machine, policyInput);
  if (!root.ok) return root;

  const childDefinition = getActiveChildDefinition(definition, root.value.state);
  if (!childDefinition) {
    return ok({ id: definition.id, runtime: root.value });
  }

  const child = createOrdoBehaviorRuntime(childDefinition, policyInput);
  if (!child.ok) return child;

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
  const steppedRoot = stepOrdo(definition.machine, runtime.runtime, deltaSeconds, policyInput, options);
  if (!steppedRoot.ok) return steppedRoot;

  const childDefinition = getActiveChildDefinition(definition, steppedRoot.value.runtime.state);
  if (!childDefinition) {
    const nextRuntime: OrdoBehaviorRuntime = {
      id: definition.id,
      runtime: steppedRoot.value.runtime
    };
    return ok({
      runtime: nextRuntime,
      snapshot: {
        id: definition.id,
        snapshot: steppedRoot.value.snapshot
      }
    });
  }

  const childRuntimeResult =
    runtime.activeChild === childDefinition.id && runtime.child
      ? ok(runtime.child)
      : createOrdoBehaviorRuntime(childDefinition, policyInput);

  if (!childRuntimeResult.ok) return childRuntimeResult;

  const shouldStepChild = runtime.activeChild === childDefinition.id;
  const childStep = shouldStepChild
    ? stepOrdoBehavior(childDefinition, childRuntimeResult.value, deltaSeconds, policyInput, options)
    : ok({
        runtime: childRuntimeResult.value,
        snapshot: createOrdoBehaviorSnapshot(childDefinition, childRuntimeResult.value)
      });

  if (!childStep.ok) return childStep;

  const nextRuntime: OrdoBehaviorRuntime = {
    id: definition.id,
    runtime: steppedRoot.value.runtime,
    activeChild: childDefinition.id,
    child: childStep.value.runtime
  };

  return ok({
    runtime: nextRuntime,
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
