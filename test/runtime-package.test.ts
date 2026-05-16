import { describe, expect, it } from "vitest";
import {
  createOrdoRuntime,
  type OrdoActionTrace,
  type OrdoDefinition
} from "../src/index";
import {
  createOrdoClock,
  createOrdoEventQueue,
  dispatchOrdoActions,
  dispatchOrdoEvent,
  drainOrdoEvents,
  createOrdoFrame,
  scaleOrdoDelta,
  tickOrdoRuntime
} from "../packages/ordo-runtime/src/index";

describe("ordo-runtime package", () => {
  it("scales host deltas without touching Ordo runtime semantics", () => {
    expect(scaleOrdoDelta({ deltaSeconds: 1, scale: 0.25 })).toBe(0.25);
    expect(scaleOrdoDelta({ deltaSeconds: 1, paused: true })).toBe(0);
    expect(scaleOrdoDelta({ deltaSeconds: -1, scale: 2 })).toBe(0);
    expect(scaleOrdoDelta({ deltaSeconds: Number.NaN, scale: 2 })).toBe(0);
    expect(scaleOrdoDelta({ deltaSeconds: 1, scale: Number.POSITIVE_INFINITY })).toBe(1);
    expect(scaleOrdoDelta({ deltaSeconds: 10, maxDelta: 0.25 })).toBe(0.25);

    const slow = createOrdoClock(0.5);
    expect(slow(2)).toBe(1);
    expect(slow(2, 2)).toBe(4);
  });

  it("queues and drains transient events", () => {
    const queued = dispatchOrdoEvent(
      dispatchOrdoEvent(createOrdoEventQueue(), "jump_pressed"),
      "fire_pressed"
    );
    const drained = drainOrdoEvents(queued);

    expect(drained.events).toEqual(["jump_pressed", "fire_pressed"]);
    expect(drained.queue.events).toEqual([]);
  });

  it("dispatches action traces to host handlers", () => {
    const handled: string[] = [];
    const trace: OrdoActionTrace[] = [
      { id: "start-run", phase: "enter", state: "run" },
      { id: "missing", phase: "exit", state: "idle" }
    ];
    const result = dispatchOrdoActions(trace, {
      "start-run": (action) => handled.push(`${action.phase}:${action.state}`)
    });

    expect(handled).toEqual(["enter:run"]);
    expect(result.handled.map((action) => action.id)).toEqual(["start-run"]);
    expect(result.missing.map((action) => action.id)).toEqual(["missing"]);
  });

  it("ticks Ordo with frame events, parameter patches, and time scale", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "grounded", type: "value", defaultValue: true }],
      states: [
        {
          id: "idle",
          transitions: [
            {
              to: "jumping",
              condition: {
                op: "and",
                conditions: [{ event: "jump_pressed" }, { parameter: "grounded" }]
              }
            }
          ]
        },
        { id: "jumping", onEnter: ["start-jump"] }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const ticked = tickOrdoRuntime(
      definition,
      created.value,
      createOrdoFrame({
        deltaSeconds: 1,
        timeScale: 0.5,
        events: ["jump_pressed"],
        parameterPatch: { grounded: true }
      })
    );

    expect(ticked.ok).toBe(true);
    if (!ticked.ok) return;
    expect(ticked.value.runtime.state).toBe("jumping");
    expect(ticked.value.frame.deltaSeconds).toBe(0.5);
    expect(ticked.value.step.snapshot.actionTrace).toEqual([
      { id: "start-jump", phase: "enter", state: "jumping" }
    ]);
  });
});
