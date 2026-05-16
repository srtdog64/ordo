import { describe, expect, it } from "vitest";
import {
  deserializeOrdoBehaviorDefinition,
  deserializeOrdoBehaviorRuntime,
  deserializeOrdoDefinition,
  deserializeOrdoRuntime,
  serializeOrdoBehaviorDefinition,
  serializeOrdoBehaviorRuntime,
  serializeOrdoDefinition,
  serializeOrdoRuntime,
  type OrdoBehaviorDefinition,
  type OrdoDefinition,
  type OrdoRuntime
} from "../src/index";

describe("persistence error codes", () => {
  it("reports invalid JSON for definitions", () => {
    const result = deserializeOrdoDefinition("{not json");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "VALIDATION_INVALID_FORMAT",
      stage: "ParseRequest"
    });
    expect(result.error.cause).toBeInstanceOf(SyntaxError);
  });

  it("reports invalid JSON for runtimes", () => {
    const result = deserializeOrdoRuntime("##");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_INVALID_FORMAT");
    expect(result.error.stage).toBe("ParseRequest");
  });

  it("reports invalid JSON for behavior definitions", () => {
    const result = deserializeOrdoBehaviorDefinition("oops");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_INVALID_FORMAT");
  });

  it("reports invalid JSON for behavior runtimes", () => {
    const result = deserializeOrdoBehaviorRuntime("[");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_INVALID_FORMAT");
  });

  it("propagates validation failures from deserialized definitions", () => {
    const broken = JSON.stringify({
      initial: "ghost",
      states: [{ id: "idle" }]
    });

    const result = deserializeOrdoDefinition(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STATE_MISSING");
  });

  it("propagates child validation failures from behavior definitions", () => {
    const definition: OrdoBehaviorDefinition = {
      id: "root",
      machine: {
        initial: "idle",
        states: [{ id: "idle" }]
      },
      children: {
        idle: {
          id: "child",
          machine: {
            initial: "ghost",
            states: [{ id: "alive" }]
          }
        }
      }
    };

    const json = serializeOrdoBehaviorDefinition(definition, {
      persistence: { includeEditorLayout: false, prettyPrint: false }
    });
    const restored = deserializeOrdoBehaviorDefinition(json);

    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.error.code).toBe("STATE_MISSING");
  });

  it("round-trips a flat definition without editor layout", () => {
    const definition: OrdoDefinition<{ clip: string }> = {
      initial: "idle",
      parameters: [{ name: "moving", type: "value", defaultValue: false }],
      states: [
        { id: "idle", payload: { clip: "idle" }, transitions: [{ to: "walk", conditions: [{ parameter: "moving" }] }] },
        { id: "walk", payload: { clip: "walk" } }
      ],
      editorLayout: { states: { idle: { x: 1, y: 2 } } }
    };

    const json = serializeOrdoDefinition(definition);
    expect(json).not.toContain("editorLayout");

    const restored = deserializeOrdoDefinition<{ clip: string }>(json);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.editorLayout).toBeUndefined();
    expect(restored.value.initial).toBe("idle");
    expect(restored.value.states.map((s) => s.id)).toEqual(["idle", "walk"]);
  });

  it("round-trips a flat runtime", () => {
    const runtime: OrdoRuntime = {
      state: "walk",
      elapsed: 0.2,
      parameters: { moving: true },
      previousState: "idle"
    };

    const json = serializeOrdoRuntime(runtime);
    const restored = deserializeOrdoRuntime(json);

    expect(restored).toEqual({ ok: true, value: runtime });
  });

  it("round-trips a behavior runtime", () => {
    const json = serializeOrdoBehaviorRuntime({
      id: "actor",
      runtime: { state: "idle", elapsed: 0, parameters: {} }
    });
    const restored = deserializeOrdoBehaviorRuntime(json);

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.id).toBe("actor");
    expect(restored.value.runtime.state).toBe("idle");
  });
});
