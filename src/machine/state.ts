import type { OrdoRuntime } from "../definition/types.js";

export function getOrdoActiveStateId(runtime: OrdoRuntime): string {
  return runtime.state;
}
