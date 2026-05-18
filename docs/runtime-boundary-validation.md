# Runtime Boundary Validation

Ordo's compile-time union types (`OrdoConditionExpression`, `OrdoParameterValue`,
`OrdoTransitionDefinition`, ...) describe a closed shape. Real input — JSON from
disk, packets from a network sensor, host-mutated parameter records — arrives as
`unknown`. This document defines where Ordo trusts data, where the host must
prove it, and how the kernel preserves a data-oriented hot path while extending
discriminated-union safety into runtime.

## Position

> Ordo validates the *meaning* of a definition once at the cold path. The hot
> path (`stepOrdo`, `stepOrdoBehavior`, `selectOrdoTransition`) assumes a
> well-formed graph and performs zero reflection, zero structural probing, and
> zero `instanceof` checks.

That position is non-negotiable for edge or per-frame call sites. Adding generic
structural validation inside `stepOrdo` would push 1k–10k object visits per
frame onto every host, defeating the data-oriented design.

## Trust Boundary Map

| Boundary | API surface | Source of `unknown` | Ordo's check | Host's check |
| --- | --- | --- | --- | --- |
| Deserialized definition | `deserializeOrdoDefinition`, `deserializeOrdoBehaviorDefinition` | JSON string, IPC, save slot, asset bundle | `JSON.parse` exception → `VALIDATION_INVALID_FORMAT`, then semantic checks via `validateOrdoDefinition` | Must guarantee the input is `OrdoDefinition`-shaped JSON; Ordo does not run a schema validator on parsed nodes |
| Deserialized runtime cursor | `deserializeOrdoRuntime`, `deserializeOrdoBehaviorRuntime` | Save slot, replay log | `JSON.parse` exception → `VALIDATION_INVALID_FORMAT` only | Must guarantee shape, must re-validate against the active definition before stepping |
| Parameter writes | `setOrdoParameter`, `patchOrdoParameters` | Host event handler, UI control, network packet | TypeScript signature constrains to `OrdoParameterValue` | Must coerce sensor values to `boolean \| number \| string` before calling Ordo |
| Step delta | `stepOrdo(_, _, deltaSeconds, _, _)` | Host scheduler clock | `Number.isFinite` guard, clamps to `Math.max(0, delta)` | Must keep the clock monotonic; Ordo will not detect time travel beyond clamping |
| Step events | `stepOrdo(_, _, _, _, { events })` | Host input dispatcher, network packet | Coerced to `ReadonlySet<string>`; non-string values become set members verbatim | Must enforce the event vocabulary; misspelled events silently miss `OrdoEventCondition` |
| Forced state | `forceOrdoState(runtime, state)` | Host command (e.g. "stagger") | None — state ID is treated as opaque | Must guarantee the ID exists in the active definition |
| Definition author input | `OrdoDefinition` literal in source | Editor tooling, code generator, MCP tool | `inspectOrdoDefinition` accumulates every semantic error | Should run `inspectOrdoDefinition` in CI; do not ship definitions that emit any report errors |
| Payload field | `OrdoStateDefinition<TPayload>.payload`, snapshot `payload` | Host-typed `TPayload` | Treated as `unknown`; only forwarded into snapshots | Must validate `TPayload` if the source is untrusted |

## Validation Surface Inventory

| Check | Where | Cost | Stage |
| --- | --- | --- | --- |
| Duplicate state IDs | `inspectOrdoDefinition` | O(states) once | `ValidateInput` |
| Duplicate parameter names | `inspectOrdoDefinition` | O(parameters) once | `ValidateInput` |
| Trigger parameter must default to boolean | `inspectOrdoDefinition` | O(parameters) once | `ValidateInput` |
| Initial state exists | `inspectOrdoDefinition` | O(1) lookup | `ValidateInput` |
| Each transition target exists | `inspectOrdoDefinition` | O(transitions) once | `ValidateInput` |
| Condition parameter exists (when `allowMissingParameters` is `false`) | `inspectOrdoDefinition` → `validateConditions` | O(conditions) once | `ValidateInput` |
| Condition value matches parameter type (when `strictTypeChecking` is `true`) | `inspectOrdoDefinition` → `validateConditionType` | O(conditions) once | `ValidateInput` |
| Condition group structure (`not` arity, recursive descent) | `inspectOrdoDefinition` → `validateConditions` | O(condition-tree) once | `ValidateInput` |
| JSON parse | `deserialize*` family | O(bytes) once | `ParseRequest` |
| Active runtime state exists | `findOrdoState` inside `stepOrdo` Layer 1 | O(1) Map lookup | `StateMachineStep` |
| Step delta is finite and non-negative | `prepareStepContext` | O(1) | `StateMachineStep` |
| Transition target reachable mid-step | `findOrdoState` inside `resolveStepMode` | O(1) Map lookup | `StateMachineStep` |

The only checks that run on the hot path are O(1) Map lookups against the
cached state index ([state-index.ts](../src/machine/state-index.ts)) and a
single `Number.isFinite` on the delta. Everything else lives in the
`ValidateInput` or `ParseRequest` stage.

## What Ordo Refuses to Validate

These are intentional omissions, not bugs. Adding them would either duplicate
work the host already does or push reflection into the hot path.

| Omission | Reason |
| --- | --- |
| Structural shape of `JSON.parse` output | Ordo trusts the host's transport contract. Hosts with untrusted sources should run a schema validator (zod, valibot, ajv) on the parsed value before calling `deserializeOrdoDefinition`. |
| `TPayload` shape | Ordo is payload-generic. The host knows what payload it stores and is responsible for guarding it. |
| Parameter value coercion at write time | `setOrdoParameter` accepts `OrdoParameterValue`; runtime coercion is the host adapter's job. A sensor that emits `Float32Array` indices must convert before calling Ordo. |
| Event vocabulary | `stepOrdo({ events })` accepts any string. Ordo will not warn on unknown events because the same machine may legitimately ignore an event for one state and consume it for another. |
| Action ID resolution | `onEnter` / `onUpdate` / `onExit` / `actionTrace` carry strings, not callable references. Whether `"play-sound"` resolves to a host adapter is outside Ordo. |
| Forced state existence | `forceOrdoState` is intentionally raw so that the host can pre-commit a state ID before swapping to a new definition. The first `stepOrdo` call after a bad force will surface `STATE_MISSING`. |
| History runtime structural compatibility | When `OrdoBehaviorDefinition.history` is on, a cached child runtime is reused verbatim. If the host migrates definitions between saves, it must clear `runtime.history` before stepping. |

## Hot-Path Discipline (DOP)

Three rules keep `stepOrdo` allocation-light and branch-predictable.

1. **Index, do not scan.** State lookup goes through a `WeakMap`-cached
   `ReadonlyMap<string, OrdoStateDefinition>` keyed on the definition object
   identity. Re-creating the same definition object invalidates the cache; do
   not deep-clone definitions between frames.
2. **Discriminate, do not reflect.** `OrdoConditionExpression` uses
   `"parameter" in c` / `"op" in c` / `"event" in c` checks. There is no
   `instanceof`, no `constructor.name`, no schema visit. Adding a new variant
   means adding a new discriminator key and an explicit branch — never a
   generic "if it looks like an object" probe.
3. **Validate at the seam, freeze in flight.** Every runtime field is
   `readonly`. Once `createOrdoRuntime` or `deserializeOrdoRuntime` returns
   `ok`, the value is treated as an invariant by the hot path. Mutation
   happens via `patchOrdoParameters` (which returns a new runtime), never via
   in-place edits.

## Host Strategies for Extending Type Safety to Runtime

Ordo ships no schema validator. The host picks an external one based on
trust level.

| Host scenario | Recommended layering |
| --- | --- |
| In-process editor with typed authoring tools | TypeScript types alone are sufficient; rely on `inspectOrdoDefinition` to catch logical errors before save. |
| Save load from local disk written by the same app version | `deserializeOrdoDefinition` + `inspectOrdoDefinition`. Validate runtime cursor's `state` against the new definition before stepping. |
| Save load that may cross schema versions | Run host-owned migration (rename states, drop removed parameters) **before** calling `deserializeOrdoDefinition`. Migration is not Ordo's responsibility (see [persistence-boundaries.md](persistence-boundaries.md)). |
| Definition pulled from an untrusted network source | Run a structural schema validator (zod/valibot/ajv) on the parsed object, then hand the resulting typed value to `validateOrdoDefinition`. Two stages: shape, then meaning. |
| Sensor packets driving parameters | Adapter pre-coerces to `boolean \| number \| string`, drops out-of-range floats, and only then calls `setOrdoParameter`. Ordo will not silently coerce `NaN` for you. |
| Multi-tenant orchestration with per-tenant policies | Inject `policy.logging.baseFields` with `requestId` / `runtimeFingerprint`, and pre-resolve `OrdoPolicy` per tenant. Do not branch on tenant identity inside the hot path. |

### Sample structural guard (host-owned)

```ts
// host-owned. Ordo does not provide this.
import { z } from "zod";

const conditionSchema: z.ZodType<OrdoConditionExpression> = z.lazy(() =>
  z.union([
    z.object({ parameter: z.string(), operator: z.string().optional(), value: z.any().optional() }),
    z.object({ event: z.string() }),
    z.object({ op: z.enum(["and", "or", "not"]), conditions: z.array(conditionSchema) })
  ])
);

const definitionSchema = z.object({
  initial: z.string(),
  states: z.array(z.object({ id: z.string(), /* ... */ })).min(1),
  parameters: z.array(z.object({ name: z.string(), type: z.enum(["value", "trigger"]), defaultValue: z.any() })).optional(),
  globalTransitions: z.array(z.any()).optional(),
  transitionPolicy: z.enum(["interruptible", "blocking"]).optional()
});

export function loadUntrustedDefinition(json: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    return { ok: false, error: "INVALID_JSON", cause } as const;
  }

  const shape = definitionSchema.safeParse(raw);
  if (!shape.success) {
    return { ok: false, error: "INVALID_SHAPE", issues: shape.error.issues } as const;
  }

  return deserializeOrdoDefinition(JSON.stringify(shape.data));
}
```

The schema is the host's compile-time-to-runtime bridge. Ordo never sees
`unknown`; it sees a `JSON.stringify`'d, already-shape-checked value, then
runs semantic validation on top.

## Anti-Patterns

| Anti-pattern | Why it breaks |
| --- | --- |
| Calling `validateOrdoDefinition` inside a `stepOrdo` loop | Pushes O(states + parameters + conditions) onto every frame. Validate once at load, then trust the readonly invariants. |
| Mutating `OrdoRuntime.parameters` in place | `consumeOrdoTriggers` and `patchOrdoParameters` rely on referential equality to detect change. In-place edits make `TriggerConsumed` events disappear. |
| Re-issuing `forceOrdoState` to "refresh" without releasing | The previous-state pair is captured once; repeated forces stack the elapsed clock but do not nest. Use `releaseOrdoForcedState` first. |
| Storing a host class instance under `payload` | Ordo treats `payload` as opaque data, but persistence will JSON-serialize it. Methods and prototype identity are lost. Keep payloads structural. |
| Using `events` as long-lived parameter substitutes | Events are single-step and consumed on selection. State a `trigger` parameter when the signal must survive a `consumeTriggers: false` substep loop. |
| Inferring structural validity from `OrdoResult.ok === true` | A successful step proves the definition was well-formed; it does not prove the parsed JSON had the right shape upstream. The shape check is the host's responsibility. |

## Decision Quick Reference

| Question | Answer |
| --- | --- |
| Where does shape validation live? | Outside Ordo, before `deserialize*`. |
| Where does semantic validation live? | `inspectOrdoDefinition` / `validateOrdoDefinition`, once per definition load. |
| Where does runtime-state validation live? | `findOrdoState` inside `prepareStepContext` and `resolveStepMode`; surfaces `STATE_MISSING`. |
| Where does parameter coercion live? | In the host adapter that calls `setOrdoParameter` / `patchOrdoParameters`. |
| Can the hot path ever throw? | No. Every failure is a `Result` carrying `OrdoError`. JSON parsing is wrapped in `safeAsync`-style try/catch at the I/O seam. |
| What is the cost of strict type checking? | Off the hot path entirely (`policy.validation.strictTypeChecking`). Run it during definition authoring and CI; disable only if you have a faster external validator covering the same surface. |
