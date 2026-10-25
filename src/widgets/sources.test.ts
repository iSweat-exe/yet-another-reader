import { describe, expect, it } from "vitest";
import { WIDGETS } from "./registry";
import { loadWidgetSource } from "./sources";

describe("loadWidgetSource", () => {
  it("finds the file that defines every built-in widget, at its definition", async () => {
    for (const widget of WIDGETS) {
      const source = await loadWidgetSource(widget.type);
      expect(source?.code, widget.type).toContain(`type: "${widget.type}"`);
      expect(source?.path, widget.type).toMatch(/^src\/widgets\/builtin\/\w+\.tsx$/);
      // The reported line is where that definition starts.
      expect(source?.code.split("\n")[(source?.line ?? 1) - 1], widget.type).toContain(`type: "${widget.type}"`);
    }
  });

  it("has nothing for a type that is not built in", async () => {
    expect(await loadWidgetSource("web")).toBeNull();
    expect(await loadWidgetSource("nope")).toBeNull();
  });
});
