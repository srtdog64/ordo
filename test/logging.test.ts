import { describe, expect, it } from "vitest";
import {
  createOrdoBehaviorRuntime,
  createOrdoRuntime,
  setOrdoParameter,
  stepOrdo,
  stepOrdoBehavior,
  type OrdoBehaviorDefinition,
  type OrdoDefinition,
  type OrdoLogEntry
} from "../src/index";

function collector() {
  const entries: OrdoLogEntry[] = [];
  return { entries, sink: (entry: OrdoLogEntry) => entries.push(entry) };
}

function movementDefinition(): OrdoDefinition<{ clip: string }> {
  return {
    initial: "idle",
    parameters: [{ name: "moving", type: "value", defaultValue: false }],
    states: [
      {
        id: "idle",
        payload: { clip: "idle" },
        transitions: [{ to: "walk", duration: 0.12, conditions: [{ parameter: "moving" }] }]
      },
      {
        id: "walk",
        payload: { clip: "walk" },
        transitions: [{ to: "idle", duration: 0.1, conditions: [{ parameter: "moving", operator: "equals", value: false }] }]
      }
    ]
  };
}

describe("logging", () => {
  it("emits StateTransition at info level when a transition fires", () => {
    const { entries, sink } = collector();
    const definition = movementDefinition();
    const created = createOrdoRuntime(definition, { logging: { sink } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const moving = setOrdoParameter(created.value, "moving", true);
    stepOrdo(definition, moving, 0.016, { logging: { sink } });

    const transition = entries.find((e) => e.event === "StateTransition");
    expect(transition).toMatchObject({
      level: "info",
      stage: "StateMachineStep",
      meta: { from: "idle", to: "walk", source: "state" }
    });
  });

  it("filters debug events under the default minLevel", () => {
    const { entries, sink } = collector();
    const definition = movementDefinition();
    const created = createOrdoRuntime(definition, { logging: { sink } });
    if (!created.ok) return;

    stepOrdo(definition, created.value, 0.016, { logging: { sink } });

    expect(entries.every((e) => e.level !== "debug")).toBe(true);
  });

  it("emits debug events when minLevel is lowered", () => {
    const { entries, sink } = collector();
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "fire", type: "trigger", defaultValue: false }],
      states: [
        { id: "idle", transitions: [{ to: "active", conditions: [{ parameter: "fire" }] }] },
        { id: "active" }
      ]
    };
    const created = createOrdoRuntime(definition, { logging: { sink, minLevel: "debug" } });
    if (!created.ok) return;

    const fired = setOrdoParameter(created.value, "fire", true);
    stepOrdo(definition, fired, 0.016, { logging: { sink, minLevel: "debug" } });

    expect(entries.some((e) => e.event === "TriggerConsumed" && e.level === "debug")).toBe(true);
  });

  it("merges baseFields into every emitted entry", () => {
    const { entries, sink } = collector();
    const definition = movementDefinition();
    const policy = {
      logging: {
        sink,
        baseFields: () => ({ requestId: "req-1", meta: { tenant: "acme" } })
      }
    };
    const created = createOrdoRuntime(definition, policy);
    if (!created.ok) return;

    const moving = setOrdoParameter(created.value, "moving", true);
    stepOrdo(definition, moving, 0.016, policy);

    for (const entry of entries) {
      expect(entry.requestId).toBe("req-1");
      expect(entry.meta).toMatchObject({ tenant: "acme" });
    }
  });

  it("uses injected timestamps and exposes validation error codes", () => {
    const { entries, sink } = collector();
    const result = createOrdoRuntime(
      { initial: "missing", states: [{ id: "idle" }] },
      { logging: { sink, timestamp: () => "2026-05-17T00:00:00.000Z" } }
    );

    expect(result.ok).toBe(false);
    expect(entries[0]).toMatchObject({
      ts: "2026-05-17T00:00:00.000Z",
      level: "error",
      stage: "ValidateInput",
      event: "RuntimeCreation_Failed",
      errorCode: "STATE_MISSING",
      error: { code: "STATE_MISSING" }
    });
  });

  it("emits BehaviorChild_Activated when a parent state has a child machine", () => {
    const { entries, sink } = collector();
    const definition: OrdoBehaviorDefinition = {
      id: "actor",
      machine: {
        initial: "idle",
        states: [{ id: "idle" }]
      },
      children: {
        idle: {
          id: "locomotion",
          machine: {
            initial: "stand",
            states: [{ id: "stand" }]
          }
        }
      }
    };

    const created = createOrdoBehaviorRuntime(definition, { logging: { sink } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const activations = entries.filter((e) => e.event === "BehaviorChild_Activated");
    expect(activations.length).toBeGreaterThan(0);
    expect(activations[0]).toMatchObject({
      level: "info",
      meta: { parent: "actor", state: "idle", child: "locomotion" }
    });

    stepOrdoBehavior(definition, created.value, 0.016, { logging: { sink, minLevel: "debug" } });
    expect(entries.some((e) => e.event === "BehaviorChild_Stepped")).toBe(true);
  });
});
