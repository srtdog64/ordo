import { describe, expect, it } from "vitest";
import {
  createOrdoGraph,
  createOrdoRuntime,
  evaluateOrdoCondition,
  forceOrdoState,
  inspectOrdoDefinition,
  releaseOrdoForcedState,
  setOrdoParameter,
  serializeOrdoDefinition,
  stepOrdo,
  validateOrdoDefinition,
  type OrdoDefinition
} from "../src/index";

describe("ordo", () => {
  it("creates runtime state from a definition", () => {
    const runtime = createOrdoRuntime(movementDefinition());

    expect(runtime).toEqual({
      ok: true,
      value: {
        state: "idle",
        elapsed: 0,
        parameters: { moving: false }
      }
    });
  });

  it("steps transitions through immutable runtime values", () => {
    const definition = movementDefinition();
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const moving = setOrdoParameter(created.value, "moving", true);
    const stepped = stepOrdo(definition, moving, 0.016);

    expect(stepped.ok).toBe(true);
    if (!stepped.ok) {
      return;
    }

    expect(stepped.value.runtime.state).toBe("walk");
    expect(stepped.value.snapshot).toMatchObject({
      state: "walk",
      payload: { clip: "walk" },
      transition: {
        from: "idle",
        to: "walk",
        duration: 0.12
      }
    });
    expect(created.value.state).toBe("idle");
  });

  it("respects exit time and numeric conditions", () => {
    const definition: OrdoDefinition = {
      initial: "attack",
      parameters: [{ name: "speed", type: "value", defaultValue: 1 }],
      states: [
        {
          id: "attack",
          transitions: [
            {
              to: "idle",
              exitTime: 0.3,
              conditions: [{ parameter: "speed", operator: "greaterOrEqual", value: 1 }]
            }
          ]
        },
        { id: "idle" }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const beforeExit = stepOrdo(definition, created.value, 0.2);
    expect(beforeExit.ok && (beforeExit as any).value.runtime.state).toBe("attack");

    if (!beforeExit.ok) {
      return;
    }

    const afterExit = stepOrdo(definition, beforeExit.value.runtime, 0.1);
    expect(afterExit.ok && (afterExit as any).value.runtime.state).toBe("idle");
  });

  it("selects the highest priority eligible transition", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "alert", type: "value", defaultValue: true }],
      states: [
        {
          id: "idle",
          transitions: [
            { id: "low", to: "walk", priority: 1, conditions: [{ parameter: "alert" }] },
            { id: "high", to: "attack", priority: 10, conditions: [{ parameter: "alert" }] }
          ]
        },
        { id: "walk" },
        { id: "attack" }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stepped = stepOrdo(definition, created.value, 0.016);
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;

    expect(stepped.value.runtime.state).toBe("attack");
    expect(stepped.value.selectedTransition).toMatchObject({
      source: "state",
      transition: { id: "high" }
    });
  });

  it("supports forced state cursors and explicit release", () => {
    const definition: OrdoDefinition<{ clip: string }> = {
      ...movementDefinition(),
      states: [
        ...movementDefinition().states,
        { id: "knockback", payload: { clip: "knockback" }, onUpdate: ["apply-knockback"] }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const forced = forceOrdoState(created.value, "knockback");
    const stepped = stepOrdo(definition, forced, 0.2);
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;

    expect(stepped.value.runtime).toMatchObject({
      state: "knockback",
      previousState: "idle",
      elapsed: 0.2,
      forced: { previousState: "idle" }
    });
    expect(stepped.value.snapshot).toMatchObject({
      state: "knockback",
      forced: true,
      actions: ["apply-knockback"]
    });

    const released = releaseOrdoForcedState(stepped.value.runtime);
    expect(released).toMatchObject({
      state: "idle",
      previousState: "knockback"
    });
  });

  it("blocks new transitions under blocking policy", () => {
    const definition: OrdoDefinition = {
      ...movementDefinition(),
      transitionPolicy: "blocking"
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const moving = setOrdoParameter(created.value, "moving", true);
    const entered = stepOrdo(definition, moving, 0.016);
    expect(entered.ok).toBe(true);

    if (!entered.ok) {
      return;
    }

    const stopped = setOrdoParameter(entered.value.runtime, "moving", false);
    const blocked = stepOrdo(definition, stopped, 0.016);

    expect(blocked.ok).toBe(true);
    if (!blocked.ok) {
      return;
    }

    expect(blocked.value.runtime.state).toBe("walk");
    expect(blocked.value.runtime.transition).toMatchObject({ from: "idle", to: "walk" });
  });

  it("can leave trigger consumption to a frame-level owner", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "fire", type: "trigger", defaultValue: false }],
      states: [
        {
          id: "idle",
          transitions: [{ id: "fire-active", to: "active", conditions: [{ parameter: "fire" }] }]
        },
        { id: "active" }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const fired = setOrdoParameter(created.value, "fire", true);
    const stepped = stepOrdo(definition, fired, 0.016, undefined, { consumeTriggers: false });
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;

    expect(stepped.value.runtime).toMatchObject({
      state: "active",
      parameters: { fire: true }
    });

    const defaultConsumed = stepOrdo(definition, fired, 0.016);
    expect(defaultConsumed.ok).toBe(true);
    if (!defaultConsumed.ok) return;
    expect(defaultConsumed.value.runtime.parameters.fire).toBe(false);
  });

  it("validates missing states as Result errors", () => {
    const result = validateOrdoDefinition({
      initial: "idle",
      states: [
        {
          id: "idle",
          transitions: [{ to: "missing" }]
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "STATE_MISSING",
        details: { to: "missing" }
      });
    }
  });

  it("inspects definitions with an accumulated validation report", () => {
    const report = inspectOrdoDefinition({
      initial: "missing-initial",
      parameters: [
        { name: "speed", type: "value", defaultValue: 1 },
        { name: "speed", type: "value", defaultValue: 2 }
      ],
      states: [
        {
          id: "idle",
          transitions: [
            { to: "missing-target", conditions: [{ parameter: "unknown" }] },
            { to: "idle", conditions: [{ parameter: "speed", operator: "equals", value: "fast" }] }
          ]
        },
        { id: "idle" }
      ]
    });

    expect(report.ok).toBe(false);
    expect(report.errors.map((error) => error.code)).toEqual([
      "STATE_DUPLICATE",
      "PARAMETER_DUPLICATE",
      "STATE_MISSING",
      "STATE_MISSING",
      "PARAMETER_MISSING",
      "PARAMETER_TYPE_MISMATCH"
    ]);
  });

  it("applies validation policy for missing condition parameters", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      states: [
        {
          id: "idle",
          transitions: [{ to: "walk", conditions: [{ parameter: "moving" }] }]
        },
        { id: "walk" }
      ]
    };

    const strict = validateOrdoDefinition(definition);
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.error.code).toBe("PARAMETER_MISSING");
    }

    const permissive = validateOrdoDefinition(definition, {
      validation: { allowMissingParameters: true }
    });
    expect(permissive).toEqual({ ok: true, value: undefined });
  });

  it("applies strict type checking for condition values", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "moving", type: "value", defaultValue: false }],
      states: [
        {
          id: "idle",
          transitions: [
            {
              to: "walk",
              conditions: [{ parameter: "moving", operator: "greaterThan", value: 0 }]
            }
          ]
        },
        { id: "walk" }
      ]
    };

    const strict = validateOrdoDefinition(definition);
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.error.code).toBe("PARAMETER_TYPE_MISMATCH");
    }

    const loose = validateOrdoDefinition(definition, {
      validation: { strictTypeChecking: false }
    });
    expect(loose).toEqual({ ok: true, value: undefined });
  });

  it("projects a graph for editor surfaces", () => {
    const graph = createOrdoGraph({
      ...movementDefinition(),
      editorLayout: {
        states: {
          idle: { x: 10, y: 20 }
        }
      }
    });

    expect(graph.nodes).toEqual([
      { id: "idle", x: 10, y: 20, payload: { clip: "idle" } },
      { id: "walk", x: 212, y: 56, payload: { clip: "walk" } }
    ]);
    expect(graph.edges).toEqual([
      {
        from: "idle",
        to: "walk",
        source: "state",
        duration: 0.12,
        priority: 0,
        conditions: [{ parameter: "moving" }]
      },
      {
        from: "walk",
        to: "idle",
        source: "state",
        duration: 0.1,
        priority: 0,
        conditions: [{ parameter: "moving", operator: "equals", value: false }]
      }
    ]);
  });

  it("projects global transitions as graph edges", () => {
    const graph = createOrdoGraph({
      ...movementDefinition(),
      globalTransitions: [{ id: "cancel", to: "idle", priority: 100 }]
    });

    expect(graph.edges[0]).toEqual({
      id: "cancel",
      from: "$global",
      to: "idle",
      source: "global",
      duration: 0,
      priority: 100,
      conditions: []
    });
  });

  it("uses persistence policy for editor layout serialization", () => {
    const definition = {
      ...movementDefinition(),
      editorLayout: { states: { idle: { x: 10, y: 20 } } }
    };

    expect(serializeOrdoDefinition(definition)).not.toContain("editorLayout");
    expect(
      serializeOrdoDefinition(definition, {
        persistence: { includeEditorLayout: true, prettyPrint: false }
      })
    ).toContain("editorLayout");
  });

  it("evaluates conditions directly", () => {
    expect(evaluateOrdoCondition({ parameter: "moving" }, true)).toBe(true);
    expect(evaluateOrdoCondition({ parameter: "speed", operator: "lessThan", value: 1 }, 2)).toBe(false);
  });
});

function movementDefinition(): OrdoDefinition<{ clip: string }> {
  return {
    initial: "idle",
    parameters: [{ name: "moving", type: "value", defaultValue: false }],
    states: [
      {
        id: "idle",
        payload: { clip: "idle" },
        transitions: [
          {
            to: "walk",
            duration: 0.12,
            conditions: [{ parameter: "moving" }]
          }
        ]
      },
      {
        id: "walk",
        payload: { clip: "walk" },
        transitions: [
          {
            to: "idle",
            duration: 0.1,
            conditions: [{ parameter: "moving", operator: "equals", value: false }]
          }
        ]
      }
    ]
  };
}
