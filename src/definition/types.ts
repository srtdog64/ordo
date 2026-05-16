import type { OrdoError, OrdoErrorCode, OrdoStage } from "../core/result.js";

export type OrdoParameterValue = boolean | number | string;

export type OrdoParameterType = "value" | "trigger";

export interface OrdoParameterDefinition {
  readonly name: string;
  readonly type: OrdoParameterType;
  readonly defaultValue: OrdoParameterValue;
}

export type OrdoConditionOperator =
  | "truthy"
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterOrEqual"
  | "lessThan"
  | "lessOrEqual";

export interface OrdoCondition {
  readonly parameter: string;
  readonly operator?: OrdoConditionOperator;
  readonly value?: OrdoParameterValue;
}

export interface OrdoEventCondition {
  readonly event: string;
}

export interface OrdoConditionGroup {
  readonly op: "and" | "or" | "not";
  readonly conditions: readonly OrdoConditionExpression[];
}

export type OrdoConditionExpression =
  | OrdoCondition
  | OrdoEventCondition
  | OrdoConditionGroup;

export interface OrdoTransitionDefinition {
  readonly id?: string;
  readonly to: string;
  readonly conditions?: readonly OrdoCondition[];
  readonly condition?: OrdoConditionExpression;
  readonly duration?: number;
  readonly exitTime?: number;
  readonly priority?: number;
}

export interface OrdoStateDefinition<TPayload = unknown> {
  readonly id: string;
  readonly transitions?: readonly OrdoTransitionDefinition[];
  readonly onEnter?: readonly string[];
  readonly onUpdate?: readonly string[];
  readonly onExit?: readonly string[];
  readonly payload?: TPayload;
}

export type OrdoTransitionPolicy = "interruptible" | "blocking";

export interface OrdoStateLayout {
  readonly x: number;
  readonly y: number;
}

export interface OrdoEditorLayout {
  readonly states?: Readonly<Record<string, OrdoStateLayout>>;
}

export interface OrdoDefinition<TPayload = unknown> {
  readonly initial: string;
  readonly states: readonly OrdoStateDefinition<TPayload>[];
  readonly parameters?: readonly OrdoParameterDefinition[];
  readonly globalTransitions?: readonly OrdoTransitionDefinition[];
  readonly transitionPolicy?: OrdoTransitionPolicy;
  readonly editorLayout?: OrdoEditorLayout;
}

export interface OrdoTransitionRuntime {
  readonly from: string;
  readonly to: string;
  readonly duration: number;
  readonly elapsed: number;
}

export interface OrdoForcedRuntime {
  readonly previousState: string;
  readonly previousElapsed: number;
}

export interface OrdoRuntime {
  readonly state: string;
  readonly elapsed: number;
  readonly parameters: Record<string, OrdoParameterValue>;
  readonly previousState?: string;
  readonly transition?: OrdoTransitionRuntime;
  readonly forced?: OrdoForcedRuntime;
}

export interface OrdoSnapshot<TPayload = unknown> {
  readonly state: string;
  readonly elapsed: number;
  readonly previousState?: string;
  readonly forced?: boolean;
  readonly payload?: TPayload;
  readonly transition?: OrdoTransitionRuntime;
  readonly actions?: readonly string[];
  readonly actionTrace?: readonly OrdoActionTrace[];
}

export interface OrdoStepResult<TPayload = unknown> {
  readonly runtime: OrdoRuntime;
  readonly snapshot: OrdoSnapshot<TPayload>;
  readonly selectedTransition?: OrdoTransitionSelection;
}

export interface OrdoStepOptions {
  readonly consumeTriggers?: boolean;
  readonly events?: readonly string[];
}

export type OrdoActionPhase = "enter" | "update" | "exit";

export interface OrdoActionTrace {
  readonly id: string;
  readonly phase: OrdoActionPhase;
  readonly state: string;
}

export interface OrdoBehaviorDefinition<TPayload = unknown> {
  readonly id: string;
  readonly machine: OrdoDefinition<TPayload>;
  readonly history?: boolean;
  readonly children?: Readonly<Record<string, OrdoBehaviorDefinition<TPayload>>>;
}

export interface OrdoBehaviorRuntime {
  readonly id: string;
  readonly runtime: OrdoRuntime;
  readonly activeChild?: string;
  readonly child?: OrdoBehaviorRuntime;
  readonly history?: Readonly<Record<string, OrdoBehaviorRuntime>>;
}

export interface OrdoBehaviorSnapshot<TPayload = unknown> {
  readonly id: string;
  readonly snapshot: OrdoSnapshot<TPayload>;
  readonly activeChild?: string;
  readonly child?: OrdoBehaviorSnapshot<TPayload>;
}

export interface OrdoBehaviorStepResult<TPayload = unknown> {
  readonly runtime: OrdoBehaviorRuntime;
  readonly snapshot: OrdoBehaviorSnapshot<TPayload>;
}

export interface OrdoValidationReport {
  readonly ok: boolean;
  readonly errors: readonly OrdoError[];
}

export type OrdoTransitionSource = "global" | "state";

export interface OrdoTransitionSelection {
  readonly source: OrdoTransitionSource;
  readonly from: string;
  readonly transition: OrdoTransitionDefinition;
}

export interface OrdoGraphNode<TPayload = unknown> {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly payload?: TPayload;
}

export interface OrdoGraphEdge {
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly source: OrdoTransitionSource;
  readonly duration: number;
  readonly exitTime?: number;
  readonly priority: number;
  readonly conditions: readonly OrdoCondition[];
}

export interface OrdoGraph<TPayload = unknown> {
  readonly initial: string;
  readonly nodes: readonly OrdoGraphNode<TPayload>[];
  readonly edges: readonly OrdoGraphEdge[];
  readonly parameters: readonly OrdoParameterDefinition[];
}

// Policies
export interface OrdoValidationPolicy {
  readonly allowMissingParameters: boolean;
  readonly strictTypeChecking: boolean;
}

export interface OrdoPersistencePolicy {
  readonly prettyPrint: boolean;
  readonly includeEditorLayout: boolean;
}

export interface OrdoPolicy {
  readonly validation: OrdoValidationPolicy;
  readonly transition: OrdoTransitionPolicy;
  readonly persistence: OrdoPersistencePolicy;
  readonly logging?: OrdoLoggingPolicy;
}

export interface OrdoPolicyInput {
  readonly validation?: Partial<OrdoValidationPolicy>;
  readonly transition?: OrdoTransitionPolicy;
  readonly persistence?: Partial<OrdoPersistencePolicy>;
  readonly logging?: OrdoLoggingPolicy;
}

export type OrdoLogLevel = "debug" | "info" | "warn" | "error";

export interface OrdoLogEntry {
  readonly ts: string;
  readonly level: OrdoLogLevel;
  readonly stage: OrdoStage;
  readonly event: string;
  readonly errorCode?: OrdoErrorCode;
  readonly requestId?: string;
  readonly runtimeFingerprint?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly error?: {
    readonly code: OrdoErrorCode;
    readonly message: string;
  };
}

export type OrdoLogSink = (entry: OrdoLogEntry) => void;

export type OrdoLogBaseFields = Partial<
  Pick<OrdoLogEntry, "requestId" | "runtimeFingerprint" | "meta">
>;

export interface OrdoLoggingPolicy {
  readonly sink?: OrdoLogSink;
  readonly minLevel?: OrdoLogLevel;
  readonly baseFields?: () => OrdoLogBaseFields;
  readonly timestamp?: () => string;
}
