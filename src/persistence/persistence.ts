import { err, ordoError, ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy, resolveOrdoPolicy } from "../core/policy.js";
import { validateOrdoDefinition } from "../definition/validation.js";
import type { OrdoDefinition, OrdoPolicyInput, OrdoRuntime } from "../definition/types.js";

export function serializeOrdoDefinition<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): string {
  const policy = resolveOrdoPolicy(policyInput);
  const data = policy.persistence.includeEditorLayout
    ? definition
    : withoutEditorLayout(definition);

  return JSON.stringify(data, null, policy.persistence.prettyPrint ? 2 : 0);
}

export function deserializeOrdoDefinition<TPayload>(
  json: string,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoDefinition<TPayload>> {
  try {
    const definition = JSON.parse(json) as OrdoDefinition<TPayload>;
    const validation = validateOrdoDefinition(definition, policyInput);

    if (!validation.ok) {
      return validation;
    }

    return ok(definition);
  } catch (cause) {
    return err(ordoError("VALIDATION_INVALID_FORMAT", "Failed to parse Ordo definition JSON", "ParseRequest", {}, cause));
  }
}

export function serializeOrdoRuntime(runtime: OrdoRuntime): string {
  return JSON.stringify(runtime);
}

export function deserializeOrdoRuntime(json: string): OrdoResult<OrdoRuntime> {
  try {
    return ok(JSON.parse(json) as OrdoRuntime);
  } catch (cause) {
    return err(ordoError("VALIDATION_INVALID_FORMAT", "Failed to parse Ordo runtime JSON", "ParseRequest", {}, cause));
  }
}

function withoutEditorLayout<TPayload>(
  definition: OrdoDefinition<TPayload>
): Omit<OrdoDefinition<TPayload>, "editorLayout"> {
  const { editorLayout: _editorLayout, ...data } = definition;
  return data;
}
