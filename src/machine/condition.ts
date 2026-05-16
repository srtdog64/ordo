import type {
  OrdoCondition,
  OrdoConditionExpression,
  OrdoEventCondition,
  OrdoParameterValue
} from "../definition/types.js";

export interface OrdoConditionContext {
  readonly parameters: Readonly<Record<string, OrdoParameterValue>>;
  readonly events: ReadonlySet<string>;
}

export function evaluateOrdoCondition(
  condition: OrdoCondition,
  actual: OrdoParameterValue | undefined
): boolean {
  const operator = condition.operator ?? "truthy";
  if (operator === "truthy") return Boolean(actual);
  if (operator === "equals") return actual === condition.value;
  if (operator === "notEquals") return actual !== condition.value;

  if (typeof actual !== "number" || typeof condition.value !== "number") return false;
  if (operator === "greaterThan") return actual > condition.value;
  if (operator === "greaterOrEqual") return actual >= condition.value;
  if (operator === "lessThan") return actual < condition.value;
  if (operator === "lessOrEqual") return actual <= condition.value;
  return false;
}

export function evaluateOrdoConditionExpression(
  expression: OrdoConditionExpression,
  context: OrdoConditionContext
): boolean {
  if (isOrdoEventCondition(expression)) {
    return context.events.has(expression.event);
  }

  if (isOrdoConditionGroup(expression)) {
    if (expression.op === "and") {
      return expression.conditions.every((condition) =>
        evaluateOrdoConditionExpression(condition, context)
      );
    }
    if (expression.op === "or") {
      return expression.conditions.some((condition) =>
        evaluateOrdoConditionExpression(condition, context)
      );
    }
    return expression.conditions.length === 1
      ? !evaluateOrdoConditionExpression(expression.conditions[0]!, context)
      : false;
  }

  return evaluateOrdoCondition(expression, context.parameters[expression.parameter]);
}

export function isOrdoEventCondition(
  condition: OrdoConditionExpression
): condition is OrdoEventCondition {
  return "event" in condition;
}

export function isOrdoConditionGroup(
  condition: OrdoConditionExpression
): condition is Extract<OrdoConditionExpression, { readonly op: string }> {
  return "op" in condition;
}

export function collectOrdoParameterConditions(
  expression: OrdoConditionExpression | undefined
): readonly OrdoCondition[] {
  if (!expression) return [];
  if (isOrdoEventCondition(expression)) return [];
  if (isOrdoConditionGroup(expression)) {
    return expression.conditions.flatMap((condition) =>
      collectOrdoParameterConditions(condition)
    );
  }
  return [expression];
}
