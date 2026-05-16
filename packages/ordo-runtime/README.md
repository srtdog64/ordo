# @exornea/ordo-runtime

Host-agnostic runtime layer for `@exornea/ordo`.

Ordo core is a pure state-machine kernel: callers pass explicit delta seconds,
events, and parameter values. This package owns the small orchestration layer
around that kernel:

- clock and time-scale calculation
- transient event queues
- frame envelopes
- lifecycle action dispatch
- one-step runtime ticking

```ts
import { tickOrdoRuntime } from "@exornea/ordo-runtime";

const result = tickOrdoRuntime(definition, runtime, {
  deltaSeconds: frameDelta,
  timeScale: 0.5,
  events: ["jump_pressed"],
  parameterPatch: { grounded: true }
});
```

The package does not know about Unity, React, Three.js, DOM APIs, files, save
slots, or animation mixers. Hosts map `snapshot.actionTrace` to their own
commands with `dispatchOrdoActions`.
