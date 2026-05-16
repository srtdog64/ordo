import { describe, expect, it } from "vitest";
import {
  createOrdoRuntime,
  forceOrdoState,
  patchOrdoParameters,
  releaseOrdoForcedState,
  setOrdoParameter,
  stepOrdo,
  type OrdoDefinition,
  type OrdoRuntime
} from "../src/index";

describe("ordo fsm scenarios", () => {
  it("scenario 1: enemy patrol, chase, attack, recover, and global defeat", () => {
    const definition: OrdoDefinition<{ clip: string }> = {
      initial: "patrol",
      parameters: [
        { name: "targetVisible", type: "value", defaultValue: false },
        { name: "inMeleeRange", type: "value", defaultValue: false },
        { name: "attackComplete", type: "trigger", defaultValue: false },
        { name: "defeated", type: "trigger", defaultValue: false }
      ],
      globalTransitions: [
        { id: "any-defeated", to: "defeated", priority: 100, conditions: [{ parameter: "defeated" }] }
      ],
      states: [
        {
          id: "patrol",
          payload: { clip: "walk" },
          onUpdate: ["patrol-route"],
          transitions: [
            { id: "spot-target", to: "chase", priority: 1, conditions: [{ parameter: "targetVisible" }] }
          ]
        },
        {
          id: "chase",
          payload: { clip: "run" },
          onEnter: ["acquire-target"],
          onUpdate: ["move-to-target"],
          transitions: [
            {
              id: "enter-melee",
              to: "attack",
              priority: 5,
              conditions: [{ parameter: "inMeleeRange" }]
            },
            {
              id: "lost-target",
              to: "patrol",
              priority: 1,
              conditions: [{ parameter: "targetVisible", operator: "equals", value: false }]
            }
          ]
        },
        {
          id: "attack",
          payload: { clip: "slash" },
          onEnter: ["start-attack"],
          onExit: ["finish-attack"],
          transitions: [
            {
              id: "attack-recover",
              to: "recover",
              exitTime: 0.45,
              conditions: [{ parameter: "attackComplete" }]
            }
          ]
        },
        {
          id: "recover",
          payload: { clip: "recover" },
          transitions: [{ id: "recover-chase", to: "chase", exitTime: 0.25 }]
        },
        { id: "defeated", payload: { clip: "death" }, onEnter: ["drop-loot"] }
      ]
    };

    let runtime = mustCreate(definition);

    runtime = mustStep(definition, patchOrdoParameters(runtime, { targetVisible: true }), 0.016).runtime;
    expect(runtime.state).toBe("chase");

    runtime = mustStep(definition, patchOrdoParameters(runtime, { inMeleeRange: true }), 0.016).runtime;
    expect(runtime.state).toBe("attack");

    runtime = mustStep(definition, setOrdoParameter(runtime, "attackComplete", true), 0.2).runtime;
    expect(runtime.state).toBe("attack");
    expect(runtime.parameters.attackComplete).toBe(true);

    const recovered = mustStep(definition, runtime, 0.25);
    runtime = recovered.runtime;
    expect(runtime.state).toBe("recover");
    expect(runtime.parameters.attackComplete).toBe(false);
    expect(recovered.snapshot.actions).toEqual(["finish-attack"]);

    runtime = mustStep(definition, runtime, 0.25).runtime;
    expect(runtime.state).toBe("chase");

    const defeated = mustStep(definition, setOrdoParameter(runtime, "defeated", true), 0.016);
    expect(defeated.runtime.state).toBe("defeated");
    expect(defeated.selectedTransition).toMatchObject({ source: "global", transition: { id: "any-defeated" } });
    expect(defeated.snapshot.actions).toEqual(["drop-loot"]);
  });

  it("scenario 2: blocking combo animation waits for blend and exit windows", () => {
    const definition: OrdoDefinition<{ clip: string }> = {
      initial: "idle",
      transitionPolicy: "blocking",
      parameters: [
        { name: "attackPressed", type: "trigger", defaultValue: false },
        { name: "chainPressed", type: "trigger", defaultValue: false }
      ],
      states: [
        {
          id: "idle",
          payload: { clip: "idle" },
          transitions: [
            {
              id: "idle-windup",
              to: "windup",
              duration: 0.1,
              conditions: [{ parameter: "attackPressed" }]
            }
          ]
        },
        {
          id: "windup",
          payload: { clip: "windup" },
          transitions: [{ id: "windup-strike", to: "strike", exitTime: 0.2 }]
        },
        {
          id: "strike",
          payload: { clip: "strike" },
          transitions: [
            {
              id: "strike-chain",
              to: "chain",
              priority: 5,
              exitTime: 0.15,
              duration: 0.08,
              conditions: [{ parameter: "chainPressed" }]
            },
            { id: "strike-recover", to: "recover", priority: 1, exitTime: 0.35 }
          ]
        },
        {
          id: "chain",
          payload: { clip: "chain" },
          transitions: [{ id: "chain-recover", to: "recover", exitTime: 0.3 }]
        },
        { id: "recover", payload: { clip: "recover" } }
      ]
    };

    let runtime = mustCreate(definition);

    runtime = mustStep(definition, setOrdoParameter(runtime, "attackPressed", true), 0.016).runtime;
    expect(runtime).toMatchObject({
      state: "windup",
      transition: { from: "idle", to: "windup", elapsed: 0 }
    });
    expect(runtime.parameters.attackPressed).toBe(false);

    runtime = mustStep(definition, runtime, 0.05).runtime;
    expect(runtime.state).toBe("windup");
    expect(runtime.transition).toMatchObject({ elapsed: 0.05 });

    runtime = mustStep(definition, runtime, 0.15).runtime;
    expect(runtime.state).toBe("strike");

    runtime = mustStep(definition, setOrdoParameter(runtime, "chainPressed", true), 0.1).runtime;
    expect(runtime.state).toBe("strike");
    expect(runtime.parameters.chainPressed).toBe(true);

    runtime = mustStep(definition, runtime, 0.05).runtime;
    expect(runtime.state).toBe("chain");
    expect(runtime.parameters.chainPressed).toBe(false);
    expect(runtime.transition).toMatchObject({ from: "strike", to: "chain", duration: 0.08 });

    runtime = mustStep(definition, runtime, 0.08).runtime;
    expect(runtime.state).toBe("chain");
    expect(runtime.transition).toBeUndefined();

    runtime = mustStep(definition, runtime, 0.22).runtime;
    expect(runtime.state).toBe("recover");
  });

  it("scenario 3: forced knockback overlays normal AI and restores the previous cursor", () => {
    const definition: OrdoDefinition<{ clip: string }> = {
      initial: "chase",
      parameters: [
        { name: "targetVisible", type: "value", defaultValue: true },
        { name: "inMeleeRange", type: "value", defaultValue: false }
      ],
      states: [
        {
          id: "chase",
          payload: { clip: "run" },
          onUpdate: ["move-to-target"],
          transitions: [
            { id: "chase-attack", to: "attack", priority: 3, conditions: [{ parameter: "inMeleeRange" }] },
            {
              id: "chase-search",
              to: "search",
              priority: 1,
              conditions: [{ parameter: "targetVisible", operator: "equals", value: false }]
            }
          ]
        },
        { id: "attack", payload: { clip: "attack" }, onEnter: ["start-attack"] },
        { id: "search", payload: { clip: "search" } },
        { id: "knockback", payload: { clip: "hit" }, onUpdate: ["slide-back", "emit-hit-sparks"] }
      ]
    };

    let runtime = mustCreate(definition);
    runtime = mustStep(definition, runtime, 0.4).runtime;
    expect(runtime).toMatchObject({ state: "chase", elapsed: 0.4 });

    runtime = forceOrdoState(runtime, "knockback");
    const forced = mustStep(definition, patchOrdoParameters(runtime, {
      inMeleeRange: true,
      targetVisible: false
    }), 0.2);

    expect(forced.runtime).toMatchObject({
      state: "knockback",
      elapsed: 0.2,
      forced: { previousState: "chase", previousElapsed: 0.4 }
    });
    expect(forced.snapshot.actions).toEqual(["slide-back", "emit-hit-sparks"]);

    runtime = releaseOrdoForcedState(forced.runtime);
    expect(runtime).toMatchObject({ state: "chase", elapsed: 0.4, previousState: "knockback" });

    runtime = mustStep(definition, patchOrdoParameters(runtime, {
      targetVisible: true,
      inMeleeRange: true
    }), 0.016).runtime;
    expect(runtime.state).toBe("attack");
    expect(runtime.previousState).toBe("chase");
  });
});

function mustCreate<TPayload>(definition: OrdoDefinition<TPayload>): OrdoRuntime {
  const created = createOrdoRuntime(definition);
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.value;
}

function mustStep<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  deltaSeconds: number
) {
  const stepped = stepOrdo(definition, runtime, deltaSeconds);
  expect(stepped.ok).toBe(true);
  if (!stepped.ok) {
    throw new Error(stepped.error.message);
  }
  return stepped.value;
}
