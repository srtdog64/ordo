# Persistence Boundaries

Ordo persistence is intentionally narrow: it serializes declarative definitions
and immutable runtime cursors. It does not own files, databases, save slots,
Unity lifecycle hooks, browser storage, or host object registries.

## Save Point Inventory

| Save point | API | Authoritative? | Use case |
| --- | --- | --- | --- |
| Flat machine definition | `serializeOrdoDefinition`, `deserializeOrdoDefinition` | Yes | Store editor-authored FSM data or ship static workflow definitions. |
| Hierarchical behavior definition | `serializeOrdoBehaviorDefinition`, `deserializeOrdoBehaviorDefinition` | Yes | Store parent/child HBM composition. |
| Flat runtime cursor | `serializeOrdoRuntime`, `deserializeOrdoRuntime` | Yes | Save active state, elapsed time, parameters, transition blend cursor, and forced overlay metadata. |
| Hierarchical behavior runtime | `serializeOrdoBehaviorRuntime`, `deserializeOrdoBehaviorRuntime` | Yes | Save active parent state plus active child behavior cursor. |
| Editor graph projection | `createOrdoGraph` then host JSON serialization | Derived | Cache UI layout/projection when useful, but rebuild from definition when in doubt. |
| Step snapshot | Host JSON serialization if needed | No | Frame/event witness for UI, logs, replays, or debugging. Do not restore runtime from snapshots. |

## Host-Owned Save Shell

The LAST C# save system uses an object id plus a dictionary of component payloads.
The same shape works for Ordo, but the shell remains outside the package:

```ts
const saveSlot = {
  id: actorId,
  ordoDefinition: serializeOrdoBehaviorDefinition(actorDefinition),
  ordoRuntime: serializeOrdoBehaviorRuntime(actorRuntime),
  host: {
    position,
    health,
    inventory
  }
};
```

On load, the host restores its own payloads, deserializes the Ordo runtime, and
then resumes stepping with `stepOrdo` or `stepOrdoBehavior`.

## Runtime Restore Rules

| Field | Restore rule |
| --- | --- |
| `state` | Must exist in the matching definition. Validate the definition before trusting old saves. |
| `elapsed` | Restore exactly; callers may clamp or migrate old saves before deserialization. |
| `parameters` | Restore as host-authored runtime values. Trigger lifetime is whatever was saved. |
| `transition` | Restore to continue blend/blocking windows across save/load. |
| `forced` | Restore to keep forced overlays active across save/load. |
| `activeChild` and `child` | Restore together for HBM. If the parent state changes during migration, recreate the child runtime. |

## Migration Guidance

1. Version the host save envelope outside Ordo.
2. Keep stable state IDs and parameter names; migrations should rewrite saves
   before calling Ordo deserializers.
3. Treat action IDs as adapter commands. Never store function references,
   Unity object references, or DOM objects in Ordo definitions.
4. Prefer JSON persistence for portability. Binary storage can wrap the JSON
   string, but Ordo should not know about that transport.
5. Use `consumeTriggers: false` during multi-substep restore/replay loops when
   the host owns frame-level trigger lifetime.
