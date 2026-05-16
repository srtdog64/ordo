import type { OrdoError, OrdoStage } from "./result.js";
import type {
  OrdoDefinition,
  OrdoLogBaseFields,
  OrdoLogEntry,
  OrdoLogLevel,
  OrdoPolicy,
  OrdoPolicyInput
} from "../definition/types.js";

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

const LEVEL_ORDER: Readonly<Record<OrdoLogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export function logOrdoEvent(
  policy: OrdoPolicy,
  level: OrdoLogLevel,
  stage: OrdoStage,
  event: string,
  data?: Record<string, unknown>,
  error?: OrdoError
): void {
  const logging = policy.logging;
  const sink = logging?.sink;
  if (!sink) return;

  const minLevel = logging?.minLevel ?? "info";
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const base: OrdoLogBaseFields = logging?.baseFields?.() ?? {};
  const meta =
    data || base.meta ? { ...(base.meta ?? {}), ...(data ?? {}) } : undefined;

  const entry: OrdoLogEntry = {
    ts: new Date().toISOString(),
    level,
    stage,
    event,
    ...(base.requestId !== undefined ? { requestId: base.requestId } : {}),
    ...(base.runtimeFingerprint !== undefined
      ? { runtimeFingerprint: base.runtimeFingerprint }
      : {}),
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    ...(error ? { error: { code: error.code, message: error.message } } : {})
  };
  sink(entry);
}
