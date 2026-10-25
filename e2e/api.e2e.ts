import { expect, test } from "@playwright/test";

import { API, WS } from "./env";

/** The public contract of the local API, against the sample server (a scripted fake game). */

test.describe("REST", () => {
  test("the index lists the routes and both WebSockets", async ({ request }) => {
    const index = await (await request.get(API)).json();
    expect(index.name).toBe("yet-another-reader");
    expect(index.websocket).toBe("/api/v1/ws");
    expect(index.inputsWebsocket).toBe("/api/v1/inputs/ws");
    expect(index.eventsWebsocket).toBe("/api/v1/events/ws");
    const paths = index.endpoints.map((e: { path: string }) => e.path);
    expect(paths).toContain("/api/v1/personal-best");
    expect(paths).toContain("/api/v1/events/ws");
  });

  test("health answers", async ({ request }) => {
    expect((await request.get(`${API}/health`)).ok()).toBe(true);
  });

  test("state carries the personal best of the map", async ({ request }) => {
    const state = await (await request.get(`${API}/state`)).json();
    expect(state.personalBest).toMatchObject({ score: 66000, mods: ["HD", "DT"] });
  });

  test("the personal best route returns the record with its samples", async ({ request }) => {
    const record = await (await request.get(`${API}/personal-best`)).json();
    expect(record.score).toBe(66000);
    expect(record.samples.length).toBe(10);
    expect(record.samples[0]).toHaveLength(4);
    // Song-time order.
    const times = record.samples.map((s: number[]) => s[0]);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test("an unknown route is a JSON 404", async ({ request }) => {
    const response = await request.get(`${API}/nope`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBeTruthy();
  });

  test("a WebSocket route asked without the upgrade is refused", async ({ request }) => {
    expect((await request.get(`${API}/events/ws`)).ok()).toBe(false);
  });
});

/** Opens a WebSocket from the browser and collects the messages for `ms`. */
async function listen(page: import("@playwright/test").Page, url: string, ms: number): Promise<{ type: string; event?: { name: string } }[]> {
  await page.goto("/");
  type Message = { type: string; event?: { name: string } };
  return page.evaluate(
    ([target, wait]) =>
      new Promise<Message[]>((resolve) => {
        const messages: Message[] = [];
        const ws = new WebSocket(target as string);
        ws.onmessage = (e) => messages.push(JSON.parse(e.data));
        setTimeout(() => {
          ws.close();
          resolve(messages);
        }, wait as number);
      }),
    [url, ms],
  );
}

test.describe("WebSocket events", () => {
  test.setTimeout(60_000);

  test("the events stream says hello with the names it can send", async ({ page }) => {
    const messages = await listen(page, `${WS}/events/ws`, 500);
    expect(messages[0].type).toBe("hello");
    expect((messages[0] as unknown as { events: string[] }).events).toEqual(expect.arrayContaining(["hit", "miss", "comboBreak", "playStarted", "playEnded"]));
  });

  test("a play sends hits, a miss and a combo break, and the map start and end", async ({ page }) => {
    // The sample loops through a 16 s story: a play with hits, a miss and a combo break, then the results.
    const messages = await listen(page, `${WS}/events/ws`, 20_000);
    const names = new Set(messages.filter((m) => m.type === "event").map((m) => m.event?.name));
    for (const name of ["hit", "miss", "comboBreak", "playStarted", "playEnded"]) expect(names, name).toContain(name);
    // No state on this stream.
    expect(messages.some((m) => m.type === "state")).toBe(false);
  });

  test("an unknown topic or event name is refused at the handshake", async ({ page }) => {
    for (const path of ["ws?topics=nope", "events/ws?names=nope"]) {
      const outcome = await listen(page, `${WS}/${path}`, 1_000);
      expect(outcome, path).toEqual([]);
    }
  });

  test("the names filter keeps only the wanted events", async ({ page }) => {
    const messages = await listen(page, `${WS}/events/ws?names=miss`, 20_000);
    const names = new Set(messages.filter((m) => m.type === "event").map((m) => m.event?.name));
    expect([...names]).toEqual(["miss"]);
  });

  test("the state stream still carries the events too, unless asked not to", async ({ page }) => {
    const withEvents = await listen(page, `${WS}/ws`, 18_000);
    expect(withEvents.some((m) => m.type === "event")).toBe(true);
    const without = await listen(page, `${WS}/ws?events=false`, 3_000);
    expect(without.some((m) => m.type === "event")).toBe(false);
    expect(without.some((m) => m.type === "hello")).toBe(true);
  });
});
