import { describe, expect, it } from "vitest";
import { rubberBand } from "./Splitter";

describe("rubberBand", () => {
  it("should not move the bar when nothing is pulled past the edge", () => {
    expect(rubberBand(0)).toBe(0);
  });

  it("should follow the pointer less and less the further it is pulled", () => {
    const near = rubberBand(20);
    const far = rubberBand(200);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(20);
    expect(far).toBeLessThan(200);
    // Ten times the pull gives well under ten times the stretch.
    expect(far / near).toBeLessThan(10);
  });

  it("should stay below the dimension however far the pointer goes", () => {
    expect(rubberBand(100_000, 120)).toBeLessThan(120 / 0.55);
  });

  it("should stretch the other way for a pull in the other direction", () => {
    expect(rubberBand(-50)).toBeCloseTo(-rubberBand(50));
  });
});
