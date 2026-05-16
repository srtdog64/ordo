import type { OrdoError, OrdoStage } from "./result.js";
import type { OrdoDefinition, OrdoLogEntry, OrdoPolicy, OrdoPolicyInput } from "../definition/types.js";

export const DefaultOrdoPolicy: OrdoPolicy = {
  validation: {
    allowMissingParameters: false,
    strictTypeChecking: true
  },
  transition: "interruptible",
  persistence: {
    prettyPrint: true,
    includeEditorLayout: false
  }
};

export function resolveOrdoPolicy(policy: OrdoPolicyInput = {}): OrdoPolicy {
  return {
    validation: {
      ...DefaultOrdoPolicy.validation,
      ...policy.validation
    },
    transition: policy.transition ?? DefaultOrdoPolicy.transition,
    persistence: {
      ...DefaultOrdoPolicy.persistence,
      ...policy.persistence
    },
    ...(policy.logging ? { logging: policy.logging } : {})
  };
}

export function getOrdoTransitionPolicy<TPayload>(
  definition: OrdoDefinition<TPayload>,
  policy: OrdoPolicy
): OrdoPolicy["transition"] {
  return definition.transitionPolicy ?? policy.transition;
}

export function logOrdoEvent(
  policy: OrdoPolicy,
  stage: OrdoStage,
  event: string,
  data?: Record<string, unknown>,
  error?: OrdoError
): void {
  const sink = policy.logging?.sink;
  if (!sink) return;

  const log: OrdoLogEntry = {
    ts: new Date().toISOString(),
    level: error ? "error" : "info",
    stage,
    event,
    ...(data ? { meta: data } : {}),
    ...(error ? { error: { code: error.code, message: error.message } } : {})
  };
  sink(log);
}
