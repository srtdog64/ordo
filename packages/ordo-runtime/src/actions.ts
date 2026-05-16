import type { OrdoActionTrace } from "@exornea/ordo";

export type OrdoActionHandler = (action: OrdoActionTrace) => void;

export type OrdoActionHandlers = Readonly<Record<string, OrdoActionHandler>>;

export interface OrdoActionDispatchResult {
  readonly handled: readonly OrdoActionTrace[];
  readonly missing: readonly OrdoActionTrace[];
}

export function dispatchOrdoActions(
  actionTrace: readonly OrdoActionTrace[] | undefined,
  handlers: OrdoActionHandlers
): OrdoActionDispatchResult {
  const handled: OrdoActionTrace[] = [];
  const missing: OrdoActionTrace[] = [];

  for (const action of actionTrace ?? []) {
    const handler = handlers[action.id];
    if (!handler) {
      missing.push(action);
      continue;
    }

    handler(action);
    handled.push(action);
  }

  return { handled, missing };
}
