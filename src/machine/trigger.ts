import type { OrdoCondition, OrdoDefinition, OrdoRuntime } from "../definition/types.js";

export function consumeOrdoTriggers<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  conditions?: readonly OrdoCondition[]
): OrdoRuntime {
  const nextParameters = { ...runtime.parameters };
  let changed = false;
  const conditionParameters = conditions
    ? new Set(conditions.map((condition) => condition.parameter))
    : undefined;

  for (const param of definition.parameters ?? []) {
    if (conditionParameters && !conditionParameters.has(param.name)) {
      continue;
    }

    if (param.type === "trigger" && nextParameters[param.name] === true) {
      nextParameters[param.name] = false;
      changed = true;
    }
  }

  return changed ? { ...runtime, parameters: nextParameters } : runtime;
}
