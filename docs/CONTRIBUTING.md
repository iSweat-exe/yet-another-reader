# Contribuer

Les contributions sont les bienvenues : correction de bug, nouveau widget, traduction, documentation,
amélioration de l'éditeur ou de l'API. Cette page explique comment mettre en place le projet et ce qui est
attendu d'une modification. Pour comprendre le code avant de le toucher, lis d'abord
l'[Architecture](ARCHITECTURE.md).

## Mettre en place l'environnement

| Outil | Pourquoi |
| --- | --- |
| **Windows 10/11** | Le reader utilise l'API Windows ; le crate `lazer-reader` ne compile ses modules de lecture que sous Windows. |
| **Node.js** (version LTS récente) et npm | L'interface (Vite, React, TypeScript). |
| **Rust** stable récent (édition 2024) | Le workspace Cargo. Installé avec rustup (`rustup.rs`). |
| **Prérequis Tauri 2 pour Windows** | Outils de build C++ de Visual Studio et runtime WebView2. |
| **osu!lazer** | Pour tester avec le vrai jeu (facultatif : l'éditeur et l'overlay fonctionnent avec des données simulées). |

Éditeur conseillé : VS Code avec les extensions **Tauri** et **rust-analyzer** (recommandées par le dépôt).

```bash
npm install
npm run tauri dev
```

`npm run tauri dev` compile le Rust, lance Vite sur le port `1420` et ouvre l'application. La première
compilation est longue ; les suivantes sont incrémentales.

> [!SCREENSHOT] dev-terminal
> Terminal avec `npm run tauri dev` en cours (lignes de compilation Rust, « VITE ready » et l'URL locale) et, à côté, la
> fenêtre de l'application qui vient de s'ouvrir.

### Développer l'interface sans le jeu

```bash
npm run dev
```

Puis ouvre `http://localhost:1420/` dans un navigateur : l'interface tourne avec de **fausses données**
animées (`src/lib/mock.ts`), sans Tauri. Utile pour l'éditeur et les widgets :

- `http://localhost:1420/?tab=editor` : directement l'éditeur ;
- `http://localhost:1420/?bg=1#overlay` : l'overlay sur un fond de substitution.

> [!SCREENSHOT] browser-editor
> Navigateur sur `http://localhost:1420/?tab=editor` : l'éditeur complet avec les données simulées animées, et l'URL
> visible dans la barre d'adresse.

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run tauri dev` | Application complète en développement. |
| `npm run dev` | Interface seule, dans le navigateur. |
| `npm test` | Tests de l'interface (Vitest). |
| `npx tsc --noEmit` | Vérification des types TypeScript. |
| `npm run build` | Vérification des types puis build du front. |
| `cargo test --workspace` | Tests Rust. |
| `cargo clippy --workspace --all-targets` | Lints Rust. |
| `npm run tauri build` | Paquet de l'application. |

## Conventions

### Rust

- **Lecture seule, toujours** : n'ouvre jamais le processus du jeu avec des droits d'écriture, n'injecte
  rien, ne simule aucune entrée.
- Le workspace avertit sur `unwrap` et `expect` (`clippy::unwrap_used`, `expect_used`) et refuse
  `unsafe_op_in_unsafe_fn` : gère les erreurs avec `Result` ; si un `expect` est justifié, utilise
  `#[expect(..., reason = "...")]`. Les tests peuvent utiliser `unwrap`.
- Pas de décalages en octets dans les profils (`profile.rs`) : seulement des noms de champs et de types.

### TypeScript / React

- Les types TypeScript sont stricts ; `npx tsc --noEmit` doit passer.
- Les widgets lisent le store avec un **sélecteur étroit** (`useReaderStore((s) => ...)`) pour ne
  se redessiner que quand leur donnée change.
- Le format du layout est défini dans `src/overlay/layout.ts` ; toute évolution doit rester
  **rétrocompatible** (`migrateLayout` lit les anciens documents).
- L'état de l'éditeur est dans `src/editor/useEditor.ts` ; la géométrie (alignement, espacement,
  magnétisme) est du code pur dans `src/editor/geometry.ts`, testé.
- Respecte le style de l'interface existante (composants de `src/editor/fields.tsx`, icônes de
  `src/components/Icon.tsx`).

### Traductions

Toute chaîne visible passe par `src/i18n`. `fr.ts` et `en.ts` doivent avoir **exactement les mêmes
clés** (le type `Messages` et un test le vérifient). Ajoute la clé dans les deux fichiers.

### API

L'API est un contrat public (`/api/v1`) : ajouter un champ est sans risque ; retirer ou changer le sens
d'un champ est un changement cassant. Toute modification de l'API met à jour les quatre pages de la documentation
([Guide](API.md), [Routes REST](REST_API.md), [WebSocket](WEBSOCKET.md) et [Modèle de données](DATA_MODEL.md)), qui sont aussi
servies par l'application sur `/api/v1/docs`, et le miroir `src/lib/types.ts`.

Pour essayer l'API (ou développer un client) **sans osu!**, lance le serveur d'exemple : il rejoue une fausse partie, avec ses
touches, ses événements et un fond d'écran, sur toutes les routes.

```bash
cargo run -p overlay-server --example sample
```

Il écoute sur le port `24051` (arrête d'abord l'application) ; `cargo run -p overlay-server --example sample -- 24099 idle` choisit
un autre port et simule un jeu non lancé.

### Documentation

Cette documentation est un ensemble de fichiers Markdown dans `docs/`, affichés dans l'onglet
**Documentation**. Voir [Écrire la documentation](#écrire-la-documentation).

## Ajouter un widget intégré

1. Crée le composant dans `src/widgets/` : il reçoit `{ instance }` et lit ce dont il a besoin avec un
   sélecteur `useReaderStore((s) => ...)`. Les fonctions `fontSizeFor`, `animationMsFor` et
   `AnimatedNumber` donnent une taille de texte et des chiffres animés cohérents avec les autres widgets.
2. Ajoute-le à la liste exportée du fichier (`BASIC_WIDGETS`, `INFO_WIDGETS`, `PLAYER_WIDGETS`…) avec son
   `type`, la clé de traduction de son nom (`widget.<type>`) et sa taille par défaut.
3. Range-le dans une catégorie de la palette (`WIDGET_CATEGORIES` dans `src/widgets/registry.ts`) et
   donne-lui une icône dans `src/editor/widgetIcons.ts`.
4. Ajoute le nom dans `fr.ts` et `en.ts`.
5. Documente-le dans [Widgets intégrés](BUILTIN_WIDGETS.md).

Si le widget a besoin d'une donnée que le reader ne publie pas encore, commence par l'ajouter côté
`lazer-reader` (modèle `model.rs`, lecture dans `readers.rs`/`session.rs`), puis dans `src/lib/types.ts`
et dans [API locale](API.md).

## Images et sons d'osu!lazer

Les textures d'osu!lazer sont dans `public/Textures/` (logo, icônes, drapeaux, médailles, fonds, curseurs, avatar
invité) et les sons de l'interface dans `public/Samples/UI/`. Ce sont des URL simples : rien n'est importé dans le bundle.

- **Chemins** : passe par `src/lib/assets.ts` (`LOGO_URL`, `GUEST_AVATAR_URL`, `rulesetIconUrl`, `flagUrl`,
  `menuBackgroundUrl`) et `src/lib/mods.ts` (`modIconUrl`) plutôt que d'écrire un chemin à la main. Un test vérifie que
  les fichiers existent.
- **Fonds** : un fond est décoratif, sombre, flou et chargé en différé (`<Backdrop>` : `loading="lazy"`,
  `decoding="async"`, fondu à l'arrivée). Les fonds de menu sont des **webp** de moins de 20 Ko ; leurs originaux jpg
  (1 Mo chacun) sont gardés hors du build, dans `assets-src/menu/`. **Aucun fond dans l'overlay en jeu** par défaut.
- **Images dans un widget** : toujours `decoding="async"`, une taille fixe, et un repli (`onError`) comme pour l'avatar.
- **Icônes** : l'interface garde un seul jeu d'icônes, `<Icon name="…" />` (`src/components/Icon.tsx`) ; les textures
  servent aux images qui *représentent* quelque chose du jeu (mode, mod, pays, avatar).
  - Quand une icône d'osu!lazer (`public/Textures/icons/`) a le bon sens, `Icon` l'utilise : le PNG blanc sert de
    **masque CSS** sur `currentColor`, donc couleur, taille et états (survol, désactivé, accent) viennent du texte
    autour, comme pour un SVG. Sinon l'icône SVG reste (ne force pas un mauvais sens).
  - **Ajouter ou mapper une icône osu** : une ligne dans `OSU_ICONS` (`src/components/osuIcons.ts`), `nom: icon("fichier", ext)`
    (chemin sous `Textures/icons/` sans `.png`). Un nom déjà présent dans les chemins SVG est remplacé (supprime alors le
    SVG devenu mort) ; un nouveau nom devient un nouveau nom d'icône. `ext` est la part du carré que le dessin remplit
    sur son grand côté, en % (une croix seule ≈ 50, un cercle ≈ 90 : mesure-le) ; `Icon` met chaque dessin à la même
    taille visuelle. `flip` retourne l'image. Le test `osuIcons.test.ts` vérifie que le fichier existe.
  - Les images sont préchargées à l'inactivité et un `Icon` reste invisible (mais garde sa place) tant que son PNG n'est
    pas là. N'utilise pas d'icône osu dans l'overlay en jeu sans raison : ses widgets gardent les SVG, plus légers.
  - Un geste au survol (`iconGestures.ts`) marche sur les deux sortes d'icônes.

### Sons de l'interface

`src/lib/sfx.ts` joue les sons avec l'API Web Audio : un seul `AudioContext`, des buffers décodés à la première
utilisation puis gardés, un nombre de voix limité, un volume maître. Rien ne sonne avant le premier clic ou la
première touche (politique d'autoplay), et **jamais dans l'overlay en jeu**.

`src/lib/uiSounds.ts` (installé une fois par `App`, via `useUiSounds()`) donne à chaque élément **le son que lui
donne osu!lazer**, avec quelques écouteurs sur le document : un composant n'a rien à faire pour avoir le son standard.

**Règles reprises de lazer** : un contrôle joue `<set>-hover` à l'arrivée du pointeur et `<set>-select` au clic (clic
gauche) ; un set sans échantillon propre utilise celui de `default`. Le survol est limité globalement (20 ms), absent
quand un bouton de la souris est enfoncé (défilement, glisser) et pour un contrôle désactivé ; cliquer un contrôle
désactivé joue `<set>-select-disabled`. Le survol varie de ±2 % de hauteur, le clic de ±1 %. Un curseur joue
`notch-tick` seulement quand la valeur change (30 ms au plus), plus aigu avec la valeur.

| Élément de YAR | Équivalent lazer (`HoverSampleSet`) | Survol | Clic |
| --- | --- | --- | --- |
| Bouton avec texte (Appliquer, Tester, Annuler…) | `OsuButton` : `Button` | `button-hover` | `button-select` |
| Bouton sans texte (icône : copier, barre d'outils de l'éditeur, panneaux) | `OsuClickableContainer` : `Default` | `default-hover` | `default-select` |
| Bouton OK d'un dialogue (accent) | `PopupDialogOkButton` : `DialogOk` | `default-hover` (pas de `dialog-ok-hover`) | `dialog-ok-select` |
| Bouton Annuler / fermer d'un dialogue | `PopupDialogCancelButton` : `DialogCancel` | `default-hover` | `dialog-cancel-select` |
| Bouton dangereux d'un dialogue (rouge) | `PopupDialogDangerousButton` | `button-hover` | `dialog-dangerous-select` |
| Onglets (fenêtre, pages de layout) | `OsuTabControl` : `TabSelect` | `default-hover` (pas de `tabselect-hover`) | `tabselect-select` (seulement si l'onglet change) |
| Interrupteurs, cases à cocher | `OsuCheckbox` : `HoverSounds` + sons d'état | `default-hover` | `check-on` / `check-off` |
| Curseurs | `OsuSliderBar` | aucun | `notch-tick` à chaque changement de valeur |
| En-tête d'une liste déroulante | `OsuDropdownHeader` : `HoverSounds` | `default-hover` | aucun (la liste qui s'ouvre joue `dropdown-open`) |
| Liste déroulante (ouverture / fermeture) | `OsuDropdownMenu` | | `dropdown-open` / `dropdown-close` |
| Option d'une liste, entrée de menu | `HoverClickSounds` : `Default` | `default-hover` | `default-select` |
| Menu contextuel (ouverture / fermeture) | `OsuContextMenu` / `OsuMenu` | | `menu-open-select` / `menu-close` |
| Dialogue (ouverture / fermeture) | `DialogOverlay` | | `dialog-pop-in` / `dialog-pop-out` |
| Liste de pages de la documentation (`data-sfx="sidebar"`) | `SidebarButton` : `ButtonSidebar` | `button-sidebar-hover` | `button-sidebar-select` |
| Notification (mise à jour disponible / téléchargée / en échec) | `Notification` | | `notification-default` / `notification-done` / `notification-error` |
| Toast d'erreur de l'éditeur (`role="alert"` + classe `toast`) | `SimpleErrorNotification` | | `notification-error` à l'arrivée, `overlay-pop-out` au départ |
| Erreur en ligne (`role="alert"`) | (pas d'équivalent trouvé) | | `generic-error` |
| Boutons « monter / descendre » d'un calque (`data-sfx="swap"`) | réordonner | `button-hover` | `item-swap` |
| Retour (`data-sfx="back"`) | `OsuScreen` à la sortie | `button-hover` | `screen-back` |

Sources : `osu.Game/Graphics/UserInterface/` (`HoverSampleSet.cs`, `HoverSounds.cs`, `HoverClickSounds.cs`,
`HoverSampleDebounceComponent.cs`, `OsuButton.cs`, `OsuCheckbox.cs`, `OsuTabControl.cs`, `OsuDropdown.cs`,
`OsuSliderBar.cs`, `OsuMenu.cs`, `OsuContextMenu.cs`, `OsuMenuSamples.cs`), `Overlays/Dialog/PopupDialog*.cs`,
`Overlays/DialogOverlay.cs`, `Overlays/Notifications/*.cs`, `Overlays/Settings/SidebarButton.cs`,
`Screens/OsuScreen.cs` dans <https://github.com/ppy/osu>. Pas utilisés par YAR : les échantillons `toolbar-*`,
`noclick-*`, `osd-*`, `metronome-*`, `shutter`, `wave-*`, `bss-*` (lazer ne les appelle plus ou pour des
fonctions que YAR n'a pas), et `ruleset-select-*` (YAR n'a pas de sélecteur de mode).

Pour choisir à la main, un contrôle ou son conteneur reçoit `data-sfx` (`none`, `default`, `button`, `sidebar`, `ok`,
`cancel`, `danger`, `back`, `swap`), ou un composant joue un son précis :

```tsx
<nav data-sfx="sidebar">…</nav>
```

```ts
import { playSfx } from "../lib/sfx";
playSfx("check-on");                                   // par son nom (`SFX_NAMES`)
```

Les réglages (activé, volume) sont dans **Réglages → Général**, gardés dans le `localStorage` de la fenêtre
(`yar.sfx`) : c'est une préférence d'interface, pas un réglage du reader.

## Créer un widget communautaire

Pas besoin de toucher au code de l'application : voir [Widgets communautaires](WIDGETS.md). Pour le
partager avec tout le monde, publie le dossier dans un dépôt.

## Écrire la documentation

- Les pages sont les fichiers `docs/*.md`, en français, dans un Markdown standard (titres, listes,
  tableaux, blocs de code, liens).
- Pour **lier une autre page**, utilise son nom de fichier : `[Éditeur](EDITOR.md)` ou, avec une
  section, `[Groupes](EDITOR.md#groupes)`. Pour une section de la même page : `[texte](#titre-de-la-section)`
  (le titre en minuscules, les espaces remplacés par des tirets).
- Pour **ajouter une page** à la navigation, déclare-la dans `src/docs/pages.ts` (identifiant, titre,
  section de la barre latérale, fichier importé en `?raw`).
- Les quatre pages de l'API (`API.md`, `REST_API.md`, `WEBSOCKET.md`, `DATA_MODEL.md`) sont aussi compilées dans le serveur
  (`include_str!`) et servies bout à bout sur `/api/v1/docs` : leurs liens entre pages sont réécrits en liens internes. Chaque
  route REST y a sa section avec un exemple d'utilisation et un exemple de réponse, et chaque message WebSocket son exemple : un
  test (`src/docs/docs.test.ts`) le vérifie à partir des routes du serveur.
- Évite les liens externes : l'application n'ouvre pas de navigateur.

## Signaler un bug

Ouvre un ticket avec :

1. ce que tu as fait, ce que tu attendais, ce qui s'est passé ;
2. la **version d'osu!lazer** (onglet **Statut**, carte *Connexion*) et celle de l'application (`version` de `package.json`) ;
3. le message d'erreur du **Statut** s'il y en a un ;
4. pour un problème d'affichage : le layout concerné (**Exporter…** dans l'éditeur) et le mode d'affichage du
   jeu (fenêtré, sans bordure, plein écran exclusif).

## Proposer une modification

1. Fais une branche à partir de `main`, nommée `type/description-courte` (`feat/menu-clic-droit`, `fix/replay-touches`,
   `docs/mises-a-jour`…). Les types sont ceux des commits : `feat`, `fix`, `perf`, `docs`, `refactor`, `test`, `build`,
   `ci`, `chore`, `security`.
2. Garde les changements **petits et ciblés** : une idée par modification.
3. Avant de proposer : `npx tsc --noEmit`, `npm test`, et pour le Rust `cargo clippy --workspace` et
   `cargo test --workspace`.
4. Décris ce qui change **et pourquoi**, avec une capture d'écran pour toute modification visuelle.
5. Mets à jour la documentation concernée dans la même modification.

## Le titre de la pull request

Le dépôt fusionne en *squash* : **le titre de la pull request devient le message du commit** puis une ligne des
notes de version. Il suit [Conventional Commits](https://www.conventionalcommits.org/fr/) :
`type(portée): ce qui change`, en minuscules : `fix(reader): suit les replays`. Un `!` marque un changement
incompatible : `feat(api)!: renomme un champ`. Le type donne le label de la pull request (une vérification le fait),
les fichiers modifiés donnent les labels `area:`.

La CI (**Frontend**, **Rust (Windows)**, **Conventional title**, **Secret scan**) doit passer avant la fusion.

## Publier une version

Réservé aux mainteneurs : voir le guide [`.github/RELEASING.md`](https://github.com/iSweat-exe/yet-another-reader/blob/main/.github/RELEASING.md)
(clés de signature, mises à jour automatiques, publication). Un seul numéro de version pour toute l'application :
`npm run version:check` vérifie qu'il est le même partout.

Le projet est sous licence **MIT** : en contribuant, tu acceptes que ta contribution soit publiée sous
cette licence.
