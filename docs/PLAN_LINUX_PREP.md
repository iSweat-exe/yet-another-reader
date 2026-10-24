# Préparer le code à un futur support Linux (sans changer le comportement Windows)

## Contexte
Le projet ne lit osu!lazer que sous Windows. Tout le code OS est dispersé : `lazer-reader` masque 6 modules entiers
derrière `#[cfg(windows)]` dans `lib.rs`, et `src-tauri` mélange des appels Win32 dans `overlay.rs`, `reader.rs`,
`rtss.rs`, `lib.rs`. Aucun trait ni dossier n'isole l'OS. Objectif : **ranger** pour qu'un portage Linux ne touche
qu'un dossier, **sans écrire de code Linux fonctionnel** et **sans changer le comportement Windows**.
Plan destiné à être exécuté par Haiku : étapes courtes, mécaniques, vérifiables une par une.

## Règles pour l'exécutant
- Un commit par étape. Après chaque étape : `cargo check --workspace`, `cargo clippy --workspace --all-targets`,
  `cargo test --workspace` doivent passer sous Windows. Si ça casse, annuler l'étape, ne pas improviser.
- Déplacer = `git mv` (garder l'historique). Aucune réécriture de logique, aucun renommage de fonction.
- Les chemins publics existants (`lazer_reader::process`, `::dac`, `::window`…) restent valides via `pub use`.
- Pas de nouvelle dépendance. Pas de `unwrap`/`expect` (clippy). Lecture seule du jeu, toujours.
- Ne pas toucher à `docs/` ni à l'API (aucun changement de contrat).

## Étape 1 — Dépendances Windows de `src-tauri` sous `cfg(windows)`
- `src-tauri/Cargo.toml:31-33` : déplacer `windows`, `windows-core`, `webview2-com` de `[dependencies]` vers
  `[target.'cfg(windows)'.dependencies]` (mêmes versions et features).
- Vérifier : `cargo check -p yet-another-reader` (nom exact dans `src-tauri/Cargo.toml`) puis
  `cargo check --workspace --target x86_64-unknown-linux-gnu` (`rustup target add` si besoin ; seules les erreurs
  de l'étape 2 et 3 sont attendues, pas de dépendance manquante).

## Étape 2 — Dossier `platform/` dans `crates/lazer-reader`
Arborescence cible :
```
crates/lazer-reader/src/
  platform/
    mod.rs              # cfg: windows -> `mod windows; pub use windows::*;`  autre -> `mod unsupported; pub use unsupported::*;`
    windows/
      mod.rs
      process.rs        # git mv depuis src/process.rs
      dac.rs            # git mv depuis src/dac.rs
      window.rs         # git mv depuis src/window.rs
      file_version.rs   # extrait de version.rs: le `mod win` (lignes ~75-130, GetFileVersionInfo*, VerQueryValue)
    unsupported/
      mod.rs            # voir étape 4
```
- `clr.rs`, `session.rs`, `readers.rs` restent au même endroit (logique du jeu) mais importent via
  `crate::platform::{Process, ...}` au lieu de `crate::process`.
- `lib.rs` : retirer les 6 `#[cfg(windows)] pub mod ...` ; ajouter `mod platform;` et, pour la compatibilité,
  `pub use platform::{process, dac, window};` (sous le même `cfg` si nécessaire). `clr`, `readers`, `session` ne
  sont plus gatés : ils ne dépendent plus de `windows::` directement.
- `version.rs` : garder le parsing et `LazerVersion` ; `read_product_version` appelle `platform::file_version`.
- `error.rs:30-36` : `ReaderError::os` prend `windows::core::Error`. Le mettre sous `#[cfg(windows)]` et ajouter la
  variante `ReaderError::Unsupported(&'static str)` (utilisée à l'étape 4). Ne pas retirer l'existant.
- Callers à mettre à jour si le compilateur le demande : `bin/lazer-probe.rs`, `src-tauri/src/reader.rs`.

## Étape 3 — Chemins et constantes par OS dans `lazer-reader`
- Créer `src/platform/paths.rs` avec : `game_exe_name()`, `lazer_install_dir()`, `storage_root()`.
  Windows : reprendre à l'identique `GAME_EXE`/`LAZER_MARKER_MODULE` (`process.rs:25-27`), `LOCALAPPDATA` +
  `osulazer/current/osu!.exe` (`bin/lazer-probe.rs:101-102`), `storage_root()` de `pp.rs:14-27` (`%APPDATA%\osu`).
  Autres OS : `cfg(not(windows))` retourne `None` (pas de logique Linux pour l'instant).
- `pp.rs`, `process.rs` et `lazer-probe.rs` appellent ces fonctions au lieu de lire les variables d'environnement.

## Étape 4 — Stub `unsupported/` qui compile sur Linux
- `platform/unsupported/mod.rs` : mêmes types et signatures publiques que `windows/` (`Process`, `Module`, `Region`,
  `Dac`, fonctions de `window.rs`, `file_version`), chaque méthode renvoie `Err(ReaderError::Unsupported("linux"))`.
  Copier les signatures depuis les fichiers `windows/`, pas d'invention.
- Critère : `cargo check -p lazer-reader --target x86_64-unknown-linux-gnu` passe, y compris `session.rs`/`readers.rs`.

## Étape 5 — Rangement côté `src-tauri`
- Créer `src-tauri/src/platform/` avec `mod.rs` (cfg windows / autre), `windows.rs`, `other.rs`.
- Déplacer dans `windows.rs` les corps cfg(windows) actuels, sans changer leur code :
  - `overlay.rs:160-195` `keep_on_top` (le fallback `cfg(not(windows))` va dans `other.rs`),
  - `reader.rs:432-447` `fine_timer` et `reader.rs:578-594` `lower_priority`,
  - `lib.rs:66-80` `disable_browser_shortcuts` (webview2).
- `rtss.rs` : tout le module est Windows-only → `git mv` vers `platform/windows/rtss.rs` ; le stub existant
  (`rtss.rs:338`) passe dans `platform/other.rs`. La logique de layout OSD (lignes ~48-132) reste telle quelle.
- Les appelants (`overlay.rs`, `reader.rs`, `lib.rs`) utilisent `platform::keep_on_top(...)`, etc.
- Mettre à jour les `mod` de `lib.rs` et vérifier que `main.rs` garde `windows_subsystem`.

## Étape 6 — Config build et CI (sans casser les checks requis)
- `src-tauri/tauri.conf.json:28-32` : ne pas changer `bundle.targets` (NSIS seul) pour l'instant.
- `.github/workflows/ci.yml` : **ne pas renommer** les jobs `Frontend` ni `Rust (Windows)` (status checks requis,
  `.github/rulesets/main.json`). Ajouter un job `Rust (Linux check)` sur `ubuntu-latest` : `cargo check -p
  lazer-reader -p overlay-server --target x86_64-unknown-linux-gnu`, non requis au début.
- `scripts/new-widget.mjs:17-18` : ajouter la branche Linux (`$XDG_CONFIG_HOME` ou `~/.config/<id>/widgets`) ;
  vérifier le chemin réel de `app_config_dir()` Tauri avant de coder.

## Étape 7 — Documentation d'architecture
- `docs/ARCHITECTURE.md` + `docs/en/ARCHITECTURE.md` : ajouter une section « Frontière de plateforme » (où vit le
  code OS, comment ajouter un OS). Texte seulement ; ne pas toucher aux docs d'API.

## Vérification de bout en bout
1. `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`.
2. `npx tsc --noEmit` et `npm test` (inchangés, doivent rester verts).
3. `cargo check -p lazer-reader -p overlay-server --target x86_64-unknown-linux-gnu` : OK.
4. Sous Windows, avec le vrai jeu : `cargo run -p lazer-reader --bin lazer-probe -- watch` doit afficher les mêmes
   données qu'avant (exigence de `CLAUDE.md` pour tout changement touchant la lecture du jeu).
5. `npm run tauri dev` : l'overlay s'affiche toujours au-dessus du jeu (`keep_on_top`) et la lecture démarre.

## Hors périmètre (étape suivante, pas pour Haiku)
Implémenter la vraie lecture Linux (`libmscordaccore.so`, `process_vm_readv`, ptrace_scope, Flatpak/Wine),
l'overlay natif Wayland, et les bundles AppImage/.deb.
