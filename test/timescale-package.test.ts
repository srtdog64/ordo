import { describe, expect, it } from "vitest";
import { createOrdoTimeScaler, scaleOrdoDelta } from "../packages/ordo-timescale/src/index";

describe("ordo-timescale", () => {
  it("scales host deltas without touching Ordo runtime semantics", () => {
    expect(scaleOrdoDelta({ deltaSeconds: 1, scale: 0.25 })).toBe(0.25);
    expect(scaleOrdoDelta({ deltaSeconds: 1, paused: true })).toBe(0);
    expect(scaleOrdoDelta({ deltaSeconds: -1, scale: 2 })).toBe(0);
  });

  it("supports reusable default time scalers", () => {
    const slow = createOrdoTimeScaler(0.5);

    expect(slow(2)).toBe(1);
    expect(slow(2, 2)).toBe(4);
  });

  it("clamps scaled deltas", () => {
    expect(scaleOrdoDelta({ deltaSeconds: 10, scale: 1, maxDelta: 0.25 })).toBe(0.25);
    expect(scaleOrdoDelta({ deltaSeconds: 0.01, scale: 1, minDelta: 0.1 })).toBe(0.1);
  });
});
