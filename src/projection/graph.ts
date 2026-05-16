import { getOrdoTransitionParameterConditions } from "../machine/transition.js";
import type { OrdoDefinition, OrdoGraph, OrdoGraphEdge, OrdoGraphNode } from "../definition/types.js";

export function createOrdoGraph<TPayload>(
  definition: OrdoDefinition<TPayload>
): OrdoGraph<TPayload> {
  const nodes: OrdoGraphNode<TPayload>[] = definition.states.map((state, index) => {
    const layout = definition.editorLayout?.states?.[state.id];

    return {
      id: state.id,
      x: layout?.x ?? 64 + (index % 4) * 148,
      y: layout?.y ?? 56 + Math.floor(index / 4) * 92,
      ...(state.payload !== undefined ? { payload: state.payload } : {})
    };
  });

  const stateEdges: OrdoGraphEdge[] = definition.states.flatMap((state) =>
    (state.transitions ?? []).map((transition) => ({
      ...(transition.id ? { id: transition.id } : {}),
      from: state.id,
      to: transition.to,
      source: "state" as const,
      duration: transition.duration ?? 0,
      ...(transition.exitTime !== undefined ? { exitTime: transition.exitTime } : {}),
      priority: transition.priority ?? 0,
      conditions: getOrdoTransitionParameterConditions(transition)
    }))
  );

  const globalEdges: OrdoGraphEdge[] = (definition.globalTransitions ?? []).map((transition) => ({
    ...(transition.id ? { id: transition.id } : {}),
    from: "$global",
    to: transition.to,
    source: "global",
    duration: transition.duration ?? 0,
    ...(transition.exitTime !== undefined ? { exitTime: transition.exitTime } : {}),
    priority: transition.priority ?? 0,
    conditions: getOrdoTransitionParameterConditions(transition)
  }));

  return {
    initial: definition.initial,
    nodes,
    edges: [...globalEdges, ...stateEdges],
    parameters: definition.parameters ?? []
  };
}
