# Routes REST

Chaque route REST de l'application, une par une : à quoi elle sert, comment l'appeler, ce qu'elle répond
(des **réponses réelles**, obtenues en interrogeant le serveur), et comment elle échoue. Pour recevoir les
changements en direct, voir [WebSocket](WEBSOCKET.md). Pour le sens de chaque champ, voir le
[modèle de données](DATA_MODEL.md).

## En bref

| | |
| --- | --- |
| **Adresse** | `http://127.0.0.1:24051/api/v1` (le port se règle dans les [réglages](SETTINGS.md)) |
| **Réseau** | Uniquement `127.0.0.1` : jamais joignable depuis un autre appareil |
| **Méthode** | `GET` partout. Aucune route ne modifie le jeu ni l'application |
| **Format** | JSON UTF-8, clés en `camelCase`, sans authentification |
| **Cache** | `Cache-Control: no-store` sur toutes les réponses : toujours des données fraîches |
| **CORS** | Toutes les origines sont autorisées (`Access-Control-Allow-Origin: *`, requêtes préliminaires `OPTIONS` comprises) : une page `file://`, OBS ou un autre port peut appeler l'API |
| **Version** | `v1` dans l'URL. Ajouter un champ n'est pas un changement cassant, en retirer un l'est |

> [!IMPORTANT] L'API doit être **activée** dans les [réglages](SETTINGS.md). Si le port est déjà utilisé,
> l'erreur s'affiche dans l'onglet **Statut**.

Dans les exemples JavaScript de cette page, `API` vaut `"http://127.0.0.1:24051/api/v1"`.

> [!ASTUCE] Pour essayer toutes ces routes sans lancer osu!, démarre le serveur d'exemple :
> `cargo run -p overlay-server --example sample`. Il rejoue une fausse partie sur le port 24051 (arrête
> d'abord l'application). Voir [Contribuer](CONTRIBUTING.md).

> [!SCREENSHOT] sample-server
> Terminal après `cargo run -p overlay-server --example sample` : la ligne « sample API on http://127.0.0.1:24051/api/v1
> (Ctrl+C to stop) » ; à côté, un navigateur sur `http://127.0.0.1:24051/api/v1` affichant l'index JSON des routes.

## Toutes les routes

| Route | Réponse | Ce qu'elle donne |
| --- | --- | --- |
| [`GET /api/v1`](#get-apiv1) | objet | Index : version de l'API, liste des routes |
| [`GET /health`](#get-health) | objet | Sonde de vie |
| [`GET /status`](#get-status) | objet | État de la connexion à osu!lazer |
| [`GET /settings`](#get-settings) | objet | Intervalles de lecture et port (lecture seule) |
| [`GET /snapshot`](#get-snapshot) | objet | `seq` + statut + état complet, en un seul appel cohérent |
| [`GET /state`](#get-state) | objet | **Tout** l'état du jeu |
| [`GET /screen`](#get-screen) | objet | Écran courant et état de jeu |
| [`GET /beatmap`](#get-beatmap) | objet ou `null` | La beatmap sélectionnée |
| [`GET /difficulty`](#get-difficulty) | objet ou `null` | Étoiles et PP avec les mods actifs |
| [`GET /difficulty-graph`](#get-difficulty-graph) | objet ou `null` | Difficulté tout au long de la chanson (frise) |
| [`GET /mods`](#get-mods) | objet | Mods sélectionnés et mode de jeu |
| [`GET /time`](#get-time) | objet ou `null` | Position dans la chanson |
| [`GET /user`](#get-user) | objet ou `null` | Utilisateur connecté et ses statistiques |
| [`GET /gameplay`](#get-gameplay) | objet ou `null` | La partie en cours |
| [`GET /pp`](#get-pp) | objet ou `null` | PP en direct / en FC / en SS |
| [`GET /hit-errors`](#get-hit-errors) | objet | UR et dernières erreurs de timing |
| [`GET /inputs`](#get-inputs) | objet | Touches et boutons de souris tenus, **temps réel** |
| [`GET /assets/background`](#get-assetsbackground) | image | Fond d'écran de la beatmap |
| [`GET /assets/audio`](#get-assetsaudio) | audio | Fichier audio de la beatmap (`Range` supporté) |
| [`GET /images/{id}`](#get-imagesid) | image | Une image importée pour le widget Image |
| [`GET /widgets`](#get-widgets) | tableau | Manifestes des widgets communautaires |
| [`GET /docs`](#get-docs) | Markdown | La documentation de l'API |
| `GET /ws` | WebSocket | Flux de l'état : voir [WebSocket](WEBSOCKET.md#flux-de-létat) |
| `GET /inputs/ws` | WebSocket | Flux des touches : voir [WebSocket](WEBSOCKET.md#flux-des-touches) |

En dehors de `/api/v1`, [`GET /widgets/<dossier>/<fichier>`](#get-widgetsdossierfichier) sert les fichiers des
[widgets communautaires](WIDGETS.md).

Une route n'a **pas de variante avec `/` final** : `/api/v1/state/` répond `404`.

## Application et connexion

### `GET /api/v1`

L'index : la version de l'API et la liste de toutes les routes. Utile pour découvrir l'API depuis un navigateur.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1
```

```js
const index = await (await fetch(API)).json();
console.log(index.apiVersion, index.endpoints.length);
```

**Exemple de réponse** : `200`

```json
{
  "name": "yet-another-reader",
  "apiVersion": 1,
  "appVersion": "0.1.0",
  "websocket": "/api/v1/ws",
  "inputsWebsocket": "/api/v1/inputs/ws",
  "documentation": "/api/v1/docs",
  "endpoints": [
    {
      "path": "/api/v1/health",
      "description": "Liveness probe."
    },
    {
      "path": "/api/v1/status",
      "description": "Connection state of the reader."
    },
    {
      "path": "...",
      "description": "... une entrée par route ..."
    }
  ]
}
```

Les champs : `name`, `apiVersion` (le numéro du contrat, `1`), `appVersion` (la version de l'application), `websocket` et `inputsWebsocket` (les chemins des deux WebSockets), `documentation` et `endpoints` (chaque route avec sa `description`, en anglais).

### `GET /health`

Une sonde de vie : répond tant que l'application tourne, que le jeu soit lancé ou non.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/health
```

```js
const { ok, uptimeMs } = await (await fetch(`${API}/health`)).json();
```

**Exemple de réponse** : `200`

```json
{
  "ok": true,
  "uptimeMs": 4235
}
```

`uptimeMs` est la durée, en millisecondes, depuis le démarrage du serveur.

### `GET /status`

L'état de la connexion à osu!lazer.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/status
```

```js
const status = await (await fetch(`${API}/status`)).json();
if (status.phase !== "connected") console.log("osu!lazer pas prêt :", status.phase);
```

**Exemple de réponse** : `200`

```json
{
  "phase": "connected",
  "version": "2026.1005.0-lazer+9a10d935",
  "profile": "embedded default",
  "connectMs": 5200
}
```

| `phase` | Signification | Champs en plus |
| --- | --- | --- |
| `waiting` | osu!lazer n'est pas lancé | aucun |
| `connecting` | Jeu détecté, repérage des objets du jeu (quelques secondes) | aucun |
| `connected` | Lecture en cours | `version`, `profile`, `connectMs` (durée de la connexion) |
| `error` | Jeu lancé mais illisible | `message` |

Quand le jeu n'est pas lancé :

```json
{"phase": "waiting"}
```

Quand il est illisible :

```json
{ "phase": "error", "message": "root object is temporarily unreadable" }
```

### `GET /settings`

Les valeurs en vigueur, en lecture seule (elles se changent dans l'application).

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/settings
```

```js
const { pollIntervalMs, inputPollIntervalMs } = await (await fetch(`${API}/settings`)).json();
```

**Exemple de réponse** : `200`

```json
{
  "pollIntervalMs": 33,
  "inputPollIntervalMs": 2,
  "port": 24099
}
```

| Champ | Description |
| --- | --- |
| `pollIntervalMs` | Intervalle de lecture de l'état du jeu, en ms |
| `inputPollIntervalMs` | Intervalle de lecture des touches, en ms |
| `port` | Le port d'écoute de l'API |

## État du jeu

Ces routes lisent le même état, échantillonné toutes les `pollIntervalMs` ms et publié quand il change.
Un `null` n'est **pas** une erreur : la route répond `200` avec `null` quand la donnée n'existe pas.

### `GET /snapshot`

Statut et état en **un seul appel**, donc cohérents entre eux. `seq` augmente à chaque changement publié : compare-le à celui de ton appel précédent pour savoir si quelque chose a bougé.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/snapshot
```

```js
const { seq, status, state } = await (await fetch(`${API}/snapshot`)).json();
```

**Exemple de réponse** : `200`

```json
{
  "seq": 6,
  "updatedAt": 1792711593829,
  "status": {
    "phase": "connected",
    "version": "2026.1005.0-lazer+9a10d935",
    "profile": "embedded default",
    "connectMs": 5200
  },
  "state": {
    "connected": true,
    "screen": "playing",
    "...": "identique à GET /state"
  }
}
```

`updatedAt` est l'heure Unix, en millisecondes, du dernier changement. `state` est exactement la réponse de [`GET /state`](#get-state) (abrégée ici).

### `GET /state`

L'état complet du jeu : tout ce que l'application lit. C'est la route à appeler quand on ne sait pas quelle partie on veut.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/state
```

```js
const state = await (await fetch(`${API}/state`)).json();
if (state.gameplay) console.log(state.gameplay.score, state.gameplay.combo);
```

**Exemple de réponse** : `200`

```json
{
  "connected": true,
  "version": "2026.1005.0-lazer+9a10d935",
  "screen": "playing",
  "screenType": "osu.Game.Screens.Play.SoloPlayer",
  "playing": "playing",
  "ruleset": "osu",
  "mods": [
    "HD",
    "DT"
  ],
  "beatmap": {
    "title": "hyperpop luv <3",
    "titleUnicode": "hyperpop luv <3",
    "artist": "whyalive x Denya8",
    "artistUnicode": "whyalive x Denya8",
    "version": "collab expert",
    "creator": "Daycore",
    "source": "",
    "tags": "hyperpop electronic",
    "onlineId": 4859840,
    "setOnlineId": 2279931,
    "status": "ranked",
    "ruleset": "osu",
    "md5": "f29e9bcdd8e4ab1b4ff1e7b19fdc338a",
    "sha256": "25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
    "lengthMs": 69166.0,
    "bpm": 180.0,
    "starRating": 5.28,
    "cs": 4.4,
    "ar": 9.2,
    "od": 8.5,
    "hp": 5.0,
    "sliderMultiplier": 1.9,
    "sliderTickRate": 1.0,
    "objectCount": 327,
    "previewTimeMs": 19649,
    "audioFile": "audio.mp3",
    "backgroundFile": "1.jpg",
    "paths": {
      "beatmap": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\2\\25\\25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
      "background": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\4\\4c\\4c2a4cef18bc3b44a53cdb177b297ffddfff974161747d3eeb9b8343d3199019",
      "audio": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\6\\64\\64702a5cf236ade456609f44b8ca5f00916f8ac4a49396b773086503d150f432"
    },
    "assets": {
      "background": true,
      "audio": true
    }
  },
  "difficulty": {
    "stars": 7.4,
    "maxCombo": 348,
    "pp95": 250.0,
    "pp98": 290.0,
    "pp99": 310.0,
    "pp100": 340.0,
    "firstObjectMs": 3200.0,
    "lastObjectMs": 176400.0
  },
  "difficultyGraph": {
    "durationMs": 180000.0,
    "overall": 7.4,
    "peakMs": 174750.0,
    "buckets": [0.15, 0.158, 0.167, 0.175, 0.183, 0.192, 0.2, 0.208, 0.217, 0.225, 0.233, 0.242, 0.25, 0.258, 0.267, 0.275, 0.283, 0.292, 0.62, 0.563, 0.644, 0.714, 0.767, 0.796, 0.797, 0.772, 0.722, 0.653, 0.573, 0.61, 0.686, 0.747, 0.787, 0.8, 0.786, 0.746, 0.684, 0.608, 0.575, 0.655, 0.723, 0.773, 0.798, 0.795, 0.766, 0.713, 0.641, 0.56, 0.622, 0.696, 0.755, 0.79, 0.8, 0.781, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.6, 0.607, 0.613, 0.616, 0.625, 0.635, 0.644, 0.651, 0.653, 0.651, 0.658, 0.675, 0.688, 0.696, 0.696, 0.689, 0.689, 0.711, 0.73, 0.741, 0.741, 0.731, 0.715, 0.745, 0.77, 0.785, 0.787, 0.775, 0.753, 0.774, 0.807, 0.828, 0.834, 0.822, 0.796, 0.8, 0.84, 0.869, 0.88, 0.87, 0.843, 0.821, 0.87, 0.908, 0.926, 0.92, 0.892, 0.849, 0.895, 0.943, 0.97, 0.97, 0.943, 0.897]
  },
  "time": {
    "currentMs": 8000.0,
    "running": true,
    "source": "gameplay"
  },
  "user": {
    "id": 1,
    "username": "iSweat",
    "countryCode": "FR",
    "avatarUrl": "https://a.ppy.sh/1",
    "apiState": "online",
    "statistics": {
      "globalRank": 130103,
      "countryRank": 4120,
      "pp": 4696.0,
      "accuracy": 98.12,
      "playCount": 24511,
      "totalHits": 4200000,
      "maxCombo": 2210,
      "rankedScore": 9000000000,
      "totalScore": 21000000000
    }
  },
  "spectators": [
    { "id": 2, "username": "peppy", "avatarUrl": "https://a.ppy.sh/2" },
    { "id": 124493, "username": "Cookiezi", "avatarUrl": "https://a.ppy.sh/124493" },
    { "id": 4787150, "username": "mrekk", "avatarUrl": "https://a.ppy.sh/4787150" }
  ],
  "spectatorCount": 3,
  "gameplay": {
    "score": 15400,
    "scoreWithoutMods": 11200,
    "accuracy": 0.9871,
    "combo": 14,
    "maxCombo": 21,
    "beatmapMaxCombo": 348,
    "rank": "S",
    "hits": {
      "great": 14,
      "ok": 2,
      "meh": 0,
      "miss": 0
    },
    "results": {
      "Great": 14,
      "LargeTickHit": 15,
      "Miss": 0,
      "Ok": 2,
      "SliderTailHit": 45
    },
    "health": 0.94,
    "paused": false,
    "failed": false,
    "pp": {
      "live": 104.7,
      "fc": 156.7,
      "ss": 255.4
    },
    "unstableRate": 144.6,
    "hitErrors": [
      -3.78,
      -3.32,
      -1.24,
      4.5,
      8.1
    ]
  }
}
```

Les champs sont décrits dans le [modèle de données](DATA_MODEL.md#gamestate-state). Réponse quand osu!lazer n'est pas lancé (`connected` vaut `false`, tout le reste est vide) :

```json
{
  "connected": false,
  "version": null,
  "screen": "unknown",
  "screenType": "",
  "playing": "notPlaying",
  "ruleset": null,
  "mods": [],
  "beatmap": null,
  "difficulty": null,
  "difficultyGraph": null,
  "time": null,
  "user": null,
  "spectators": [],
  "spectatorCount": 0,
  "gameplay": null
}
```

### `GET /screen`

L'écran visible et l'état de jeu, sans le reste : de quoi savoir « où est le joueur ».

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/screen
```

```js
const { screen, playing } = await (await fetch(`${API}/screen`)).json();
```

**Exemple de réponse** : `200`

```json
{
  "connected": true,
  "screen": "playing",
  "screenType": "osu.Game.Screens.Play.SoloPlayer",
  "playing": "playing"
}
```

`screen` vaut `unknown`, `menu`, `songSelect`, `playing`, `results`, `editor`, `multiplayer` ou `other`. `playing` vaut `notPlaying`, `break` ou `playing`. Voir [`Screen` et `PlayingState`](DATA_MODEL.md#gamestate-state).

Jeu non lancé : {"connected": false, "screen": "unknown", "screenType": "", "playing": "notPlaying"}.

### `GET /beatmap`

La beatmap sélectionnée (celle qui est jouée pendant une partie).

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/beatmap
```

```js
const map = await (await fetch(`${API}/beatmap`)).json();
if (map) console.log(`${map.artist} - ${map.title} [${map.version}]`);
```

**Exemple de réponse** : `200`

```json
{
  "title": "hyperpop luv <3",
  "titleUnicode": "hyperpop luv <3",
  "artist": "whyalive x Denya8",
  "artistUnicode": "whyalive x Denya8",
  "version": "collab expert",
  "creator": "Daycore",
  "source": "",
  "tags": "hyperpop electronic",
  "onlineId": 4859840,
  "setOnlineId": 2279931,
  "status": "ranked",
  "ruleset": "osu",
  "md5": "f29e9bcdd8e4ab1b4ff1e7b19fdc338a",
  "sha256": "25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
  "lengthMs": 69166.0,
  "bpm": 180.0,
  "starRating": 5.28,
  "cs": 4.4,
  "ar": 9.2,
  "od": 8.5,
  "hp": 5.0,
  "sliderMultiplier": 1.9,
  "sliderTickRate": 1.0,
  "objectCount": 327,
  "previewTimeMs": 19649,
  "audioFile": "audio.mp3",
  "backgroundFile": "1.jpg",
  "paths": {
    "beatmap": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\2\\25\\25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
    "background": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\4\\4c\\4c2a4cef18bc3b44a53cdb177b297ffddfff974161747d3eeb9b8343d3199019",
    "audio": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\6\\64\\64702a5cf236ade456609f44b8ca5f00916f8ac4a49396b773086503d150f432"
  },
  "assets": {
    "background": true,
    "audio": true
  }
}
```

`null` quand aucune beatmap n'est sélectionnée. Les champs sont décrits dans [`Beatmap`](DATA_MODEL.md#beatmap). Les `paths` sont les chemins **locaux** des fichiers de la beatmap ; `assets` dit si le fond et l'audio sont téléchargeables par [`/assets/background`](#get-assetsbackground) et [`/assets/audio`](#get-assetsaudio).

### `GET /difficulty`

La difficulté de la beatmap **avec les mods actifs**, et ce qu'elle rapporte à 95 / 98 / 99 / 100 % de précision.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/difficulty
```

```js
const d = await (await fetch(`${API}/difficulty`)).json();
if (d) console.log(`${d.stars.toFixed(2)}★, ${Math.round(d.pp98)}pp à 98 %`);
```

**Exemple de réponse** : `200`

```json
{
  "stars": 7.4,
  "maxCombo": 348,
  "pp95": 250.0,
  "pp98": 290.0,
  "pp99": 310.0,
  "pp100": 340.0,
  "firstObjectMs": 3200.0,
  "lastObjectMs": 176400.0
}
```

`null` si aucune beatmap n'est sélectionnée, ou si son fichier `.osu` est introuvable. Voir [`Difficulty`](DATA_MODEL.md#difficulty).

### `GET /difficulty-graph`

La difficulté de la beatmap **tout au long de la chanson**, avec les mods actifs : 120 barres normalisées sur la map elle-même
(`0` = passage calme, `1` = le plus dur de cette map), pour tracer une frise. Le calcul se fait une fois par map, mods et
vitesse, hors du thread de lecture : la réponse est `null` pendant cette fraction de seconde.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/difficulty-graph
```

```js
const g = await (await fetch(`${API}/difficulty-graph`)).json();
if (g) console.log(`${g.overall.toFixed(2)}★, passage le plus dur à ${Math.round(g.peakMs / 1000)} s`);
```

**Exemple de réponse** : `200`

```json
{
  "durationMs": 180000.0,
  "overall": 7.4,
  "peakMs": 174750.0,
  "buckets": [
    0.15, 0.158, 0.167, 0.175, 0.183, 0.192, 0.2, 0.208, 0.217, 0.225, 0.233, 0.242, 0.25, 0.258, 0.267,
    0.275, 0.283, 0.292, 0.62, 0.563, 0.644, 0.714, 0.767, 0.796, 0.797, 0.772, 0.722, 0.653, 0.573, 0.61,
    0.686, 0.747, 0.787, 0.8, 0.786, 0.746, 0.684, 0.608, 0.575, 0.655, 0.723, 0.773, 0.798, 0.795, 0.766,
    0.713, 0.641, 0.56, 0.622, 0.696, 0.755, 0.79, 0.8, 0.781, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12,
    0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.6, 0.607, 0.613, 0.616, 0.625, 0.635, 0.644, 0.651, 0.653,
    0.651, 0.658, 0.675, 0.688, 0.696, 0.696, 0.689, 0.689, 0.711, 0.73, 0.741, 0.741, 0.731, 0.715, 0.745,
    0.77, 0.785, 0.787, 0.775, 0.753, 0.774, 0.807, 0.828, 0.834, 0.822, 0.796, 0.8, 0.84, 0.869, 0.88,
    0.87, 0.843, 0.821, 0.87, 0.908, 0.926, 0.92, 0.892, 0.849, 0.895, 0.943, 0.97, 0.97, 0.943, 0.897
  ]
}
```

`null` si aucune beatmap n'est sélectionnée, si son fichier `.osu` est introuvable ou tant que le calcul n'est pas fini. Voir [`DifficultyGraph`](DATA_MODEL.md#difficultygraph).

### `GET /mods`

Le mode de jeu et les mods sélectionnés.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/mods
```

```js
const { ruleset, mods } = await (await fetch(`${API}/mods`)).json();
console.log(ruleset, mods.join("") || "NM");
```

**Exemple de réponse** : `200`

```json
{
  "ruleset": "osu",
  "mods": [
    "HD",
    "DT"
  ]
}
```

`mods` contient les acronymes des mods (`HD`, `DT`, `HR`…) ; la liste est vide sans mod. Jeu non lancé : {"ruleset": null, "mods": []}.

### `GET /time`

La position dans la chanson.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/time
```

```js
const t = await (await fetch(`${API}/time`)).json();
if (t) console.log((t.currentMs / 1000).toFixed(1) + " s");
```

**Exemple de réponse** : `200`

```json
{
  "currentMs": 8000.0,
  "running": true,
  "source": "gameplay"
}
```

`source` vaut `gameplay` pendant une partie (l'horloge de jeu) et `global` sinon (l'aperçu de la musique). `running` est `false` en pause. `currentMs` peut être **négatif** pendant l'intro. `null` quand le jeu n'est pas lisible. Voir [`Time`](DATA_MODEL.md#time).

### `GET /user`

L'utilisateur connecté dans osu!lazer et ses statistiques (celles de son mode principal).

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/user
```

```js
const user = await (await fetch(`${API}/user`)).json();
if (user) console.log(user.username, user.statistics?.pp);
```

**Exemple de réponse** : `200`

```json
{
  "id": 1,
  "username": "iSweat",
  "countryCode": "FR",
  "avatarUrl": "https://a.ppy.sh/1",
  "apiState": "online",
  "statistics": {
    "globalRank": 130103,
    "countryRank": 4120,
    "pp": 4696.0,
    "accuracy": 98.12,
    "playCount": 24511,
    "totalHits": 4200000,
    "maxCombo": 2210,
    "rankedScore": 9000000000,
    "totalScore": 21000000000
  }
}
```

`null` si personne n'est connecté. Voir [`User`](DATA_MODEL.md#user).

> [!ATTENTION] Ces champs identifient le joueur (pseudo, identifiant, avatar). L'API n'est accessible que depuis cette machine, mais évite de les afficher si tu partages ton stream sans le vouloir.

### `GET /gameplay`

La partie en cours : score, combo, précision, compteurs de jugements, santé, PP, UR et erreurs de timing.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/gameplay
```

```js
const play = await (await fetch(`${API}/gameplay`)).json();
if (play) console.log(play.score, play.combo, `${(play.accuracy * 100).toFixed(2)}%`);
```

**Exemple de réponse** : `200`

```json
{
  "score": 15400,
  "scoreWithoutMods": 11200,
  "accuracy": 0.9871,
  "combo": 14,
  "maxCombo": 21,
  "beatmapMaxCombo": 348,
  "rank": "S",
  "hits": {
    "great": 14,
    "ok": 2,
    "meh": 0,
    "miss": 0
  },
  "results": {
    "Great": 14,
    "LargeTickHit": 15,
    "Miss": 0,
    "Ok": 2,
    "SliderTailHit": 45
  },
  "health": 0.94,
  "paused": false,
  "failed": false,
  "pp": {
    "live": 104.7,
    "fc": 156.7,
    "ss": 255.4
  },
  "unstableRate": 144.6,
  "hitErrors": [
    -3.78,
    -3.32,
    -1.24,
    4.5,
    8.1
  ]
}
```

**`null` hors partie** (menu, sélection, résultats…) : c'est le cas normal, pas une erreur. Voir [`Gameplay`](DATA_MODEL.md#gameplay).

### `GET /pp`

Les PP de la partie : en direct, en FC et en SS.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/pp
```

```js
const pp = await (await fetch(`${API}/pp`)).json();
if (pp) console.log(`${Math.round(pp.live)}pp (FC : ${Math.round(pp.fc)}pp)`);
```

**Exemple de réponse** : `200`

```json
{
  "live": 104.7,
  "fc": 156.7,
  "ss": 255.4
}
```

`null` hors partie, ou si les PP n'ont pas pu être calculés. Voir [PP et étoiles](DATA_MODEL.md#pp-et-étoiles) pour la signification des trois valeurs.

### `GET /hit-errors`

L'unstable rate et les dernières erreurs de timing (en millisecondes, négatives = trop tôt), de la plus ancienne à la plus récente.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/hit-errors
```

```js
const { unstableRate, errors } = await (await fetch(`${API}/hit-errors`)).json();
console.log(unstableRate?.toFixed(1) ?? "–", errors.length);
```

**Exemple de réponse** : `200`

```json
{
  "unstableRate": 144.6,
  "errors": [
    -3.78,
    -3.32,
    -1.24,
    4.5,
    8.1
  ]
}
```

Hors partie, la route répond toujours `200` :

```json
{"unstableRate": null, "errors": []}
```

`unstableRate` vaut aussi `null` avant le deuxième hit. La liste garde au plus les 128 dernières erreurs.

## Touches

### `GET /inputs`

Les touches du clavier et les boutons de souris que **le jeu voit tenus à cet instant**.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/inputs
```

```js
const { keys, mouse } = await (await fetch(`${API}/inputs`)).json();
console.log(keys.includes("Z") ? "Z tenue" : "Z relâchée");
```

**Exemple de réponse** : `200`

```json
{
  "seq": 4,
  "at": 1792711593829,
  "keys": [
    "Z"
  ],
  "mouse": [
    "Left"
  ]
}
```

| Champ | Description |
| --- | --- |
| `seq` | Augmente à chaque changement de touches (son propre compteur, distinct de celui de `/snapshot`) |
| `at` | Heure Unix, en millisecondes, du dernier changement |
| `keys` | Touches du clavier tenues : `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… (vide si rien n'est tenu) |
| `mouse` | Boutons de souris tenus : `Left`, `Right`, `Middle`, `Button1`, `Button2` |

Sans client connecté, les touches ne sont pas lues dans le jeu : **un appel de cette route déclenche leur lecture pendant 5 secondes**.
Tu peux donc l'interroger en boucle ; la première réponse peut encore être vide. Pour la latence la plus faible,
préfère le [WebSocket des touches](WEBSOCKET.md#flux-des-touches).

Quand le jeu n'est pas lancé :

```json
{"seq": 0, "at": 1792711488033, "keys": [], "mouse": []}
```

## Fichiers de la beatmap

Le fond et la musique de la beatmap **sélectionnée**, lus dans le stockage d'osu!lazer, avec le bon `Content-Type` (selon l'extension du fichier de la beatmap : `image/jpeg`, `image/png`, `audio/mpeg`…). Les requêtes `Range` sont supportées (la réponse est alors `206 Partial Content`).

### `GET /assets/background`

L'image de fond de la beatmap sélectionnée.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/assets/background -o background.jpg
```

```html
<img src="http://127.0.0.1:24051/api/v1/assets/background?v=SHA256_DE_LA_BEATMAP" />
```

```js
const map = (await (await fetch(`${API}/beatmap`)).json());
if (map?.assets.background) {
  document.body.style.backgroundImage = `url(${API}/assets/background?v=${map.sha256})`;
}
```

**Exemple de réponse** : `200`, `Content-Type: image/jpeg`, `Accept-Ranges: bytes`, `Cache-Control: no-store`, puis les octets de l'image.

> [!ASTUCE] Le fond change avec la beatmap mais l'URL reste la même : ajoute un paramètre qui change avec elle
> (par exemple `?v=<sha256>`) pour que le navigateur n'affiche pas l'ancienne image.

**Erreurs**

| Code | `error.code` | `error.message` |
| --- | --- | --- |
| `404` | `notFound` | `no beatmap is selected` : aucune beatmap n'est sélectionnée |
| `404` | `notFound` | `the beatmap has no such file` : la beatmap n'a pas ce fichier (voir `beatmap.assets`) |
| `404` | `notFound` | `lazer's data directory was not found` : le dossier de données d'osu!lazer est introuvable |
| `404` | `notFound` | `the file is missing from lazer's storage` : le fichier manque dans le stockage |
| `500` | `io` | Erreur de lecture du fichier |

Exemple, aucune beatmap sélectionnée :

```json
{"error": {"code": "notFound", "message": "no beatmap is selected"}}
```

### `GET /assets/audio`

Le fichier audio de la beatmap sélectionnée.

**Exemple d'utilisation**

```bash
curl -s -H "Range: bytes=0-99" http://127.0.0.1:24051/api/v1/assets/audio -D - -o part.bin
```

```js
const audio = new Audio(`${API}/assets/audio`);
audio.currentTime = 30; // se déplacer dans la musique grâce aux requêtes Range
audio.play();
```

**Exemple de réponse** : `200`, `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`, puis le fichier. Avec l'en-tête `Range: bytes=0-3` :

```
HTTP/1.1 206 Partial Content
content-type: audio/mpeg
content-range: bytes 0-3/20
accept-ranges: bytes
```

Les erreurs sont celles de [`/assets/background`](#get-assetsbackground).

## Images importées

### `GET /images/{id}`

Une image importée par l'utilisateur pour le widget [Image](BUILTIN_WIDGETS.md#divers) (bouton **Importer une image…**
de l'éditeur), ou une **police** importée pour le texte d'un widget (`style.font`, voir [Layout](LAYOUT.md)), servie avec le
bon `Content-Type` (`font/woff2`…). Le fichier est copié dans les données de l'application sous un nom
qui est un **hash de son contenu** : l'`id` (`<32 chiffres hexadécimaux>.<png|jpg|gif|webp|svg|ttf|otf|woff|woff2>`) est la seule chose
qu'un layout garde, et la même image importée deux fois a le même `id`. Seuls des fichiers **PNG, JPEG, GIF, WebP, SVG** (images) ou **TTF, OTF, WOFF, WOFF2** (polices)
de 15 Mo au maximum sont acceptés (le type est vérifié sur le contenu, pas sur l'extension ; un SVG avec un script est
refusé). Un `id` qui n'a pas exactement cette forme répond `404` : aucun autre fichier ne peut être atteint.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/images/cb27a70bc0fd6a4607c0b158be921383.png -o image.png
```

```html
<img src="http://127.0.0.1:24051/api/v1/images/cb27a70bc0fd6a4607c0b158be921383.png" />
```

```js
const layoutOptions = { image: "cb27a70bc0fd6a4607c0b158be921383.png" }; // ce que garde un widget Image
const src = `${API}/images/${layoutOptions.image}`;
```

**Exemple de réponse** : `200`, `Content-Type: image/png`, `Cache-Control: public, max-age=31536000, immutable` (l'`id` ne
change jamais de contenu), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`
(un SVG ouvert seul n'exécute rien), puis les octets de l'image.

**Erreurs**

| Code | `error.code` | `error.message` |
| --- | --- | --- |
| `404` | `notFound` | `no such picture` : l'`id` est invalide, l'image a été supprimée, ou l'application n'a pas de dossier d'images |
| `500` | `io` | Erreur de lecture du fichier |

Exemple :

```json
{"error": {"code": "notFound", "message": "no such picture"}}
```

## Widgets et documentation

### `GET /widgets`

Les [widgets communautaires](WIDGETS.md) trouvés dans le dossier des widgets : leurs manifestes, avec l'`id` (le nom du dossier) ajouté. Les dossiers sans `manifest.json` valide, ou dont la page d'entrée manque, sont ignorés.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/widgets
```

```js
const widgets = await (await fetch(`${API}/widgets`)).json();
console.log(widgets.map((w) => w.name));
```

**Exemple de réponse** : `200`

```json
[
  {
    "id": "hello-score",
    "name": "Hello score",
    "version": "1.0.0",
    "author": "Toi",
    "description": "Affiche le score en direct.",
    "entry": "index.html",
    "defaultSize": {
      "w": 420,
      "h": 140
    },
    "options": [
      {
        "key": "color",
        "label": "Couleur",
        "type": "color",
        "default": "#f472b6",
        "min": null,
        "max": null,
        "choices": []
      }
    ]
  }
]
```

Tableau vide (`[]`) quand il n'y a aucun widget. Les champs sont ceux du [`manifest.json`](WIDGETS.md) ; les options sans valeur valent `null` (`min`, `max`) ou `[]` (`choices`).

### `GET /docs`

La documentation de l'API en Markdown : le guide, les routes, le WebSocket et le modèle de données, à la suite.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/api/v1/docs
```

```js
const markdown = await (await fetch(`${API}/docs`)).text();
```

**Exemple de réponse** : `200`, `Content-Type: text/markdown; charset=utf-8`, puis le texte :

```
# Guide de l'API locale
...
```

### `GET /widgets/<dossier>/<fichier>`

Un fichier d'un widget communautaire (en dehors de `/api/v1`). Seuls les fichiers **du dossier des widgets** sont servis, avec
le `Content-Type` de leur extension.

**Exemple d'utilisation**

```bash
curl http://127.0.0.1:24051/widgets/hello-score/index.html
```

```js
const page = await (await fetch("http://127.0.0.1:24051/widgets/hello-score/index.html")).text();
```

**Exemple de réponse** : `200`, `Content-Type: text/html`, puis le fichier. Un fichier qui n'existe pas, ou une tentative de sortir du
dossier (`..`), répond `404` avec un corps vide.

## Erreurs

Une erreur de l'API renvoie un code HTTP et un corps JSON toujours de la même forme :

```json
{ "error": { "code": "notFound", "message": "no such endpoint; see /api/v1" } }
```

| HTTP | `error.code` | Quand | Exemple vérifié |
| --- | --- | --- | --- |
| `404` | `notFound` | Route inconnue (`/api/v1/nope`, `/api/v1/state/`, `/`…) | `{"error":{"code":"notFound","message":"no such endpoint; see /api/v1"}}` |
| `404` | `notFound` | Fichier de beatmap indisponible | voir [Fichiers de la beatmap](#fichiers-de-la-beatmap) |
| `400` | `invalidTopic` | Un `topics` invalide à l'ouverture du [WebSocket de l'état](WEBSOCKET.md#connexion) | `unknown topic "nope"; valid topics: …` |
| `500` | `io` | Erreur de lecture d'un fichier | |

D'autres réponses ne sont **pas** au format JSON :

- une méthode autre que `GET` reçoit `405 Method Not Allowed` avec un corps vide ;
- une requête de WebSocket mal formée (sans en-tête `Upgrade`, ou avec `events=maybe`) reçoit `400` avec un message texte ;
- un fichier de widget absent reçoit `404` avec un corps vide.

Quand l'API n'est pas joignable (connexion refusée), c'est qu'elle est **désactivée**, que le **port** est différent de celui que tu appelles, ou que l'application n'est pas lancée.

## Bien interroger l'API

- **Afficher en direct** : ouvre un [WebSocket](WEBSOCKET.md) plutôt que d'interroger en boucle. L'état arrive au moment où il change.
- **Un script ponctuel** : `GET /state`, ou `GET /snapshot` pour avoir statut et état cohérents.
- **Interroger quand même** : inutile d'appeler plus souvent que `pollIntervalMs` (33 ms par défaut), l'état ne change pas plus vite. Utilise `seq` pour détecter un changement.
- **Les touches** : `GET /inputs` marche en boucle (5 secondes de lecture à chaque appel), mais le WebSocket des touches est plus réactif.
- **Reconnexion** : l'API redémarre quand tu changes le port ou la désactives ; réessaie avec un délai croissant.

```python
import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:24051/api/v1/state") as response:
    state = json.load(response)
print(state["screen"], state["beatmap"] and state["beatmap"]["title"])
```
