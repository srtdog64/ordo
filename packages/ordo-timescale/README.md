# @exornea/ordo-timescale

Small host-side time-scale helpers for `@exornea/ordo`.

Ordo core accepts explicit delta seconds and stays host-agnostic. This package
keeps pause, slow motion, and speed-up policy outside the state machine runtime
while still giving callers a shared helper.

```ts
import { stepOrdo } from "@exornea/ordo";
import { scaleOrdoDelta } from "@exornea/ordo-timescale";

const delta = scaleOrdoDelta({ deltaSeconds: frameDelta, scale: 0.5 });
const stepped = stepOrdo(definition, runtime, delta);
```

The helper clamps negative deltas and negative scales to zero. Use `minDelta`
or `maxDelta` when replay or editor stepping needs fixed bounds.
