import { describe, expect, it } from "vitest";
import {
  createOrdoBehaviorRuntime,
  createOrdoRuntime,
  patchOrdoParameters,
  stepOrdo,
  stepOrdoBehavior,
  type OrdoBehaviorDefinition,
  type OrdoBehaviorRuntime,
  type OrdoDefinition,
} from "../src/index";

describe("advanced orchestration features", () => {
  it("supports recursive condition groups and event-driven transitions", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [
        { name: "grounded", type: "value", defaultValue: true },
        { name: "stunned", type: "value", defaultValue: false }
      ],
      states: [
        {
          id: "idle",
          transitions: [
            {
              id: "jump",
              to: "jumping",
              condition: {
                op: "and",
                conditions: [
                  { event: "jump_pressed" },
                  { parameter: "grounded" },
                  {
                    op: "not",
                    conditions: [{ parameter: "stunned" }]
                  }
                ]
              }
            },
            {
              id: "fall",
              to: "falling",
              priority: 1,
              condition: {
                op: "or",
                conditions: [
                  { event: "fall" },
                  { parameter: "grounded", operator: "equals", value: false }
                ]
              }
            }
          ]
        },
        { id: "jumping" },
        { id: "falling" }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const jumped = stepOrdo(definition, created.value, 0.016, undefined, {
      events: ["jump_pressed"]
    });
    expect(jumped.ok).toBe(true);
    if (!jumped.ok) return;
    expect(jumped.value.runtime.state).toBe("jumping");
    expect(jumped.value.selectedTransition?.transition.id).toBe("jump");

    const airborne = patchOrdoParameters(created.value, { grounded: false });
    const fell = stepOrdo(definition, airborne, 0.016);
    expect(fell.ok).toBe(true);
    if (!fell.ok) return;
    expect(fell.value.runtime.state).toBe("falling");
    expect(fell.value.selectedTransition?.transition.id).toBe("fall");
  });

  it("applies definition, state, and caller time-scale multipliers", () => {
    const definition: OrdoDefinition = {
      initial: "slow",
      timeScale: 0.5,
      states: [{ id: "slow", timeScale: 2, onUpdate: ["tick"] }]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stepped = stepOrdo(definition, created.value, 1, undefined, { timeScale: 2 });
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;
    expect(stepped.value.runtime.elapsed).toBe(2);
    expect(stepped.value.snapshot).toMatchObject({
      delta: 2,
      timeScale: 2
    });
  });

  it("records lifecycle action traces with state and phase", () => {
    const definition: OrdoDefinition = {
      initial: "idle",
      parameters: [{ name: "go", type: "value", defaultValue: true }],
      states: [
        {
          id: "idle",
          onExit: ["stop-idle"],
          transitions: [{ to: "run", conditions: [{ parameter: "go" }] }]
        },
        { id: "run", onEnter: ["start-run"] }
      ]
    };
    const created = createOrdoRuntime(definition);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stepped = stepOrdo(definition, created.value, 0.016);
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;
    expect(stepped.value.snapshot.actions).toEqual(["stop-idle", "start-run"]);
    expect(stepped.value.snapshot.actionTrace).toEqual([
      { id: "stop-idle", phase: "exit", state: "idle" },
      { id: "start-run", phase: "enter", state: "run" }
    ]);
  });

  it("restores a child behavior from history when re-entering a parent state", () => {
    const definition = actorBehavior({ history: true });
    let runtime = mustCreateBehavior(definition);

    runtime = {
      ...runtime,
      child: {
        ...runtime.child!,
        runtime: patchOrdoParameters(runtime.child!.runtime, { moving: true })
      }
    };
    runtime = mustStepBehavior(definition, runtime, 0.016).runtime;
    expect(runtime.child?.runtime.state).toBe("walk");

    runtime = {
      ...runtime,
      runtime: patchOrdoParameters(runtime.runtime, { enemyVisible: true })
    };
    runtime = mustStepBehavior(definition, runtime, 0.016).runtime;
    expect(runtime.activeChild).toBe("combat-child");
    expect(runtime.history?.locomotion.runtime.state).toBe("walk");

    runtime = {
      ...runtime,
      runtime: patchOrdoParameters(runtime.runtime, { enemyVisible: false })
    };
    runtime = mustStepBehavior(definition, runtime, 0.016).runtime;
    expect(runtime.activeChild).toBe("locomotion-child");
    expect(runtime.child?.runtime.state).toBe("walk");
  });

  it("steps parallel behavior regions independently", () => {
    const definition: OrdoBehaviorDefinition = {
      id: "actor",
      machine: { initial: "alive", states: [{ id: "alive" }] },
      parallel: {
        locomotion: simpleRegion("moving", "idle", "walk"),
        weapon: simpleRegion("firing", "ready", "fire")
      }
    };
    let runtime = mustCreateBehavior(definition);

    runtime = {
      ...runtime,
      parallel: {
        locomotion: patchBehaviorRuntime(runtime.parallel!.locomotion, { moving: true }),
        weapon: patchBehaviorRuntime(runtime.parallel!.weapon, { firing: true })
      }
    };

    const stepped = mustStepBehavior(definition, runtime, 0.016);
    expect(stepped.runtime.parallel?.locomotion.runtime.state).toBe("walk");
    expect(stepped.runtime.parallel?.weapon.runtime.state).toBe("fire");
    expect(stepped.snapshot.parallel?.locomotion.snapshot.state).toBe("walk");
    expect(stepped.snapshot.parallel?.weapon.snapshot.state).toBe("fire");
  });
});

function actorBehavior(options: { history: boolean }): OrdoBehaviorDefinition {
  return {
    id: "actor",
    history: options.history,
    machine: {
      initial: "locomotion",
      parameters: [{ name: "enemyVisible", type: "value", defaultValue: false }],
      states: [
        {
          id: "locomotion",
          transitions: [{ to: "combat", conditions: [{ parameter: "enemyVisible" }] }]
        },
        {
          id: "combat",
          transitions: [
            { to: "locomotion", conditions: [{ parameter: "enemyVisible", operator: "equals", value: false }] }
          ]
        }
      ]
    },
    children: {
      locomotion: simpleRegion("moving", "idle", "walk", "locomotion-child"),
      combat: simpleRegion("attacking", "aim", "attack", "combat-child")
    }
  };
}

function simpleRegion(
  parameter: string,
  idle: string,
  active: string,
  id = `${parameter}-region`
): OrdoBehaviorDefinition {
  return {
    id,
    machine: {
      initial: idle,
      parameters: [{ name: parameter, type: "value", defaultValue: false }],
      states: [
        {
          id: idle,
          transitions: [{ to: active, conditions: [{ parameter }] }]
        },
        { id: active }
      ]
    }
  };
}

function patchBehaviorRuntime(
  runtime: OrdoBehaviorRuntime,
  parameters: Record<string, boolean>
): OrdoBehaviorRuntime {
  return {
    ...runtime,
    runtime: patchOrdoParameters(runtime.runtime, parameters)
  };
}

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
