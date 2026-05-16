import { err, ordoError, ok, type OrdoResult } from "../core/result.js";
import { DefaultOrdoPolicy, resolveOrdoPolicy } from "../core/policy.js";
import { validateOrdoDefinition } from "../definition/validation.js";
import type {
  OrdoBehaviorDefinition,
  OrdoBehaviorRuntime,
  OrdoDefinition,
  OrdoPolicyInput,
  OrdoRuntime
} from "../definition/types.js";

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

export function serializeOrdoBehaviorDefinition<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): string {
  const policy = resolveOrdoPolicy(policyInput);
  const data = mapOrdoBehaviorDefinition(definition, (machine) =>
    policy.persistence.includeEditorLayout ? machine : withoutEditorLayout(machine)
  );

  return JSON.stringify(data, null, policy.persistence.prettyPrint ? 2 : 0);
}

export function deserializeOrdoBehaviorDefinition<TPayload>(
  json: string,
  policyInput: OrdoPolicyInput = DefaultOrdoPolicy
): OrdoResult<OrdoBehaviorDefinition<TPayload>> {
  try {
    const definition = JSON.parse(json) as OrdoBehaviorDefinition<TPayload>;
    const validation = validateOrdoBehaviorDefinition(definition, policyInput);

    if (!validation.ok) {
      return validation;
    }

    return ok(definition);
  } catch (cause) {
    return err(ordoError("VALIDATION_INVALID_FORMAT", "Failed to parse Ordo behavior JSON", "ParseRequest", {}, cause));
  }
}

export function serializeOrdoBehaviorRuntime(runtime: OrdoBehaviorRuntime): string {
  return JSON.stringify(runtime);
}

export function deserializeOrdoBehaviorRuntime(json: string): OrdoResult<OrdoBehaviorRuntime> {
  try {
    return ok(JSON.parse(json) as OrdoBehaviorRuntime);
  } catch (cause) {
    return err(ordoError("VALIDATION_INVALID_FORMAT", "Failed to parse Ordo behavior runtime JSON", "ParseRequest", {}, cause));
  }
}

function validateOrdoBehaviorDefinition<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  policyInput: OrdoPolicyInput
): OrdoResult<void> {
  const rootValidation = validateOrdoDefinition(definition.machine, policyInput);
  if (!rootValidation.ok) {
    return rootValidation;
  }

  for (const child of Object.values(definition.children ?? {})) {
    const childValidation = validateOrdoBehaviorDefinition(child, policyInput);
    if (!childValidation.ok) {
      return childValidation;
    }
  }

  return ok(undefined);
}

function mapOrdoBehaviorDefinition<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  mapMachine: (machine: OrdoDefinition<TPayload>) => Omit<OrdoDefinition<TPayload>, "editorLayout"> | OrdoDefinition<TPayload>
): OrdoBehaviorDefinition<TPayload> {
  const children = definition.children
    ? Object.fromEntries(
        Object.entries(definition.children).map(([state, child]) => [
          state,
          mapOrdoBehaviorDefinition(child, mapMachine)
        ])
      )
    : undefined;

  return {
    id: definition.id,
    machine: mapMachine(definition.machine),
    ...(definition.history !== undefined ? { history: definition.history } : {}),
    ...(children ? { children } : {})
  };
}

function withoutEditorLayout<TPayload>(
  definition: OrdoDefinition<TPayload>
): Omit<OrdoDefinition<TPayload>, "editorLayout"> {
  const { editorLayout: _editorLayout, ...data } = definition;
  return data;
}
