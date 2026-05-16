import { err, ordoError, ok, type OrdoError, type OrdoResult, type OrdoStage } from "../core/result.js";
import { DefaultOrdoPolicy, resolveOrdoPolicy } from "../core/policy.js";
import type {
  OrdoCondition,
  OrdoConditionExpression,
  OrdoDefinition,
  OrdoParameterDefinition,
  OrdoPolicyInput,
  OrdoValidationReport
} from "./types.js";

export function validateOrdoDefinition<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<void> {
  const report = inspectOrdoDefinition(definition, policyInput);
  if (report.ok) return ok(undefined);
  const [first] = report.errors;
  if (!first) return ok(undefined);
  return err(first);
}

export function inspectOrdoDefinition<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoValidationReport {
  const stage: OrdoStage = "ValidateInput";
  const policy = resolveOrdoPolicy(policyInput);
  const ids = new Set<string>();
  const parameters = new Map<string, OrdoParameterDefinition>();
  const errors: OrdoError[] = [];

  for (const state of definition.states) {
    if (ids.has(state.id)) {
      errors.push(ordoError("STATE_DUPLICATE", `Duplicate state ID: ${state.id}`, stage, { id: state.id }));
    }
    ids.add(state.id);
  }

  for (const parameter of definition.parameters ?? []) {
    if (parameters.has(parameter.name)) {
      errors.push(ordoError("PARAMETER_DUPLICATE", `Duplicate parameter: ${parameter.name}`, stage, { name: parameter.name }));
    }

    if (parameter.type === "trigger" && typeof parameter.defaultValue !== "boolean") {
      errors.push(ordoError(
        "PARAMETER_TYPE_MISMATCH",
        `Trigger parameter must use a boolean default value: ${parameter.name}`,
        stage,
        { name: parameter.name, expected: "boolean", actual: typeof parameter.defaultValue }
      ));
    }

    parameters.set(parameter.name, parameter);
  }

  if (!ids.has(definition.initial)) {
    errors.push(ordoError("STATE_MISSING", `Initial state not found: ${definition.initial}`, stage, { id: definition.initial }));
  }

  for (const state of definition.states) {
    for (const transition of state.transitions ?? []) {
      if (!ids.has(transition.to)) {
        errors.push(ordoError("STATE_MISSING", `Transition target not found: ${transition.to}`, stage, { from: state.id, to: transition.to }));
      }

      errors.push(...validateConditions(
        getTransitionConditions(transition.conditions, transition.condition),
        parameters,
        policy.validation.allowMissingParameters,
        policy.validation.strictTypeChecking,
        stage,
        state.id,
        transition.to
      ));
    }
  }

  for (const transition of definition.globalTransitions ?? []) {
    if (!ids.has(transition.to)) {
      errors.push(ordoError("STATE_MISSING", `Global transition target not found: ${transition.to}`, stage, { to: transition.to }));
    }

    errors.push(...validateConditions(
      getTransitionConditions(transition.conditions, transition.condition),
      parameters,
      policy.validation.allowMissingParameters,
      policy.validation.strictTypeChecking,
      stage,
      "global",
      transition.to
    ));
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function getTransitionConditions(
  conditions: readonly OrdoCondition[] | undefined,
  condition: OrdoConditionExpression | undefined
): readonly OrdoConditionExpression[] {
  return [...(conditions ?? []), ...(condition ? [condition] : [])];
}

function validateConditions(
  conditions: readonly OrdoConditionExpression[],
  parameters: ReadonlyMap<string, OrdoParameterDefinition>,
  allowMissingParameters: boolean,
  strictTypeChecking: boolean,
  stage: OrdoStage,
  state: string,
  to: string
): OrdoError[] {
  const errors: OrdoError[] = [];

  for (const condition of conditions) {
    if ("event" in condition) {
      continue;
    }

    if ("op" in condition) {
      if (condition.op === "not" && condition.conditions.length !== 1) {
        errors.push(ordoError(
          "CONDITION_VALUE_MISSING",
          "Not condition groups must contain exactly one child condition",
          stage,
          { state, to, operator: "not" }
        ));
      }
      errors.push(...validateConditions(
        condition.conditions,
        parameters,
        allowMissingParameters,
        strictTypeChecking,
        stage,
        state,
        to
      ));
      continue;
    }

    const parameter = parameters.get(condition.parameter);
    if (!parameter) {
      if (!allowMissingParameters) {
        errors.push(ordoError(
          "PARAMETER_MISSING",
          `Condition parameter not found: ${condition.parameter}`,
          stage,
          { state, to, parameter: condition.parameter }
        ));
      }
      continue;
    }

    if (strictTypeChecking) {
      const conditionError = validateConditionType(condition, parameter, stage, state, to);
      if (conditionError) errors.push(conditionError);
    }
  }

  return errors;
}

function validateConditionType(
  condition: OrdoCondition,
  parameter: OrdoParameterDefinition,
  stage: OrdoStage,
  state: string,
  to: string
): OrdoError | undefined {
  const operator = condition.operator ?? "truthy";
  const defaultType = typeof parameter.defaultValue;
  const details = { state, to, parameter: condition.parameter, operator };

  if (operator === "truthy") {
    return undefined;
  }

  if (condition.value === undefined) {
    return ordoError(
      "CONDITION_VALUE_MISSING",
      `Condition operator requires a value: ${condition.parameter}`,
      stage,
      details
    );
  }

  if (operator === "equals" || operator === "notEquals") {
    if (typeof condition.value !== defaultType) {
      return ordoError(
        "PARAMETER_TYPE_MISMATCH",
        `Condition value type does not match parameter: ${condition.parameter}`,
        stage,
        { ...details, expected: defaultType, actual: typeof condition.value }
      );
    }
    return undefined;
  }

  if (defaultType !== "number" || typeof condition.value !== "number") {
    return ordoError(
      "PARAMETER_TYPE_MISMATCH",
      `Numeric condition requires a number parameter and value: ${condition.parameter}`,
      stage,
      { ...details, expected: "number", parameterType: defaultType, valueType: typeof condition.value }
    );
  }

  return undefined;
}
