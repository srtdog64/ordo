import { describe, expect, it } from "vitest";
import {
  createOrdoBehaviorRuntime,
  deserializeOrdoBehaviorDefinition,
  deserializeOrdoBehaviorRuntime,
  patchOrdoParameters,
  serializeOrdoBehaviorDefinition,
  serializeOrdoBehaviorRuntime,
  setOrdoParameter,
  stepOrdoBehavior,
  type OrdoBehaviorDefinition,
  type OrdoBehaviorRuntime
} from "../src/index";

describe("ordo behavior machine", () => {
  it("composes flat machines into a hierarchical behavior runtime", () => {
    const definition: OrdoBehaviorDefinition<{ clip: string }> = {
      id: "actor",
      machine: {
        initial: "locomotion",
        parameters: [
          { name: "enemyVisible", type: "value", defaultValue: false },
          { name: "enemyLost", type: "trigger", defaultValue: false }
        ],
        states: [
          {
            id: "locomotion",
            payload: { clip: "base-locomotion" },
            transitions: [
              { id: "spot-enemy", to: "combat", conditions: [{ parameter: "enemyVisible" }] }
            ]
          },
          {
            id: "combat",
            payload: { clip: "base-combat" },
            transitions: [
              { id: "lose-enemy", to: "locomotion", conditions: [{ parameter: "enemyLost" }] }
            ]
          }
        ]
      },
      children: {
        locomotion: {
          id: "locomotion-child",
          machine: {
            initial: "idle",
            parameters: [{ name: "moving", type: "value", defaultValue: false }],
            states: [
              {
                id: "idle",
                payload: { clip: "idle" },
                transitions: [{ id: "idle-walk", to: "walk", conditions: [{ parameter: "moving" }] }]
              },
              { id: "walk", payload: { clip: "walk" } }
            ]
          }
        },
        combat: {
          id: "combat-child",
          machine: {
            initial: "aim",
            parameters: [{ name: "fire", type: "trigger", defaultValue: false }],
            states: [
              {
                id: "aim",
                payload: { clip: "aim" },
                transitions: [{ id: "aim-fire", to: "fire", conditions: [{ parameter: "fire" }] }]
              },
              { id: "fire", payload: { clip: "fire" } }
            ]
          }
        }
      }
    };

    let runtime = mustCreateBehavior(definition);
    expect(runtime).toMatchObject({
      id: "actor",
      runtime: { state: "locomotion" },
      activeChild: "locomotion-child",
      child: { runtime: { state: "idle" } }
    });

    runtime = {
      ...runtime,
      runtime: patchOrdoParameters(runtime.runtime, { enemyVisible: true })
    };

    const enteredCombat = mustStepBehavior(definition, runtime, 0.016);
    runtime = enteredCombat.runtime;
    expect(runtime).toMatchObject({
      runtime: { state: "combat" },
      activeChild: "combat-child",
      child: { runtime: { state: "aim", elapsed: 0 } }
    });
    expect(enteredCombat.snapshot.child?.snapshot).toMatchObject({
      state: "aim",
      payload: { clip: "aim" }
    });

    runtime = {
      ...runtime,
      child: {
        ...runtime.child!,
        runtime: setOrdoParameter(runtime.child!.runtime, "fire", true)
      }
    };

    const fired = mustStepBehavior(definition, runtime, 0.016);
    runtime = fired.runtime;
    expect(runtime.child?.runtime).toMatchObject({
      state: "fire",
      parameters: { fire: false }
    });
    expect(fired.snapshot.child?.snapshot).toMatchObject({
      state: "fire",
      payload: { clip: "fire" }
    });

    runtime = {
      ...runtime,
      runtime: patchOrdoParameters(runtime.runtime, { enemyLost: true })
    };

    const returned = mustStepBehavior(definition, runtime, 0.016);
    expect(returned.runtime).toMatchObject({
      runtime: { state: "locomotion" },
      activeChild: "locomotion-child",
      child: { runtime: { state: "idle", elapsed: 0 } }
    });
  });

  it("serializes behavior definitions and behavior runtimes as save boundaries", () => {
    const definition: OrdoBehaviorDefinition = {
      id: "root",
      machine: {
        initial: "active",
        states: [{ id: "active" }],
        editorLayout: { states: { active: { x: 10, y: 20 } } }
      },
      children: {
        active: {
          id: "child",
          machine: {
            initial: "idle",
            states: [{ id: "idle" }]
          }
        }
      }
    };

    const json = serializeOrdoBehaviorDefinition(definition);
    expect(json).not.toContain("editorLayout");

    const restoredDefinition = deserializeOrdoBehaviorDefinition(json);
    expect(restoredDefinition.ok).toBe(true);
    if (!restoredDefinition.ok) return;
    expect(restoredDefinition.value.children?.active.machine.initial).toBe("idle");

    const runtime = mustCreateBehavior(definition);
    const runtimeJson = serializeOrdoBehaviorRuntime(runtime);
    const restoredRuntime = deserializeOrdoBehaviorRuntime(runtimeJson);
    expect(restoredRuntime.ok).toBe(true);
    if (!restoredRuntime.ok) return;
    expect(restoredRuntime.value).toMatchObject({
      id: "root",
      runtime: { state: "active" },
      activeChild: "child",
      child: { runtime: { state: "idle" } }
    });
  });
});

function mustCreateBehavior<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>
): OrdoBehaviorRuntime {
  const created = createOrdoBehaviorRuntime(definition);
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.value;
}

function mustStepBehavior<TPayload>(
  definition: OrdoBehaviorDefinition<TPayload>,
  runtime: OrdoBehaviorRuntime,
  deltaSeconds: number
) {
  const stepped = stepOrdoBehavior(definition, runtime, deltaSeconds);
  expect(stepped.ok).toBe(true);
  if (!stepped.ok) {
    throw new Error(stepped.error.message);
  }
  return stepped.value;
}
