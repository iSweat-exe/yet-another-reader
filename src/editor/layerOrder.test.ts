import { describe, expect, it } from "vitest";
import type { WidgetInstance } from "../overlay/layout";
import { moveUnit } from "./layerOrder";

const w = (id: string, group?: string): WidgetInstance => ({ id, type: "score", anchor: "top-left", x: 0, y: 0, w: 10, h: 10, pages: ["playing"], ...(group ? { group } : {}) });
const order = (list: WidgetInstance[]) => list.map((x) => x.id).join("");

describe("moveUnit", () => {
  const list = [w("a"), w("b"), w("c"), w("d")];

  it("puts a widget in front of its target (after it in the back-to-front array)", () => {
    expect(order(moveUnit(list, ["a"], ["c"], "above"))).toBe("bcad");
  });

  it("puts a widget behind its target", () => {
    expect(order(moveUnit(list, ["d"], ["b"], "below"))).toBe("adbc");
  });

  it("keeps a group together, in its own order, as one block", () => {
    const grouped = [w("a"), w("g1", "group-1"), w("b"), w("g2", "group-1"), w("c")];
    expect(order(moveUnit(grouped, ["g1", "g2"], ["c"], "above"))).toBe("abcg1g2");
    expect(order(moveUnit(grouped, ["g1", "g2"], ["a"], "below"))).toBe("g1g2ab" + "c");
  });

  it("treats a group target as one block", () => {
    const grouped = [w("a"), w("g1", "group-1"), w("g2", "group-1"), w("b")];
    expect(order(moveUnit(grouped, ["b"], ["g1", "g2"], "below"))).toBe("abg1g2");
    expect(order(moveUnit(grouped, ["a"], ["g1", "g2"], "above"))).toBe("g1g2ab");
  });

  it("returns the same array when nothing changes or the target is unknown", () => {
    expect(moveUnit(list, ["b"], ["a"], "above")).toBe(list);
    expect(moveUnit(list, ["b"], ["zzz"], "above")).toBe(list);
    expect(moveUnit(list, ["b"], ["b"], "above")).toBe(list);
    expect(moveUnit(list, [], ["a"], "above")).toBe(list);
  });
});
