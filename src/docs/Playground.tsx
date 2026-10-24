import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "../components/controls";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { useT } from "../i18n";
import { useReaderStore } from "../lib/store";

/** What the REST playground can ask for: the routes the app lists at `/api/v1` (all `GET`). */
interface Endpoint {
  path: string;
  description: string;
}

interface Answer {
  status: number;
  statusText: string;
  ms: number;
  type: string;
  bytes: number;
  /** Pretty-printed JSON or text; `null` for a binary answer (a picture, the audio). */
  body: string | null;
}

const MAX_SHOWN = 100_000;
const WS_ENDPOINTS = ["/api/v1/ws", "/api/v1/inputs/ws"] as const;
const MAX_MESSAGES = 200;

const input = "min-h-9 rounded-lg bg-surface px-3 text-sm text-ink shadow-[0_0_0_1px_var(--ring-field)] outline-none transition-shadow duration-150 placeholder:text-ink-dim focus-visible:shadow-[0_0_0_2px_var(--color-accent)]";
const button =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm outline-none transition-[background-color,scale,opacity] duration-150 active:scale-[0.96] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] disabled:pointer-events-none disabled:opacity-40";
const primary = `${button} bg-accent text-surface hover:opacity-90`;
const quiet = `${button} text-ink shadow-[0_0_0_1px_var(--ring-field)] hover:bg-wash/6`;

const statusTone = (status: number) => (status >= 200 && status < 300 ? "text-emerald-400" : status >= 400 ? "text-red-400" : "text-amber-300");

/** Formats a body for reading: JSON indented, anything else as it came. */
export function prettyBody(text: string, type: string): string {
  if (!type.includes("json")) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The `curl` line that makes the same request. */
export const curlOf = (url: string) => `curl ${url}`;

/** An address on the local API: `base` without a trailing slash, `path` with one leading slash. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function RestPlayground({ base }: { base: string }) {
  const t = useT();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [path, setPath] = useState("/api/v1/state");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(joinUrl(base, "/api/v1"))
      .then((r) => r.json() as Promise<{ endpoints?: Endpoint[] }>)
      .then((index) => alive && setEndpoints((index.endpoints ?? []).filter((e) => !e.path.endsWith("/ws") && !e.path.includes("/docs"))))
      .catch(() => alive && setEndpoints([]));
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, [base]);

  const send = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const response = await fetch(joinUrl(base, path.trim()), { signal: abort.signal });
      const type = response.headers.get("content-type") ?? "";
      const readable = type.includes("json") || type.startsWith("text/");
      const buffer = await response.arrayBuffer();
      const text = readable ? new TextDecoder().decode(buffer) : null;
      const pretty = text === null ? null : prettyBody(text, type);
      setAnswer({
        status: response.status,
        statusText: response.statusText,
        ms: Math.round(performance.now() - started),
        type,
        bytes: buffer.byteLength,
        body: pretty === null ? null : pretty.length > MAX_SHOWN ? `${pretty.slice(0, MAX_SHOWN)}\n…` : pretty,
      });
    } catch (e) {
      if (!abort.signal.aborted) {
        setAnswer(null);
        setError(String(e));
      }
    } finally {
      if (controller.current === abort) setBusy(false);
    }
  }, [base, path]);

  const url = joinUrl(base, path.trim());
  const options = useMemo(() => endpoints.map((e) => ({ value: e.path, label: e.path })), [endpoints]);
  const known = endpoints.find((e) => e.path === path);

  return (
    <section aria-labelledby="pg-rest" className="space-y-3">
      <h2 id="pg-rest" className="text-lg font-semibold">
        {t("playground.rest.title")}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-wash/8 px-2 py-1 text-xs font-semibold tracking-[0.04em]">GET</span>
        {options.length > 0 && <Select<string> size="sm" className="w-64" label={t("playground.rest.route")} value={known ? path : ""} options={known ? options : [{ value: "", label: t("playground.rest.custom") }, ...options]} onChange={(v) => v && setPath(v)} />}
        <input
          aria-label={t("playground.rest.path")}
          value={path}
          spellCheck={false}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          className={`${input} min-w-0 flex-1 font-mono`}
        />
        <button type="button" className={primary} disabled={busy} onClick={() => void send()}>
          <Icon name={busy ? "spinner" : "play"} />
          {busy ? t("playground.rest.sending") : t("playground.rest.send")}
        </button>
      </div>
      <p className="text-xs text-ink-dim">{known?.description ?? t("playground.rest.hint")}</p>
      <div className="flex items-center gap-2 text-xs text-ink-dim">
        <code className="min-w-0 flex-1 truncate font-mono">{curlOf(url)}</code>
        <CopyButton text={curlOf(url)} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {t("playground.rest.error", { detail: error })}
        </p>
      )}
      {answer && (
        <div className="overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--ring-field)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-wash/8 bg-surface-raised px-3 py-2 text-xs tabular-nums">
            <span className={`font-semibold ${statusTone(answer.status)}`}>
              {answer.status} {answer.statusText}
            </span>
            <span className="text-ink-dim">{answer.ms} ms</span>
            <span className="text-ink-dim">{t("playground.rest.size", { n: answer.bytes.toLocaleString() })}</span>
            <span className="min-w-0 truncate text-ink-dim">{answer.type}</span>
            {answer.body !== null && (
              <span className="ml-auto">
                <CopyButton text={answer.body} />
              </span>
            )}
          </div>
          {answer.body === null ? (
            <p className="px-3 py-3 text-sm text-ink-dim">{t("playground.rest.binary")}</p>
          ) : (
            <pre className="max-h-[28rem] overflow-auto bg-surface p-3 font-mono text-[0.8125rem] leading-relaxed">{answer.body}</pre>
          )}
        </div>
      )}
    </section>
  );
}

type Link = "closed" | "connecting" | "open";

interface Message {
  id: number;
  at: number;
  text: string;
  /** The `type` of the JSON payload, when it has one. */
  kind: string;
}

function WebSocketPlayground({ base }: { base: string }) {
  const t = useT();
  const [endpoint, setEndpoint] = useState<(typeof WS_ENDPOINTS)[number]>(WS_ENDPOINTS[0]);
  const [link, setLink] = useState<Link>("closed");
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [rate, setRate] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const buffer = useRef<Message[]>([]);
  const counter = useRef(0);
  const received = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const disconnect = useCallback(() => {
    socket.current?.close();
    socket.current = null;
    setLink("closed");
  }, []);
  useEffect(() => disconnect, [disconnect]);

  const connect = () => {
    disconnect();
    clearMessages();
    const ws = new WebSocket(joinUrl(base, endpoint).replace(/^http/, "ws"));
    socket.current = ws;
    setLink("connecting");
    ws.onopen = () => setLink("open");
    ws.onclose = () => socket.current === ws && disconnect();
    ws.onerror = () => undefined;
    ws.onmessage = (e) => {
      received.current += 1;
      if (pausedRef.current) return;
      const text = typeof e.data === "string" ? e.data : "(binary)";
      let kind = "";
      try {
        const parsed = JSON.parse(text) as { type?: unknown };
        if (typeof parsed.type === "string") kind = parsed.type;
      } catch {
        /* not JSON: shown as text */
      }
      buffer.current.push({ id: counter.current++, at: Date.now(), text, kind });
    };
  };
  function clearMessages() {
    setMessages([]);
    buffer.current = [];
    received.current = 0;
  }

  // The stream can be fast (30 states a second, hundreds of key changes): messages are batched into a frame.
  useEffect(() => {
    if (link !== "open") return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setRate(Math.round((received.current * 1000) / (now - last)));
      received.current = 0;
      last = now;
      if (buffer.current.length === 0) return;
      const fresh = buffer.current;
      buffer.current = [];
      setMessages((old) => [...fresh.reverse(), ...old].slice(0, MAX_MESSAGES));
    }, 250);
    return () => window.clearInterval(timer);
  }, [link]);

  const shown = filter.trim() ? messages.filter((m) => m.text.toLowerCase().includes(filter.trim().toLowerCase())) : messages;
  const dot = link === "open" ? "bg-emerald-400" : link === "connecting" ? "bg-amber-300" : "bg-ink-dim/50";

  return (
    <section aria-labelledby="pg-ws" className="space-y-3">
      <h2 id="pg-ws" className="text-lg font-semibold">
        {t("playground.ws.title")}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select<string> size="sm" className="w-52" label={t("playground.ws.endpoint")} value={endpoint} options={WS_ENDPOINTS.map((e) => ({ value: e, label: e }))} onChange={(v) => setEndpoint(v as (typeof WS_ENDPOINTS)[number])} disabled={link !== "closed"} />
        {link === "closed" ? (
          <button type="button" className={primary} onClick={connect}>
            <Icon name="online" />
            {t("playground.ws.connect")}
          </button>
        ) : (
          <button type="button" className={quiet} onClick={disconnect}>
            <Icon name="close" />
            {t("playground.ws.disconnect")}
          </button>
        )}
        <span className="flex items-center gap-2 text-xs text-ink-dim" role="status">
          <span aria-hidden className={`size-2 rounded-full ${dot}`} />
          {t(`playground.ws.${link}` as "playground.ws.open")}
          {link === "open" && <span className="tabular-nums">· {t("playground.ws.rate", { n: rate })}</span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label={t("playground.ws.filter")} placeholder={t("playground.ws.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} className={`${input} min-w-0 flex-1`} />
        <button type="button" className={quiet} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          <Icon name={paused ? "play" : "clock"} />
          {paused ? t("playground.ws.resume") : t("playground.ws.pause")}
        </button>
        <button type="button" className={quiet} onClick={clearMessages} disabled={messages.length === 0}>
          <Icon name="trash" />
          {t("playground.ws.clear")}
        </button>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-lg bg-surface shadow-[0_0_0_1px_var(--ring-field)]" aria-live="off">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-dim">{link === "open" ? t("playground.ws.waiting") : t("playground.ws.empty")}</p>
        ) : (
          <ul className="divide-y divide-wash/6 font-mono text-[0.8125rem]">
            {shown.map((m) => (
              <li key={m.id}>
                <details className="group">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center gap-3 px-3 outline-none hover:bg-wash/5 focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]">
                    <span className="shrink-0 text-ink-dim tabular-nums">{new Date(m.at).toLocaleTimeString([], { hour12: false })}</span>
                    {m.kind && <span className="shrink-0 rounded bg-accent/16 px-1.5 text-xs text-accent">{m.kind}</span>}
                    <span className="min-w-0 flex-1 truncate">{m.text}</span>
                  </summary>
                  <pre className="overflow-auto bg-surface-raised px-3 py-2 whitespace-pre-wrap">{prettyBody(m.text, "json")}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * The API, tried from the documentation: ask any route of the local server and read the answer, or open the
 * WebSocket and watch the messages arrive. Meant for people who write community widgets.
 */
export default function Playground() {
  const t = useT();
  const api = useReaderStore((s) => s.api);
  const base = api?.running && api.url ? api.url : null;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="mb-2 text-3xl font-semibold tracking-[-0.02em]">{t("playground.title")}</h1>
        <p className="max-w-[62ch] text-ink-dim">{t("playground.intro")}</p>
      </header>
      {base === null ? (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-300">{t("playground.apiOff")}</p>
      ) : (
        <>
          <RestPlayground base={base} />
          <WebSocketPlayground base={base} />
        </>
      )}
    </div>
  );
}
