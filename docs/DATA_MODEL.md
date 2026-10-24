# Modèle de données

Le contenu des objets que l'API publie : ce que contient chaque champ, son type, ses valeurs possibles. Ce sont les
mêmes objets dans les [routes REST](REST_API.md) et dans les messages du [WebSocket](WEBSOCKET.md). Les noms de champs et
les valeurs d'énumérations listés ici sont stables dans `v1` ; de nouveaux champs peuvent apparaître : ignore ceux que tu
ne connais pas.

Les conventions communes (`camelCase`, `null`, unités) sont dans le [guide](API.md#conventions).

## `GameState` (`/state`)

| Champ | Type | Description |
| --- | --- | --- |
| `connected` | bool | `false` si osu!lazer n'est pas lisible. |
| `version` | string \| null | Version d'osu!lazer détectée. |
| `screen` | `Screen` | Écran visible, simplifié. |
| `screenType` | string | Type .NET complet de l'écran (précis, utile en cas de `other`). |
| `playing` | `PlayingState` | État de jeu de l'utilisateur. |
| `ruleset` | string \| null | Mode sélectionné : `osu`, `taiko`, `fruits`, `mania`. |
| `mods` | string[] | Acronymes des mods actifs (`HD`, `DT`, ...). En partie, ce sont ceux du joueur (ceux du score pour un replay). |
| `clockRate` | number | Vitesse de lecture réelle : `1.13` pour un DT réglé à 1,13x, `1` sans mod de vitesse. Le calcul des PP s'en sert. |
| `difficultyAdjust` | `DifficultyAdjust` \| null | Valeurs forcées par Difficulty Adjust : `cs`, `ar`, `od`, `hp` (`null` pour une stat laissée telle quelle). `null` sans ce mod. |
| `beatmap` | `Beatmap` \| null | Beatmap sélectionnée. |
| `difficulty` | `Difficulty` \| null | Étoiles et PP avec les mods. |
| `difficultyGraph` | `DifficultyGraph` \| null | La difficulté de la map tout au long de la chanson, avec les mods. `null` le temps du calcul (une fraction de seconde après le choix de la map) ou si le fichier `.osu` est introuvable. |
| `time` | `Time` \| null | Horloge de la chanson. |
| `user` | `User` \| null | Utilisateur connecté. |
| `spectators` | `Spectator[]` | Les utilisateurs qui regardent la partie du joueur connecté (100 au plus). Vide si personne ne regarde. |
| `spectatorCount` | int | Nombre de spectateurs (non plafonné). |
| `gameplay` | `Gameplay` \| null | Partie en cours. |
| `personalBest` | `PersonalBest` \| null | Le meilleur score de la beatmap sélectionnée vu par l'application (sans les `samples` ni `maxPp`). `null` avant le premier. N'est pas un topic du [WebSocket](WEBSOCKET.md#connexion). |

**`Screen`** : `unknown` · `menu` · `songSelect` · `playing` · `results` · `editor` ·
`multiplayer` · `other`

**`PlayingState`** : `notPlaying` · `break` (passage de break de la map) · `playing`

## `Beatmap`

| Champ | Type | Description |
| --- | --- | --- |
| `title`, `titleUnicode` | string | Titre (romanisé / original). |
| `artist`, `artistUnicode` | string | Artiste (romanisé / original). |
| `version` | string | Nom de la difficulté. |
| `creator` | string | Mapper. |
| `source`, `tags` | string | Source et tags. |
| `onlineId` | int | Id en ligne de la difficulté (`-1` si non publiée). |
| `setOnlineId` | int | Id en ligne du set (`-1` si non publié). |
| `status` | string | `graveyard`, `wip`, `pending`, `ranked`, `approved`, `qualified`, `loved`, `none`. |
| `ruleset` | string | Mode de la beatmap. |
| `md5` | string | MD5 du fichier `.osu`. |
| `sha256` | string | SHA-256 du fichier `.osu` (identifiant stable de la beatmap). |
| `lengthMs` | number | Durée. |
| `bpm` | number | BPM principal. |
| `starRating` | number | Étoiles calculées par osu!lazer, **sans** les mods. |
| `cs`, `ar`, `od`, `hp` | number | Valeurs de base, **sans** les mods. |
| `sliderMultiplier`, `sliderTickRate` | number | Paramètres de sliders. |
| `objectCount` | int | Nombre d'objets. |
| `previewTimeMs` | int | Point d'aperçu (`-1` si absent). |
| `audioFile`, `backgroundFile` | string | Noms de fichiers dans le set. |
| `paths` | `{ beatmap, background, audio }` | **Chemins locaux absolus** des fichiers dans le stockage d'osu!lazer (`null` si introuvable). Voir ci-dessous. |
| `assets` | `{ background, audio }` | Les fichiers sont-ils téléchargeables via `/assets/...` ? |

### Chemins locaux (`beatmap.paths`)

osu!lazer range ses fichiers par contenu : `<dossier de données>\files\<1er car.>\<2 premiers car.>\<sha256>`.
Les chemins sont **absolus** et directement utilisables dans un design, un `<img>` en `file://`, un
script, etc. Attention : le fichier stocké **n'a pas d'extension** ; son type est celui de
`backgroundFile` / `audioFile` (`.jpg`, `.mp3`, ...). Certains outils exigent l'extension : utilise
alors l'URL `/api/v1/assets/background` (le bon `Content-Type` est fourni) ou copie le fichier.

> [!SCREENSHOT] storage-folders
> Explorateur de fichiers sur `%APPDATA%\osu\files` : un dossier à un caractère (`1`), son sous-dossier à deux
> caractères (`1f`) et à l'intérieur un fichier au nom de 64 caractères sans extension. Annoter les trois niveaux « 1er
> car. », « 2 premiers car. », « sha256 ».

```js
const { background } = state.beatmap.paths;
if (background) img.src = "file:///" + background.replaceAll("\\", "/");
```

## `Difficulty`

Calculé par [rosu-pp](https://github.com/MaxOhn/rosu-pp) à partir du fichier `.osu`, **avec les
mods actifs**.

| Champ | Type | Description |
| --- | --- | --- |
| `stars` | number | Étoiles avec les mods. |
| `maxCombo` | int | Combo maximum. |
| `pp95`, `pp98`, `pp99`, `pp100` | number | PP pour une précision de 95 / 98 / 99 / 100 %. |
| `firstObjectMs` | number | Temps (ms, dans la chanson) du premier hit object : le « 0:00 » d'un chrono qui ignore l'intro. |
| `lastObjectMs` | number | Temps (ms) du dernier hit object : la fin de ce chrono (l'outro n'est pas comptée). |

## `DifficultyGraph`

La difficulté de chaque partie de la beatmap, **relative au reste de la même map** : sert à tracer une frise (barres basses =
passages calmes, barres hautes = passages denses). Calculée une seule fois par beatmap, mods et vitesse (hors du thread de
lecture), à partir des objets du fichier `.osu` : un « effort » qui monte avec la vitesse de frappe et la distance entre
les objets, et retombe pendant les pauses. Les mods qui changent la vitesse (DT, HT, vitesse réglée) ou la taille des cercles
(HR, EZ, Difficulty Adjust) sont pris en compte.

| Champ | Type | Description |
| --- | --- | --- |
| `durationMs` | number | Durée de chanson couverte par `buckets`, en millisecondes : le bucket `i` commence à `i × durationMs / buckets.length`. |
| `overall` | number | La **difficulté globale** : les étoiles avec les mods (même valeur que `difficulty.stars`). |
| `peakMs` | number | Moment de la chanson, en millisecondes, du passage le plus dur. |
| `buckets` | number[] | 120 valeurs de `0` (le passage le plus calme) à `1` (le plus dur de **cette** map), arrondies à 3 décimales. Deux maps ne se comparent pas bucket à bucket : utilise `overall` pour cela. |

## `Time`

| Champ | Type | Description |
| --- | --- | --- |
| `currentMs` | number | Position dans la chanson (négative pendant l'intro). |
| `running` | bool | `false` en pause. |
| `source` | `global` \| `gameplay` | Horloge utilisée. |

Pour une barre de progression : `currentMs / beatmap.lengthMs` (borné à `0..1`).

## `User`

| Champ | Type | Description |
| --- | --- | --- |
| `id` | int | Id osu!. |
| `username` | string | Pseudo. |
| `countryCode` | string | Code pays (`FR`). |
| `avatarUrl` | string | URL de l'avatar (hébergé par osu!). |
| `apiState` | string | `offline`, `failing`, `requiresSecondFactorAuth`, `connecting`, `online`. |
| `statistics` | objet \| null | Statistiques du mode principal, telles que synchronisées par le jeu. |

`statistics` : `globalRank` (int \| null), `countryRank` (int \| null), `pp` (number \| null),
`accuracy` (0–100), `playCount`, `totalHits`, `maxCombo`, `rankedScore`, `totalScore`.

> Ces champs identifient l'utilisateur. L'API n'est accessible que depuis cette machine, mais
> évite de les afficher à l'écran si tu partages ton stream sans le vouloir.

## `Spectator`

Un élément de `spectators` : un utilisateur qui regarde la partie du joueur connecté (lu dans le client de
spectateur d'osu!lazer ; la liste est vide hors connexion ou si personne ne regarde).

| Champ | Type | Description |
| --- | --- | --- |
| `id` | int | Id osu!. |
| `username` | string | Pseudo. |
| `avatarUrl` | string (optionnel) | `https://a.ppy.sh/{id}` ; absent sans compte valide. Charger cette adresse est un accès Internet. |

## `Gameplay`

| Champ | Type | Description |
| --- | --- | --- |
| `score` | int | Score total (avec le multiplicateur de mods). |
| `scoreWithoutMods` | int | Score sans multiplicateur. |
| `accuracy` | number | `0.0`–`1.0`. |
| `combo` | int | Combo actuel. |
| `maxCombo` | int | Meilleur combo de la partie. |
| `beatmapMaxCombo` | int | Combo maximum possible sur la map. |
| `rank` | string | Rang actuel : `F`, `D`, `C`, `B`, `A`, `S`, `SH`, `SS`, `SSH`. |
| `hits` | `{ great, ok, meh, miss }` | Compteurs classiques 300 / 100 / 50 / miss. |
| `results` | objet | **Tous** les compteurs de jugements par nom (voir ci-dessous). |
| `health` | number | Santé, `0.0`–`1.0`. |
| `paused` | bool | Partie en pause. |
| `failed` | bool | Partie échouée. |
| `pp` | `Pp` \| null | PP, voir ci-dessous. |
| `unstableRate` | number \| null | UR (10 × écart-type des erreurs de timing). `null` avant 2 hits. |
| `hitErrors` | number[] | Les 128 dernières erreurs de timing en ms, de la plus ancienne à la plus récente. Négatif = trop tôt, positif = trop tard. |

`hits.great` regroupe `Great` + `Perfect`, `hits.ok` regroupe `Ok` + `Good`.

`results` : clés possibles (seules celles ayant au moins une occurrence sont présentes) :
`None`, `Miss`, `Meh`, `Ok`, `Good`, `Great`, `Perfect`, `SmallTickMiss`, `SmallTickHit`,
`LargeTickMiss`, `LargeTickHit`, `SmallBonus`, `LargeBonus`, `IgnoreMiss`, `IgnoreHit`,
`ComboBreak`, `SliderTailHit`, `LegacyComboIncrease` (et `Result<n>` pour une valeur inconnue).

## `PersonalBest`

Le meilleur score **terminé en solo** de la beatmap sélectionnée, tel que l'application l'a vu (les parties jouées avant qu'elle tourne sont inconnues ; un replay, une partie échouée ou quittée ne compte jamais ; il faut un score strictement supérieur pour le remplacer). Dans `GameState`, il n'a ni `samples` ni `maxPp` ; [`GET /personal-best`](REST_API.md#get-personal-best) les ajoute.

| Champ | Type | Description |
| --- | --- | --- |
| `score` | int | Score final (avec le multiplicateur de mods). |
| `pp` | number | PP à la fin de la partie (`0` s'ils n'ont pas pu être calculés). |
| `accuracy` | number | `0.0`–`1.0`. |
| `maxCombo` | int | Meilleur combo de la partie. |
| `mods` | string[] | Acronymes des mods de la partie. |
| `playedAt` | int | Fin de la partie, en millisecondes depuis l'epoch Unix. |
| `samples` | number[][] | Seulement sur `GET /personal-best` : `[tempsDeLaChansonMs, score, pp, précision]`, environ un par seconde de chanson, dans l'ordre du temps. |
| `maxPp` | number | Seulement sur `GET /personal-best` : le plus haut PP d'une partie solo terminée de la beatmap vue par l'application, même si son score est plus bas que celui du record (au moins `pp`). |

## PP et étoiles

| Champ | Signification |
| --- | --- |
| `pp.live` | PP de la partie **jusqu'à maintenant**. |
| `pp.fc` | PP si tu continues à ta précision actuelle **sans nouveau miss** (estimation « FC »). |
| `pp.ss` | PP d'une partie parfaite sur cette map avec les mods actifs. |

Les calculs viennent de la branche `pp-update` de rosu-pp, qui suit les formules récentes
d'osu!. Ils sont **approximatifs en partie** : les ticks et fins de slider ne sont pas transmis au calcul,
ils sont estimés. Le mode « Classic » (mod `CL`) active le scoring stable. Une vitesse
personnalisée de DT/HT n'est pas prise en compte.
