export type OrdoStage =
  | "ParseRequest"
  | "ValidateInput"
  | "Transform"
  | "Persist"
  | "Respond"
  | "StateMachineStep";

export type OrdoErrorCode =
  | "STATE_DUPLICATE"
  | "STATE_MISSING"
  | "PARAMETER_DUPLICATE"
  | "PARAMETER_MISSING"
  | "PARAMETER_TYPE_MISMATCH"
  | "CONDITION_VALUE_MISSING"
  | "VALIDATION_INVALID_FORMAT"
  | "UNEXPECTED_EXCEPTION";

export interface OrdoError {
  readonly code: OrdoErrorCode;
  readonly message: string;
  readonly stage: OrdoStage;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export type OrdoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: OrdoError };

export function ok<T>(value: T): OrdoResult<T> {
  return { ok: true, value };
}

export function err(error: OrdoError): OrdoResult<never> {
  return { ok: false, error };
}

export function ordoError(
  code: OrdoErrorCode,
  message: string,
  stage: OrdoStage,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown
): OrdoError {
  return {
    code,
    message,
    stage,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {})
  };
}
