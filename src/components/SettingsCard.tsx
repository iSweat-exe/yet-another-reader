import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { LANGUAGES } from "../i18n/languages";
import { isTauri } from "../lib/state/mock";
import { playSfx, setSfxPrefs, useSfxPrefs } from "../lib/audio/sfx";
import { saveSettings } from "../lib/state/store";
import { FPS_LIMITS, INPUT_POLL_LIMITS, MIN_PORT, POLL_LIMITS, type RtssStatus, type Settings } from "../lib/state/types";
import { Group, NumberField, Row, Slider, Switch } from "./controls";
import { Icon } from "./icons/Icon";
import { Select } from "./select/Select";
import { UpdateRows } from "./updates/UpdateRows";

const outlineButton =
  "min-h-10 rounded-lg px-3 text-sm text-ink shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)] outline-none transition-[scale,background-color,box-shadow] duration-150 ease-out hover:bg-wash/6 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100";

const textInput =
  "min-h-10 rounded-lg bg-transparent px-3 text-sm text-ink shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)] outline-none placeholder:text-ink-dim focus-visible:shadow-[0_0_0_2px_var(--color-accent)]";

export function SettingsCard({ settings, rtss }: { settings: Settings; rtss: RtssStatus | null }) {
  const t = useT();
  const sounds = useSfxPrefs();
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  // Follow settings changed from elsewhere (e.g. loaded at startup, or the overlay shortcut).
  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const hz = Math.round(1000 / Math.max(1, draft.pollIntervalMs));
  const set = (changes: Partial<Settings>) => {
    setSaved(false);
    setDraft({ ...draft, ...changes });
  };

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings(draft);
      setSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const barVisible = dirty || saved || error !== null;
  const message = error ?? (saved && !dirty ? t("settings.saved") : t("settings.unsaved"));

  return (
    <div className="space-y-8">
      <Group title={t("settings.group.general")}>
        <Row id="language" label={t("settings.language")}>
          <Select
            label={t("settings.language")}
            value={draft.language}
            onChange={(language) => set({ language })}
            align="end"
            className="w-40"
            options={[{ value: "auto", label: t("settings.languageAuto") }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
          />
        </Row>
        {/* Applied at once and kept in this window's storage (not part of the reader's settings, so not part of the Apply bar). */}
        <Row id="sounds" label={t("settings.sounds")} hint={t("settings.soundsHint")}>
          <Switch
            id="sounds"
            checked={sounds.enabled}
            onChange={(enabled) => {
              // Turning off is heard by the standard switch sound (it plays before the change); turning on has to play it itself.
              setSfxPrefs({ enabled });
              if (enabled) playSfx("check-on");
            }}
          />
        </Row>
        <Row id="sounds-volume" label={t("settings.soundsVolume")} disabled={!sounds.enabled}>
          <div className={`w-40 transition-opacity duration-150 ease-out ${sounds.enabled ? "" : "pointer-events-none opacity-50"}`}>
            <Slider
              label={t("settings.soundsVolume")}
              min={0}
              max={100}
              value={Math.round(sounds.volume * 100)}
              onChange={(percent) => {
                setSfxPrefs({ volume: percent / 100 });
              }}
            />
          </div>
        </Row>
      </Group>

      <Group title={t("settings.group.updates")}>
        <Row id="auto-update" label={t("settings.autoUpdate")} hint={t("settings.autoUpdateHint")}>
          <Switch id="auto-update" checked={draft.autoUpdateCheck} onChange={(autoUpdateCheck) => set({ autoUpdateCheck })} />
        </Row>
        <UpdateRows />
      </Group>

      <Group title={t("settings.group.reading")}>
        <div className="py-3">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="poll" className="min-w-0 text-sm">
              {t("settings.poll")}
              <span className="mt-0.5 block text-xs leading-snug text-ink-dim tabular-nums">{t("settings.pollRate", { n: hz })}</span>
            </label>
            <NumberField id="poll" value={draft.pollIntervalMs} onChange={(pollIntervalMs) => set({ pollIntervalMs })} min={POLL_LIMITS.min} max={POLL_LIMITS.max} unit="ms" />
          </div>
          <div className="mt-2">
            <Slider label={t("settings.poll")} min={POLL_LIMITS.min} max={200} value={Math.min(draft.pollIntervalMs, 200)} onChange={(pollIntervalMs) => set({ pollIntervalMs })} />
          </div>
        </div>
        <Row id="input-poll" label={t("settings.inputPoll")} hint={t("settings.inputPollHint", { n: Math.round(1000 / Math.max(1, draft.inputPollIntervalMs)) })}>
          <NumberField id="input-poll" value={draft.inputPollIntervalMs} onChange={(inputPollIntervalMs) => set({ inputPollIntervalMs })} min={INPUT_POLL_LIMITS.min} max={INPUT_POLL_LIMITS.max} unit="ms" />
        </Row>
      </Group>

      <Group title={t("settings.group.overlay")}>
        <Row id="overlay-enabled" label={t("settings.overlay")} hint={t("settings.overlayHint")}>
          <Switch id="overlay-enabled" checked={draft.overlayEnabled} onChange={(overlayEnabled) => set({ overlayEnabled })} />
        </Row>
        <Row id="overlay-fps" label={t("settings.overlayFps")} hint={t("settings.overlayFpsHint")} disabled={!draft.overlayEnabled}>
          <NumberField id="overlay-fps" value={draft.overlayFps} onChange={(overlayFps) => set({ overlayFps })} min={FPS_LIMITS.min} max={FPS_LIMITS.max} unit="fps" disabled={!draft.overlayEnabled} />
        </Row>
        <Row id="overlay-focus" label={t("settings.focusOnly")} hint={t("settings.focusOnlyHint")} disabled={!draft.overlayEnabled}>
          <Switch id="overlay-focus" checked={draft.overlayOnlyWhenFocused} onChange={(overlayOnlyWhenFocused) => set({ overlayOnlyWhenFocused })} disabled={!draft.overlayEnabled} />
        </Row>
        <Row id="overlay-test" label={t("settings.overlayTest")} hint={t("settings.overlayTestHint")}>
          <button id="overlay-test" type="button" disabled={!isTauri} onClick={() => void invoke("preview_overlay")} className={outlineButton}>
            {t("common.test")}
          </button>
        </Row>
      </Group>

      <Group title={t("settings.group.rtss")}>
        <Row id="rtss-enabled" label={t("settings.rtss")} hint={t("settings.rtssHint")}>
          <Switch id="rtss-enabled" checked={draft.rtssEnabled} onChange={(rtssEnabled) => set({ rtssEnabled })} />
        </Row>
        {draft.rtssEnabled && (
          <>
            <Row appear id="rtss-x" label={t("settings.rtssPosition")}>
              <NumberField id="rtss-x" label={t("settings.rtssPositionX")} value={draft.rtssX} onChange={(rtssX) => set({ rtssX })} min={0} max={8000} unit="x" />
              <NumberField label={t("settings.rtssPositionY")} value={draft.rtssY} onChange={(rtssY) => set({ rtssY })} min={0} max={8000} unit="y" />
            </Row>
            {settings.rtssEnabled && rtss && (
              <p className={`flex items-center gap-2 py-3 text-xs transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none ${rtss.available ? "text-emerald-400" : "text-amber-400"}`}>
                <Icon name={rtss.available ? "check-circle" : "close"} size={14} />
                {rtss.available ? t("settings.rtssOk") : `${rtss.message ?? t("settings.rtssMissing")} ${t("settings.rtssStart")}`}
              </p>
            )}
          </>
        )}
      </Group>

      <Group title={t("settings.group.nowPlaying")}>
        <Row id="np-enabled" label={t("settings.nowPlaying")} hint={t("settings.nowPlayingHint")}>
          <Switch id="np-enabled" checked={draft.nowPlayingEnabled} onChange={(nowPlayingEnabled) => set({ nowPlayingEnabled })} />
        </Row>
        {draft.nowPlayingEnabled && (
          <>
            <Row appear id="np-template" label={t("settings.nowPlayingTemplate")} hint={t("settings.nowPlayingTemplateHint")}>
              <input
                id="np-template"
                value={draft.nowPlayingTemplate}
                maxLength={500}
                spellCheck={false}
                onChange={(e) => set({ nowPlayingTemplate: e.target.value })}
                className={`${textInput} w-72`}
              />
            </Row>
            <Row appear id="np-dir" label={t("settings.nowPlayingDir")} hint={t("settings.nowPlayingDirHint")}>
              <input
                id="np-dir"
                value={draft.nowPlayingDir}
                placeholder={t("settings.nowPlayingDirDefault")}
                spellCheck={false}
                onChange={(e) => set({ nowPlayingDir: e.target.value })}
                className={`${textInput} w-72`}
              />
            </Row>
          </>
        )}
      </Group>

      <Group title={t("settings.group.network")}>
        <Row id="api-enabled" label={t("settings.api")} hint={t("settings.apiHint")}>
          <Switch id="api-enabled" checked={draft.apiEnabled} onChange={(apiEnabled) => set({ apiEnabled })} />
        </Row>
        <Row id="port" label={t("settings.port")} disabled={!draft.apiEnabled}>
          <NumberField id="port" value={draft.apiPort} onChange={(apiPort) => set({ apiPort })} min={MIN_PORT} max={65535} disabled={!draft.apiEnabled} width="w-20" />
        </Row>
      </Group>

      {/* Sticks to the bottom of the page while there is something to apply; stays out of the way (and of the tab order) otherwise. */}
      <div
        inert={!barVisible}
        className={`sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl bg-menu py-2 pr-2 pl-4 shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_8px_24px_oklch(0_0_0/0.45)] transition-[opacity,translate] ease-out motion-reduce:transition-none ${barVisible ? "translate-y-0 opacity-100 duration-200" : "pointer-events-none translate-y-2 opacity-0 duration-150"}`}
      >
        <p role={error ? "alert" : "status"} className={`flex min-w-0 items-center gap-2 text-sm ${error ? "text-red-400" : saved && !dirty ? "text-emerald-400" : "text-ink"}`}>
          <Icon name={error ? "close" : saved && !dirty ? "check-circle" : "pencil"} size={14} />
          <span className="truncate">{message}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              setError(null);
              setDraft(settings);
            }}
            className="min-h-10 rounded-lg px-3 text-sm text-ink-dim outline-none transition-[color,background-color,scale] duration-150 ease-out hover:bg-wash/6 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={apply}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-surface outline-none transition-[scale,opacity,box-shadow] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_var(--color-menu),0_0_0_4px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            {saving && <Icon name="spinner" />}
            {t("common.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
