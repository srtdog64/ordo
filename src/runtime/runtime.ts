import { ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy, logOrdoEvent, resolveOrdoPolicy } from "../core/policy.js";
import { validateOrdoDefinition } from "../definition/validation.js";
import { getOrdoParameterDefaults } from "./parameters.js";
import { runStepPipeline } from "./step.js";
import type {
  OrdoDefinition,
  OrdoPolicyInput,
  OrdoRuntime,
  OrdoStepOptions,
  OrdoStepResult
} from "../definition/types.js";

export function createOrdoRuntime<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoRuntime> {
  const policy = resolveOrdoPolicy(policyInput);
  const validation = validateOrdoDefinition(definition, policy);

  if (!validation.ok) {
    logOrdoEvent(
      policy,
      "error",
      "ValidateInput",
      "RuntimeCreation_Failed",
      { initial: definition.initial },
      validation.error
    );
    return validation;
  }

  logOrdoEvent(policy, "info", "ValidateInput", "RuntimeCreated", {
    state: definition.initial
  });

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
  return runStepPipeline(definition, runtime, deltaSeconds, policyInput, options);
}
