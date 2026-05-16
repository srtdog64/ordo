import type { OrdoCondition, OrdoParameterValue } from "../definition/types.js";

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
