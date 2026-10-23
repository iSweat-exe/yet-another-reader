import { describe, expect, it } from "vitest";
import { optionValues, webWidgetUrl } from "./web";

describe("optionValues", () => {
  const manifest = {
    options: [
      { key: "color", type: "color" as const, default: "#fff" },
      { key: "size", type: "number" as const, default: 56 },
      { key: "label", type: "string" as const },
    ],
  };

  it("starts from the manifest defaults", () => {
    expect(optionValues(manifest, undefined)).toEqual({ color: "#fff", size: 56 });
  });

  it("lets saved values win over defaults", () => {
    expect(optionValues(manifest, { size: 80, label: "hi" })).toEqual({ color: "#fff", size: 80, label: "hi" });
  });

  it("works without a manifest", () => {
    expect(optionValues(undefined, { a: 1 })).toEqual({ a: 1 });
  });
});

describe("webWidgetUrl", () => {
  it("points at the widget folder and passes the API address and options", () => {
    const url = new URL(webWidgetUrl(24051, { id: "my widget", entry: "pages/main.html" }, { color: "#f00" }));
    expect(url.origin).toBe("http://127.0.0.1:24051");
    expect(url.pathname).toBe("/widgets/my%20widget/pages/main.html");
    expect(url.searchParams.get("api")).toBe("http://127.0.0.1:24051");
    expect(JSON.parse(url.searchParams.get("options") ?? "{}")).toEqual({ color: "#f00" });
  });
});
