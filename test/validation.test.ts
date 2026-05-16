import { describe, expect, it } from "vitest";
import { inspectOrdoDefinition, validateOrdoDefinition, type OrdoDefinition } from "../src/index";

describe("validation error codes", () => {
  it("flags duplicate state ids", () => {
    const result = validateOrdoDefinition({
      initial: "idle",
      states: [
        { id: "idle" },
        { id: "idle" }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "STATE_DUPLICATE",
      stage: "ValidateInput",
      details: { id: "idle" }
    });
  });

  it("flags duplicate parameter names", () => {
    const result = validateOrdoDefinition({
      initial: "idle",
      parameters: [
        { name: "speed", type: "value", defaultValue: 1 },
        { name: "speed", type: "value", defaultValue: 2 }
      ],
      states: [{ id: "idle" }]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "PARAMETER_DUPLICATE",
      details: { name: "speed" }
    });
  });

  it("flags trigger parameters with non-boolean defaults", () => {
    const result = validateOrdoDefinition({
      initial: "idle",
      parameters: [{ name: "fire", type: "trigger", defaultValue: 1 }],
      states: [{ id: "idle" }]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "PARAMETER_TYPE_MISMATCH",
      details: { name: "fire", expected: "boolean", actual: "number" }
    });
  });

  it("flags condition operators that omit a required value", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "speed", type: "value", defaultValue: 1 }],
      states: [
        {
          id: "idle",
          transitions: [{ to: "run", conditions: [{ parameter: "speed", operator: "equals" }] }]
        },
        { id: "run" }
      ]
    };

    const result = validateOrdoDefinition(definition);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "CONDITION_VALUE_MISSING",
      details: { parameter: "speed", operator: "equals" }
    });
  });

  it("flags missing initial state targets", () => {
    const result = validateOrdoDefinition({
      initial: "ghost",
      states: [{ id: "idle" }]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "STATE_MISSING",
      details: { id: "ghost" }
    });
  });

  it("flags global transitions to unknown states", () => {
    const result = validateOrdoDefinition({
      initial: "idle",
      states: [{ id: "idle" }],
      globalTransitions: [{ to: "ghost" }]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "STATE_MISSING",
      details: { to: "ghost" }
    });
  });

  it("validates conditions on global transitions", () => {
    const report = inspectOrdoDefinition({
      initial: "idle",
      parameters: [{ name: "alert", type: "value", defaultValue: true }],
      states: [{ id: "idle" }],
      globalTransitions: [
        { to: "idle", conditions: [{ parameter: "missing" }] }
      ]
    });

    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.code)).toContain("PARAMETER_MISSING");
  });

  it("returns ok with no errors when the definition is valid", () => {
    const report = inspectOrdoDefinition({
      initial: "idle",
      states: [{ id: "idle" }]
    });

    expect(report).toEqual({ ok: true, errors: [] });
  });
});
