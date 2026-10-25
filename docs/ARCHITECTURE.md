# Architecture

Vue d'ensemble pour comprendre comment l'application est construite, avant de la modifier
([Contribuer](CONTRIBUTING.md)).

## En une phrase

Un thread lit périodiquement la mémoire d'osu!lazer, en **lecture seule**, et en tire un `GameState`
qui est publié à trois destinataires : les fenêtres de l'application (événements Tauri), l'API locale
(HTTP/WebSocket) et le module RTSS.

> [!SCREENSHOT] architecture-diagram
> Schéma (pas une capture) : osu!lazer à gauche, une flèche « lecture seule » vers la boîte lazer-reader, puis le thread
> de lecture (src-tauri) au centre qui se divise en trois flèches vers : fenêtres de l'application (événements Tauri),
> Hub / API locale (REST, WebSocket, widgets), module RTSS. Deux cadences annotées : « état 33 ms » et « touches 2 ms ».

```
osu!lazer ──lecture seule──▶ lazer-reader ──GameState──▶ thread « lazer-reader » (src-tauri)
                                                              │
              ┌───────────────────────────────────────────────┼───────────────────────────┐
              ▼                                               ▼                           ▼
      événements Tauri                                 Hub (overlay-server)           module RTSS
   (fenêtre principale + overlay)                     REST / WebSocket / widgets      (texte via RTSS)
```

## Les trois parties

Le dépôt est un workspace Cargo (`Cargo.toml`) plus une interface React.

| Dossier | Rôle | Langage |
| --- | --- | --- |
| `crates/lazer-reader` | Lire osu!lazer et produire un `GameState`. Aucune dépendance à Tauri. | Rust |
| `crates/overlay-server` | L'API locale : REST, WebSocket, widgets communautaires, documentation de l'API. | Rust (axum) |
| `src-tauri` | L'application : thread de lecture, réglages, layouts, fenêtre d'overlay, RTSS, raccourci global, commandes Tauri. | Rust (Tauri 2) |
| `src` | L'interface : onglets, éditeur, rendu de l'overlay, widgets, traductions. | TypeScript, React 19 |
| `docs` | Cette documentation (aussi affichée dans l'application) et l'exemple de widget. | Markdown |

### `crates/lazer-reader`

- **Contrat de sécurité** : le processus n'est ouvert qu'avec des droits de **lecture**. Rien n'écrit dans
  la mémoire du jeu, n'injecte de code ou ne simule d'entrée.
- `process`, `clr`, `dac` : accès au processus, à son runtime .NET et à ses métadonnées.
- `version`, `profile` : détection de la version exacte du jeu à chaque connexion, et **noms** des champs
  suivis. Le profil ne contient jamais de décalages en octets : ils sont **résolus depuis le jeu en
  cours**, donc un profil ne change que si osu! renomme un champ.
- `session` : se rattache au jeu, retrouve l'objet racine une seule fois (analyse de la mémoire), puis
  chaque instantané ne suit que quelques pointeurs.
- `readers` : beatmap, mods, temps, utilisateur ; `pp` : calcul des PP (rosu-pp) ; `graph` : la difficulté de la map tout au long de la chanson (frise), calculée sur son propre thread (le dernier choix gagne, résultats gardés par map, mods et vitesse) ; `events` : détection
  des événements (changement d'écran, début de partie, et par note : `hit`, `miss`, `comboBreak`) ; `model` : les types publiés
  (`GameState`, `Beatmap`, `Gameplay`, `PersonalBest`…, sérialisés en `camelCase`).
- `input` : les touches et boutons de souris tenus, lus dans l'état d'entrée du jeu
  (`InputState` d'osu!framework). Le chemin est dans le profil ; la lecture mémorise les adresses et ne
  coûte que quelques lectures : elle peut tourner des centaines de fois par seconde.
- `window` : localisation de la fenêtre du jeu (pour l'overlay).

### `crates/overlay-server`

- `hub` : état partagé entre le producteur (le thread de lecture) et les consommateurs. Un canal de
  diffusion alimente les WebSocket ; un client trop lent reçoit un état frais plutôt qu'un retard. Le hub garde aussi le record de la beatmap avec ses échantillons (`ghost`, servi sur `/personal-best`).
- `routes` : les endpoints REST et la documentation (les quatre pages `docs/API.md`, `REST_API.md`, `WEBSOCKET.md` et
  `DATA_MODEL.md` y sont incluses à la compilation, mises bout à bout, et servies sur `/api/v1/docs`).
- `ws` : les WebSocket : l'état (sujets, événements, reconnexion), les touches et les événements seuls (`/events/ws`, filtrés par `names`). `widgets` : les manifestes et fichiers des
  widgets communautaires. `images` : les images importées pour le widget Image (vérification du type sur la
  signature, taille max, nom = hash du contenu, jamais de chemin fourni par l'appelant), servies sur
  `/api/v1/images/{id}` ; les commandes Tauri `import_image`, `list_images` et `delete_image` (`src-tauri/src/images.rs`)
  les écrivent dans `<config>/images`.

### `src-tauri`

- `reader` : le thread de lecture, qui a **deux cadences** : l'état de la partie toutes les `pollIntervalMs`
  et les touches toutes les `inputPollIntervalMs` (2 ms), ces dernières **seulement si quelqu'un les écoute**
  (`Hub::inputs_wanted` : un WebSocket, une fenêtre de l'application, ou une requête REST récente).
  Hors partie, sans client WebSocket d'état, la lecture se ralentit (état ≥ 100 ms, touches ≥ 8 ms) ; les champs lents (mods, ruleset) ne sont relus que quelques fois par seconde. Pendant la lecture des touches, l'application demande à Windows un timer de 1 ms.
- Les touches ont leur propre canal : `Hub::publish_inputs` ne diffuse qu'en cas de changement, vers
  `/api/v1/inputs/ws` et vers les fenêtres de l'application (événement Tauri `input-state`).
- La session contient des handles non `Send` : elle est créée et utilisée
  **uniquement** dans ce thread. `UiEmitter` limite la cadence des mises à jour vers les fenêtres
  (l'overlay à sa cadence réglée, les menus ~10 fois par seconde hors partie).
- `overlay` : la fenêtre d'overlay transparente, sans focus et traversée par les clics ; un thread suit la
  fenêtre du jeu et affiche ou masque l'overlay selon la page courante.
- `layout`, `settings` : persistance JSON (`overlays/<nom>.json`, `settings.json`) dans le dossier de
  configuration. Les layouts sont stockés comme du JSON opaque : le **format est défini côté TypeScript**
  (`src/overlay/model/layout.ts`), le Rust ne fait que lire, écrire et calculer le masque de pages.
- `records` : les records personnels. Le thread de lecture lui passe chaque état : pendant une partie solo il garde un échantillon par seconde, et à l'écran de résultats il remplace le record de la beatmap si le score est plus haut (`records/<sha256>.json`). Il remplit `personalBest` de l'état et le `ghost` du hub.
- `nowplaying` : un thread qui écrit `nowplaying.txt` et `cover.*` quand la map change (voir [Réglages](SETTINGS.md#now-playing)). `widgetwatch` : un thread qui sonde le dossier des widgets deux fois par seconde et prévient les fenêtres (événement Tauri `widgets-changed`) pour le [rechargement à chaud](WIDGETS.md#rechargement-à-chaud).
- `rtss` : pont vers RivaTuner (écriture d'un emplacement de texte dans sa mémoire partagée).
- `commands` : l'interface appelée par le front (`get_game_state`, `get_settings`, `set_settings`,
  `list_layouts`, `get_layout`, `save_layout`, `delete_layout`, `list_widgets`, `open_widgets_folder`…).
- `lib` : démarrage, raccourci global `Ctrl + Maj + O`, installation de l'exemple de widget au premier lancement.

### `src` (interface)

| Chemin | Contenu |
| --- | --- |
| `main.tsx` | Point d'entrée : `#overlay` charge l'overlay, sinon l'application. |
| `App.tsx` | Les onglets (Statut, Réglages, Éditeur, Documentation). |
| `lib/store.ts` | Le store (zustand) alimenté par les événements Tauri ; `lib/mock.ts` fournit de fausses données dans un navigateur simple. |
| `lib/types.ts` | Miroir TypeScript du JSON de l'API. |
| `lib/layoutBundle.ts`, `lib/layoutShare.ts` | Le partage de layouts : fichier `.yarlayout` et code `yar1:`. |
| `overlay/` | Rendu de l'overlay : `layout.ts` (format, ancrages, migration, préréglages), `pages.ts`, canevas, chiffres animés. |
| `widgets/` | Les widgets intégrés et leur registre (`registry.ts`). |
| `editor/` | L'éditeur : état (`useEditor.ts`, historique, groupes, espacement), géométrie (`geometry.ts`), canevas, propriétés, calques. |
| `docs/` | L'onglet Documentation. |
| `i18n/` | Les traductions `fr` et `en`. |

## Les données, du jeu à l'écran

1. Le thread de lecture échantillonne le jeu toutes les `pollIntervalMs` millisecondes.
2. Le `GameState` est publié dans le `Hub` **seulement s'il a changé** (c'est ce qui limite le trafic WebSocket).
3. Le même état est émis aux fenêtres Tauri (`game-state`), où le store de `src/lib/state/store.ts` le reçoit.
4. Les widgets lisent le store avec des sélecteurs fins : seuls ceux dont la donnée change sont redessinés.

Les widgets **communautaires** ne passent pas par le store : ils tournent dans une iframe isolée et lisent
l'API locale comme n'importe quel client.

## Frontière de plateforme

Tout ce qui parle à Windows vit dans un dossier `platform/`, et le reste du code ne nomme jamais un système :

- `crates/lazer-reader/src/platform/` : `windows/` (processus, DAC, fenêtre, version de fichier) et `unsupported/`
  (même surface, qui renvoie `ReaderError::Unsupported`). `types.rs` contient les données partagées, `paths.rs`
  les chemins par système.
- `src-tauri/src/platform/` : `windows.rs` (overlay au premier plan, timer 1 ms, priorité du thread, RTSS,
  raccourcis du navigateur) et `unsupported.rs`.

Pour porter l'application sur un autre système, il suffit de remplir le dossier `unsupported` correspondant
(ou un nouveau dossier), sans toucher à la logique du jeu. Le job CI « Rust (Linux check) » vérifie que ces
frontières compilent.

## Choix de conception à connaître

- **Lecture seule d'abord.** Toute évolution du reader doit respecter le contrat de sécurité ci-dessus.
- **Contrat d'API versionné** (`/api/v1`). Ajouter un champ n'est pas un changement cassant ; en retirer ou
  en changer le sens l'est (voir [API locale](API.md#conventions)).
- **Layouts ancrés** et mis à l'échelle sur la hauteur : un layout ne dépend pas de la résolution.
- **Peu de charge pour le jeu.** Les boucles chaudes du reader sont optimisées même en profil de
  développement, l'overlay n'est à l'écran que si nécessaire, la cadence de rafraîchissement est
  réglable.
