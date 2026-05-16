import {
  patchOrdoParameters,
  stepOrdo,
  type OrdoDefinition,
  type OrdoPolicyInput,
  type OrdoRuntime,
  type OrdoStepResult
} from "@exornea/ordo";
import { scaleOrdoDelta } from "./clock.js";
import type { OrdoFrameInput } from "./frame.js";

export interface OrdoRuntimeTickResult<TPayload = unknown> {
  readonly runtime: OrdoRuntime;
  readonly step: OrdoStepResult<TPayload>;
  readonly frame: {
    readonly deltaSeconds: number;
    readonly events: readonly string[];
  };
}

export function tickOrdoRuntime<TPayload>(
  definition: OrdoDefinition<TPayload>,
  runtime: OrdoRuntime,
  frame: OrdoFrameInput,
  policyInput?: OrdoPolicyInput
) {
  const patchedRuntime =
    frame.parameterPatch && Object.keys(frame.parameterPatch).length > 0
      ? patchOrdoParameters(runtime, frame.parameterPatch)
      : runtime;
  const deltaSeconds = scaleOrdoDelta({
    deltaSeconds: frame.deltaSeconds,
    ...(frame.timeScale !== undefined ? { scale: frame.timeScale } : {}),
    ...(frame.paused !== undefined ? { paused: frame.paused } : {})
  });
  const stepped = stepOrdo(definition, patchedRuntime, deltaSeconds, policyInput, {
    events: frame.events ?? []
  });

  if (!stepped.ok) {
    return stepped;
  }

  return {
    ok: true as const,
    value: {
      runtime: stepped.value.runtime,
      step: stepped.value,
      frame: {
        deltaSeconds,
        events: frame.events ?? []
      }
    } satisfies OrdoRuntimeTickResult<TPayload>
  };
}
