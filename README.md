# @exornea/ordo

Composable state orchestration kernel for tools, workflows, and animation
controllers.

This package is intentionally independent from Geukbit. Geukbit should consume
it through adapters instead of hiding it inside the engine monorepo.

## Position

`@exornea/ordo` owns:

- declarative state orchestration definitions
- hierarchical behavior machine composition
- immutable runtime cursors
- pure stepping
- transition condition evaluation
- forced state cursors
- transition priority selection
- graph projection for editor surfaces
- Result-first validation failures

It does not own:

- rendering
- animation mixer objects
- editor React state
- game-specific commands
- task scheduling

## Shape

```ts
const definition = {
  initial: "idle",
  parameters: [{ name: "moving", type: "value", defaultValue: false }],
  states: [
    {
      id: "idle",
      payload: { clip: "idle" },
      onUpdate: ["sample-idle"],
      transitions: [
        {
          id: "idle-to-walk",
          to: "walk",
          duration: 0.12,
          priority: 1,
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
```

The `payload` field lets consumers compose domain-specific meaning onto a
generic orchestration definition. Geukbit animation can use `{ clip, loop,
speed }`. An editor tool can use `{ mode }`. A workflow can use `{ phase }`.

## Modules

The package keeps the public facade in `ordo.ts`, but the implementation is
split by ownership boundary:

- `core/`: Result values, policy resolution, transition policy lookup, and
  structured logging sink
- `definition/`: public types, definition validation, and condition type checks
- `behavior/`: hierarchical behavior machine creation, stepping, and snapshots
- `machine/`: condition evaluation, active state helpers, indexed state lookup,
  trigger consumption, transition selection, and active transition advancement
- `runtime/`: runtime creation, stepping, parameter patching, forced state
  enter/release, and snapshot projection
- `projection/`: typed editor graph projection
- `persistence/`: definition/runtime serialization

Additional load-bearing notes live in `docs/`:

- `docs/last-fsm-mapping.md`: mapping from the LAST Unity/C# FSM and save
  system into Ordo concepts
- `docs/persistence-boundaries.md`: authoritative save points and host-owned
  persistence shell

## Policy

Ordo accepts partial policy overrides and merges them with conservative
defaults.

- `validation.allowMissingParameters`: when `false`, every transition condition
  must reference a declared parameter.
- `validation.strictTypeChecking`: when `true`, condition operators must match
  the declared parameter default value type.
- `transition`: selects the default transition policy unless the definition
  specifies `transitionPolicy`.
- `persistence`: controls pretty JSON and whether editor layout is serialized.
- `logging.sink`: receives structured runtime events without making Ordo depend
  on a host console.

Use `validateOrdoDefinition` when callers want the first blocking error as a
Result. Use `inspectOrdoDefinition` when editor surfaces need the full
validation report.

## Runtime Cursor

Runtime values are immutable. `stepOrdo` returns a new cursor and a snapshot.
The cursor tracks the active state, elapsed time, parameters, previous state,
optional active transition, and optional forced-state metadata.

```ts
const forced = forceOrdoState(runtime, "knockback");
const stepped = stepOrdo(definition, forced, 0.016);
const restored = releaseOrdoForcedState(stepped.value.runtime);
```

Trigger parameters are consumed by default only when they participate in the
selected transition. Hosts that split one visual frame into multiple simulation
steps can own trigger lifetime explicitly:

```ts
const substep = stepOrdo(definition, runtime, 1 / 120, undefined, {
  consumeTriggers: false
});
```

When `consumeTriggers` is `false`, Ordo leaves trigger reset policy to the host.
Clear those trigger parameters with `setOrdoParameter` or `patchOrdoParameters`
at the frame boundary.

Definitions are treated as immutable runtime inputs. Ordo builds and caches a
state ID index per definition object so state lookup does not depend on a
linear scan during stepping or snapshot projection.

## Hierarchical Behavior Machines

Ordo keeps each `OrdoDefinition` flat, then composes flat machines through an
`OrdoBehaviorDefinition`. A parent state can own one child behavior. When the
parent changes state, Ordo activates the child attached to the new state and
creates a fresh child runtime. When the parent remains in the same state, the
active child behavior steps with the same delta.

```ts
const actor = {
  id: "actor",
  machine: baseMachine,
  children: {
    locomotion: locomotionBehavior,
    combat: combatBehavior
  }
};

const created = createOrdoBehaviorRuntime(actor);
const stepped = stepOrdoBehavior(actor, created.value, 0.016);
```

This is intentionally HBM composition rather than nested state syntax inside
`OrdoStateDefinition`. The flat FSM runtime remains inspectable, while complex
actors, tools, and workflows can layer parent/child behavior without mixing
rendering, editor state, or domain command adapters into Ordo.

## Persistence

Ordo can serialize flat definitions, behavior definitions, flat runtimes, and
behavior runtimes. The host still owns save slots, file paths, entity IDs, and
domain payloads.

```ts
const definitionJson = serializeOrdoBehaviorDefinition(actor);
const runtimeJson = serializeOrdoBehaviorRuntime(runtime);
const restored = deserializeOrdoBehaviorRuntime(runtimeJson);
```

For the full save boundary table, see `docs/persistence-boundaries.md`.

## Scenario Witnesses

The test suite includes state-machine and behavior-machine scenario witnesses:

- enemy AI: patrol, chase, attack, recover, and global defeat
- combo animation: blocking blend windows, exit times, trigger retention, and
  chain priority
- forced overlay: knockback state blocks normal AI, then restores the previous
  cursor before continuing
- behavior hierarchy: parent actor states swap locomotion/combat child machines
  while active child states step independently

## Geukbit Integration Direction

Geukbit should adapt:

```txt
AnimatorController JSON
  -> @exornea/ordo definition with animation payloads
  -> @exornea/ordo runtime cursor
  -> Animator playback snapshot
  -> Three.js/WebGPU adapter
```

This keeps the Ordo library reusable and keeps Geukbit as the composition engine.
