# LAST FSM Mapping

This note records how the Unity/C# FSM in `E:\LAST` maps into Ordo.
It is a design witness, not a porting script.

## Source Witnesses

| LAST file | Role | Ordo equivalent |
| --- | --- | --- |
| `Assets/FSMSystem/Runtime/BaseStateMachine.cs` | MonoBehaviour runtime cursor with `currentState`, forced state, previous state, and per-frame `Execute()` | `OrdoRuntime`, `forceOrdoState`, `releaseOrdoForcedState`, `stepOrdo` |
| `Assets/FSMSystem/Runtime/State.cs` | ScriptableObject state with actions, optional probability, and transition list | `OrdoStateDefinition`, `onEnter`, `onUpdate`, `onExit`, `transitions`, `payload` |
| `Assets/FSMSystem/Runtime/Transition.cs` | Decision-driven true/false transition with `RemainInState` sentinel | `OrdoTransitionDefinition.conditions`; remain is represented by no eligible transition or a self-targeting transition |
| `Assets/FSMSystem/Runtime/FSMGraph/FSMGraph.cs` | xNode graph asset and initial node lookup | `OrdoDefinition.initial` plus `createOrdoGraph` for editor projection |
| `Assets/FSMSystem/Runtime/FSMGraph/StateNode.cs` | Visual state node with actions and outgoing transition nodes | `OrdoGraphNode` plus `OrdoGraphEdge` |
| `Assets/FSMSystem/Runtime/FSMGraph/CompositeTransitionNode.cs` | Multi-decision transition branch | `OrdoTransitionDefinition.condition` with recursive `and`, `or`, and `not`, or multiple prioritized transitions |
| `Assets/FSMSystem/Runtime/FSMGraph/ForcedStateNode.cs` | Forced action state that blocks normal state execution | `OrdoRuntime.forced` and forced-state helpers |
| `Assets/SaveSystem/Scripts/Runtime/SaveData.cs` | Save dictionary and file boundary | Host-owned storage using Ordo serialization helpers |
| `Assets/SaveSystem/Scripts/Runtime/SaveController.cs` | Stable object id and per-component save payload collection | Host-owned registry keyed by entity/tool id |

## What Carries Over

| LAST concept | Ordo storage shape | Notes |
| --- | --- | --- |
| ScriptableObject FSM asset | `serializeOrdoDefinition` | Stores declarative states, parameters, global transitions, actions as string IDs, and optional editor layout when policy allows it. |
| xNode graph asset | `createOrdoGraph` result | Ordo does not store editor nodes as runtime authority; graph projection is derived from the definition. |
| Current state cursor | `serializeOrdoRuntime` | Stores active state, elapsed time, parameters, previous state, active transition, and forced metadata. |
| Forced state state/previous pair | `OrdoRuntime.forced` | Directly maps from LAST's `forcedState` and `previousState` fields. |
| Parent plus child behavior machines | `serializeOrdoBehaviorDefinition` and `serializeOrdoBehaviorRuntime` | HBM composition, including optional child history. |
| Save event channel | Host call site | Ordo stays pure; the host decides when to call serialize/deserialize. |

## What Does Not Carry Over

| LAST concept | Why Ordo does not store it |
| --- | --- |
| `MonoBehaviour` component cache | Host/runtime optimization; not part of deterministic state. |
| `FSMAction` and `Decision` object instances | Ordo stores action IDs and declarative conditions, not executable Unity objects. |
| `BinaryFormatter` file persistence | Host concern and not portable to TypeScript runtimes. Ordo emits JSON strings instead. |
| Unity lifecycle hooks such as `Awake`, `Update`, `OnApplicationQuit` | Host scheduler/lifecycle should own these call sites. |
| Random action probability execution | Keep random selection in a host action adapter or encode deterministic choices as parameters before stepping. |

## Porting Rules

1. Convert each C# `State` or `StateNode` into an `OrdoStateDefinition`.
2. Convert each `Decision` into a declared parameter and a transition condition.
3. Convert `RemainInState` into no transition, or into a self-targeting transition when the editor needs an explicit edge.
4. Convert action object references into stable action IDs in `onEnter`, `onUpdate`, or `onExit`.
5. Store editor positions in `editorLayout.states`.
6. Use `forceOrdoState` for LAST-style forced overlays.
7. Use `OrdoBehaviorDefinition.children` when a parent state should activate a child machine.
8. Use `history: true` when re-entering a parent state should restore the previous child cursor.
9. Store definitions and runtimes through Ordo JSON helpers; file paths, save slots, and entity IDs remain host-owned.
