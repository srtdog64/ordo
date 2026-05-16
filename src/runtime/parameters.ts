import type { OrdoDefinition, OrdoParameterValue, OrdoRuntime } from "../definition/types.js";

export function getOrdoParameterDefaults<TPayload>(
  definition: OrdoDefinition<TPayload>
): Record<string, OrdoParameterValue> {
  const parameters: Record<string, OrdoParameterValue> = {};
  for (const param of definition.parameters ?? []) {
    parameters[param.name] = param.defaultValue;
  }
  return parameters;
}

export function setOrdoParameter(
  runtime: OrdoRuntime,
  name: string,
  value: OrdoParameterValue
): OrdoRuntime {
  return patchOrdoParameters(runtime, { [name]: value });
}

export function patchOrdoParameters(
  runtime: OrdoRuntime,
  values: Readonly<Record<string, OrdoParameterValue>>
): OrdoRuntime {
  return {
    ...runtime,
    parameters: {
      ...runtime.parameters,
      ...values
    }
  };
}
