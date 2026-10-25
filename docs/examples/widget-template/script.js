// @ts-check
/// <reference path="types.d.ts" />

// The overlay loads this page with the API address and the options in the query string, and posts
// `{ type: "yar:options", options }` when the user edits an option in the editor.
const params = new URLSearchParams(location.search);
const api = params.get("api") || "http://127.0.0.1:24051";
/** @type {Record<string, any>} */
let options = JSON.parse(params.get("options") || "{}");
/** @type {GameState | null} */
let state = null;

const app = /** @type {HTMLElement} */ (document.getElementById("app"));

/** Called when an option changes (and once at the start). Set CSS variables, toggle classes... */
function applyOptions() {
  // document.body.style.setProperty("--color", options.color ?? "#ffffff");
  draw();
}

/** Called whenever the game state changes (about 30 times a second while playing). */
function draw() {
  // `state` is null until the first message. Example: app.textContent = String(state?.gameplay?.combo ?? 0);
}

/** Called for each discrete event: hit, miss, comboBreak, playStarted, playEnded... (see docs/WEBSOCKET.md) */
function onEvent(/** @type {GameEvent} */ event) {
  // if (event.name === "miss") { ... }
}

window.addEventListener("message", (message) => {
  if (message.data?.type === "yar:options") {
    options = message.data.options ?? {};
    applyOptions();
  }
});

/** The state: what the game looks like now. `topics` limits the data to what you use. */
function connectState() {
  const ws = new WebSocket(api.replace("http", "ws") + "/api/v1/ws?topics=gameplay,beatmap,mods,time&events=false");
  ws.onmessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.type === "hello" || message.type === "state") {
      state = { ...state, ...message.data };
      draw();
    }
  };
  ws.onclose = () => setTimeout(connectState, 1000);
}

/** The events: something just happened. `names` limits them to the ones you use (all of them without it). */
function connectEvents() {
  const ws = new WebSocket(api.replace("http", "ws") + "/api/v1/events/ws");
  ws.onmessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.type === "event") onEvent(message.event);
  };
  ws.onclose = () => setTimeout(connectEvents, 1000);
}

applyOptions();
connectState();
connectEvents();
