import { describe, expect, it } from "vitest";
import { renderStems } from "../src/audio/score";
import { cameraAt } from "../src/render/camera";
import { DURATION } from "../src/model/timeline";

describe("timeline presentation", () => {
  it("keeps the camera finite across the 34 seconds", () => {
    for (let time = 0; time <= DURATION; time += 0.25) {
      const pose = cameraAt(time, 5.4, false);
      for (const value of Object.values(pose)) {
        expect(Number.isFinite(value)).toBe(true);
      }
      const reduced = cameraAt(time, 6.2, true);
      expect(reduced.z).toBeGreaterThan(2);
    }
  });

  it("renders a 34-second original score", () => {
    const stems = renderStems(8000);
    expect(stems.music.length).toBe(8000 * 34);
    expect(stems.sfx.length).toBe(8000 * 34);
    const peak = stems.music.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(stems.music[stems.music.length - 1])).toBeLessThan(0.02);
  });
});
