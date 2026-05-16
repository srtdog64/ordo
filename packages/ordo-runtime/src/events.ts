export interface OrdoEventQueue {
  readonly events: readonly string[];
}

export function createOrdoEventQueue(events: readonly string[] = []): OrdoEventQueue {
  return { events: [...events] };
}

export function dispatchOrdoEvent(queue: OrdoEventQueue, event: string): OrdoEventQueue {
  return { events: [...queue.events, event] };
}

export function drainOrdoEvents(queue: OrdoEventQueue): {
  readonly events: readonly string[];
  readonly queue: OrdoEventQueue;
} {
  return {
    events: queue.events,
    queue: createOrdoEventQueue()
  };
}
