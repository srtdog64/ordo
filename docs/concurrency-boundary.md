# Concurrency Boundary

Ordo is safe to use in concurrent hosts because its core APIs are pure data-in,
data-out operations. It does not own a threading model.

## Ownership

| Concern | Owner | Rationale |
| --- | --- | --- |
| State machine stepping | Ordo core | `stepOrdo` and `stepOrdoBehavior` return new runtime cursors instead of mutating shared state. |
| Worker creation and pools | Host | Web Workers, Node worker threads, Unity jobs, and native schedulers have incompatible lifecycle and transfer rules. |
| Locks, Atomics, and shared memory | Host | Ordo does not require shared mutable memory. Hosts can add it around Ordo if their platform needs it. |
| Frame/event ordering | Host | Input ordering is domain-specific. Ordo consumes only the frame data it is given. |
| Committing a stepped runtime | Host | Parallel simulations may produce multiple candidate runtimes; the host decides which result becomes authoritative. |

## Contract

- Treat `OrdoDefinition` and `OrdoBehaviorDefinition` as read-only data.
- Treat `OrdoRuntime` and `OrdoBehaviorRuntime` as immutable cursors.
- Send definitions, runtimes, frame deltas, parameter patches, and events across
  worker boundaries as host-owned messages.
- Keep event queues and trigger lifetime owned by the frame scheduler.
- Do not share and mutate one runtime object between workers.
- Do not infer global ordering from Ordo. Ordering belongs to the host scheduler.

This means the same runtime can be stepped speculatively in multiple workers,
but each result is a separate candidate. Ordo will not merge concurrent results.

## Host Pattern

```ts
// host-owned message shape. Ordo does not provide the worker implementation.
type StepJob = {
  definition: OrdoDefinition;
  runtime: OrdoRuntime;
  frame: {
    deltaSeconds: number;
    events: readonly string[];
  };
};

function runJob(job: StepJob) {
  return stepOrdo(job.definition, job.runtime, job.frame.deltaSeconds, undefined, {
    events: job.frame.events
  });
}
```

The host can run this function on the main thread, in a browser worker, in a
Node worker thread, or behind another scheduler. Ordo's behavior is the same as
long as the host sends the same inputs.

## Non-Goals

Ordo will not provide:

- a worker pool
- a job queue
- thread affinity rules
- shared-memory runtime storage
- lock or transaction APIs
- cross-worker merge semantics

Those features belong in host adapters or application code, where the execution
model and conflict policy are known.
