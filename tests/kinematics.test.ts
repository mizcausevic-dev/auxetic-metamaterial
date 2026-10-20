import { describe, expect, it } from "vitest";
import { runChecks } from "../src/model/checks";
import { DURATION, frameState } from "../src/model/timeline";

describe("illustrative re-entrant linkage", () => {
  it("passes the geometric consistency checks", () => {
    const report = runChecks();
    if (!report.ok) {
      throw new Error(`${report.failures.join("\n")}\n${report.notes.join("\n")}`);
    }
    expect(report.ok).toBe(true);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it("holds a stable final state at 34 seconds", () => {
    const end = frameState(DURATION);
    const past = frameState(40);
    expect(end.t).toBe(34);
    expect(past.t).toBe(34);
    expect(end.shot).toBe(5);
    expect(end.extension).toBe(0);
    expect(end.comparison.progress).toBe(1);
    expect(end.comparison.conventionalStrain.ex).toBeLessThan(0);
    expect(end.comparison.auxeticStrain.ex).toBeGreaterThan(0);
    expect(Math.abs(end.comparison.auxeticStrain.ey - end.comparison.conventionalStrain.ey)).toBeLessThan(0.003);
  });
});
