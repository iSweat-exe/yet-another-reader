# WebSocket

L'application publie **deux flux** en direct. Un WebSocket est **poussé** : tu reçois le changement au moment
où il est lu, sans interroger. C'est le bon choix pour tout ce qui s'affiche à l'écran. Les messages de cette page
sont des **messages réels**, obtenus en se connectant au serveur. Pour les routes à interroger, voir
[Routes REST](REST_API.md).

| Flux | Adresse | Contenu | Rythme |
| --- | --- | --- | --- |
| **État** | `ws://127.0.0.1:24051/api/v1/ws` | L'état du jeu, le statut de connexion, les événements | Échantillonné toutes les `pollIntervalMs` (33 ms), publié à chaque changement |
| **Touches** | `ws://127.0.0.1:24051/api/v1/inputs/ws` | Les touches et boutons de souris tenus | Échantillonné toutes les `inputPollIntervalMs` (2 ms), publié à chaque changement |

Les deux flux sont **séparés** : les touches sont lues bien plus vite que le reste et ne ralentissent pas le flux de
l'état. Tu peux ouvrir l'un, l'autre, ou les deux.

> [!IMPORTANT] Seul `127.0.0.1` est écouté, sans authentification : le WebSocket n'est accessible que depuis la
> machine du joueur. N'importe quelle origine (page `file://`, source navigateur OBS, autre port) peut s'y connecter.

## Règles communes

- Les messages sont des **trames texte** contenant du JSON : un objet avec un champ `type`. L'**ordre des clés n'est pas
  garanti** (il est alphabétique en pratique) : lis les champs par leur nom.
- À la connexion, le serveur envoie **toujours** un message `hello` avec l'état courant. Tu n'as pas besoin d'appeler
  l'API REST pour t'initialiser.
- Rien n'est envoyé tant que rien ne change.
- `seq` est un compteur qui augmente à chaque changement : un trou dans la suite te dit qu'un message a été sauté.
  Chaque flux a son **propre** compteur.
- Le client peut envoyer un message texte contenant `"ping"` (par exemple `{ "type": "ping" }`) : le serveur répond
  `{ "type": "pong" }`. Tout le reste (JSON invalide, autres types, trames binaires) est **ignoré**.
- Les nombres sont écrits comme dans les réponses REST (`9.2`, pas `9.199999809265137`).
- Si ton client est trop lent, les messages intermédiaires sont sautés et il reçoit directement l'état à jour : pas de
  file qui grossit, pas de retard à rattraper.
- Le serveur est **fermé proprement** : quand tu fermes la connexion, il répond (fermeture normale) ; quand
  l'application l'arrête (changement du port, API désactivée), il envoie un code de fermeture `1001`
  (*going away*) puis coupe. Voir [Fermeture et reconnexion](#fermeture-et-reconnexion).

## Flux de l'état

`ws://127.0.0.1:24051/api/v1/ws`

### Connexion

| Paramètre | Valeur | Effet |
| --- | --- | --- |
| `topics` | liste séparée par des virgules | Ne garde que ces clés dans `data` (la clé `connected` est toujours incluse). Vide ou absent : tout |
| `events` | `true` ou `false` | `false` désactive les messages `event` (par défaut : activés) |

Les `topics` valides sont `connected`, `version`, `screen`, `screenType`, `playing`, `ruleset`, `mods`, `beatmap`,
`difficulty`, `time`, `user` et `gameplay`.

```
ws://127.0.0.1:24051/api/v1/ws?topics=gameplay,time&events=false
```

Filtrer réduit le trafic : un overlay de score n'a pas besoin de recevoir la beatmap à chaque mise à jour.

**Refus à l'ouverture** : la réponse est une réponse HTTP `400`, pas un WebSocket.

| Cas | Réponse |
| --- | --- |
| Un topic inconnu (`?topics=beatmap,nope`) | `400`, JSON : `{"error":{"code":"invalidTopic","message":"unknown topic \"nope\"; valid topics: connected, version, screen, screenType, playing, ruleset, mods, beatmap, difficulty, time, user, gameplay"}}` |
| `events` autre que `true` ou `false` (`?events=maybe`) | `400`, texte : `Failed to deserialize query string: events: provided string was not `true` or `false`` |
| Une requête sans en-tête `Upgrade` (par exemple depuis un navigateur) | `400`, texte : `Connection header did not include 'upgrade'` |

### Exemple d'utilisation

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws?topics=gameplay,time");

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "hello":
    case "state": {
      const play = msg.data.gameplay; // null hors partie
      if (play) console.log(play.score, play.combo);
      break;
    }
    case "status":
      console.log("connexion au jeu :", msg.data.phase);
      break;
    case "event":
      console.log("événement :", msg.event.name);
      break;
  }
};
```

```bash
npx wscat -c "ws://127.0.0.1:24051/api/v1/ws?topics=time&events=false"
```

> [!SCREENSHOT] wscat-stream
> Terminal avec `npx wscat -c "ws://127.0.0.1:24051/api/v1/ws?topics=time&events=false"` : « Connected », le message
> `hello`, puis plusieurs messages `state` qui défilent avec `time.currentMs` qui augmente.

### Messages reçus

| `type` | Quand | Champs |
| --- | --- | --- |
| [`hello`](#hello) | À la connexion | `apiVersion`, `seq`, `settings`, `status`, `data` |
| [`state`](#state) | L'état a changé | `seq`, `data` |
| [`status`](#status) | La connexion à osu!lazer a changé | `seq`, `data` |
| [`event`](#event) | Une transition vient d'avoir lieu | `seq`, `event` |
| [`pong`](#pong) | Réponse à ton `ping` | |

#### `hello`

Envoyé **une fois**, dès la connexion : l'état courant, pour que tu n'aies rien à demander.

```json
{
  "apiVersion": 1,
  "data": {
    "connected": true,
    "screen": "songSelect",
    "...": "l'état complet (comme GET /state), filtré par topics"
  },
  "seq": 6,
  "settings": {
    "inputPollIntervalMs": 2,
    "pollIntervalMs": 33,
    "port": 24099
  },
  "status": {
    "connectMs": 5200,
    "phase": "connected",
    "profile": "embedded default",
    "version": "2026.1005.0-lazer+9a10d935"
  },
  "type": "hello"
}
```

| Champ | Description |
| --- | --- |
| `apiVersion` | Version du contrat (`1`) |
| `seq` | Le compteur au moment de la connexion |
| `settings` | Les [réglages](REST_API.md#get-settings) de lecture en vigueur |
| `status` | Le statut de connexion, comme [`GET /status`](REST_API.md#get-status) |
| `data` | L'état complet, comme [`GET /state`](REST_API.md#get-state), **filtré par `topics`** |

#### `state`

L'état a changé. `data` contient **toujours l'état entier** (filtré par `topics`), jamais une différence : remplace ton
état par `data`. Exemple avec `?topics=gameplay,time` :

```json
{
  "data": {
    "connected": true,
    "gameplay": {
      "accuracy": 0.9871,
      "beatmapMaxCombo": 348,
      "combo": 56,
      "failed": false,
      "health": 0.94,
      "hitErrors": [
        -3.78,
        -3.32,
        -1.24,
        4.5,
        8.1
      ],
      "hits": {
        "great": 56,
        "meh": 0,
        "miss": 1,
        "ok": 8
      },
      "maxCombo": 56,
      "paused": false,
      "pp": {
        "fc": 156.7,
        "live": 110.7,
        "ss": 255.4
      },
      "rank": "S",
      "results": {
        "Great": 56,
        "LargeTickHit": 15,
        "Miss": 1,
        "Ok": 8,
        "SliderTailHit": 45
      },
      "score": 61600,
      "scoreWithoutMods": 44800,
      "unstableRate": 144.6
    },
    "time": {
      "currentMs": 32000,
      "running": true,
      "source": "gameplay"
    }
  },
  "seq": 30,
  "type": "state"
}
```

Un message `state` est envoyé à chaque fois que **l'état complet** a changé, même si les `topics` que tu suis sont
identiques à ceux du message précédent (le temps de la chanson, par exemple, avance à chaque lecture). `topics` réduit la
**taille** des messages, pas leur nombre : compare toi-même avec ton dernier état si tu veux ignorer les répétitions.

#### `status`

La connexion à osu!lazer a changé (le jeu est lancé, fermé, devient illisible…). `data` est le même objet que
[`GET /status`](REST_API.md#get-status).

```json
{
  "data": {
    "phase": "connecting"
  },
  "seq": 16,
  "type": "status"
}
```

#### `event`

Une transition vient d'avoir lieu. Un `event` a le **même `seq`** que le `state` qui l'a provoqué et arrive **juste après** lui.

```json
{
  "event": {
    "from": "playing",
    "name": "screenChanged",
    "screenType": "osu.Game.Screens.Ranking.SoloResultsScreen",
    "to": "results"
  },
  "seq": 14,
  "type": "event"
}
```

Tous les événements sont listés dans [Événements](#événements). Désactive-les avec `?events=false` si tu n'en as pas besoin.

#### `pong`

La réponse à un `ping` du client.

```json
{
  "type": "pong"
}
```

### Événements

Les événements décrivent des **transitions**, plus pratiques que de comparer deux états. Ils sont envoyés par le
WebSocket de l'état (jamais par REST), dans le champ `event` d'un message `event`. Chaque événement a un `name`.
Quand plusieurs événements arrivent en même temps, ils sont envoyés dans cet ordre : `connectionChanged`,
`screenChanged`, `beatmapChanged`, `modsChanged`, puis `playStarted` ou `playEnded`, puis `paused`, `resumed` ou `failed`.

| `name` | Déclenché quand | Champs en plus |
| --- | --- | --- |
| `connectionChanged` | osu!lazer est connecté ou a disparu | `connected` |
| `screenChanged` | L'écran visible change | `from`, `to`, `screenType` |
| `beatmapChanged` | Une autre beatmap est sélectionnée | `beatmap` (`null` si la sélection est vidée) |
| `modsChanged` | Les mods sélectionnés changent | `mods` |
| `playStarted` | Une partie commence | `beatmap`, `mods` |
| `playEnded` | L'écran de jeu se ferme | `reason`, `beatmap`, `mods`, `result` |
| `paused` | La partie est mise en pause | |
| `resumed` | La partie reprend | |
| `failed` | Le joueur échoue | |

Les exemples ci-dessous sont des messages `event` complets. Les objets `beatmap` et `result` sont abrégés (ce sont les objets
[`Beatmap`](DATA_MODEL.md#beatmap) et [`Gameplay`](DATA_MODEL.md#gameplay) complets).

**`connectionChanged`**

```json
{
  "event": {
    "name": "connectionChanged",
    "connected": true
  },
  "seq": 1,
  "type": "event"
}
```

**`screenChanged`**

```json
{
  "event": {
    "from": "playing",
    "name": "screenChanged",
    "screenType": "osu.Game.Screens.Ranking.SoloResultsScreen",
    "to": "results"
  },
  "seq": 14,
  "type": "event"
}
```

**`beatmapChanged`**

```json
{
  "event": {
    "name": "beatmapChanged",
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "objet Beatmap complet"
    }
  },
  "seq": 2,
  "type": "event"
}
```

**`modsChanged`**

```json
{
  "event": {
    "name": "modsChanged",
    "mods": [
      "HD",
      "DT"
    ]
  },
  "seq": 3,
  "type": "event"
}
```

**`playStarted`**

```json
{
  "event": {
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "objet Beatmap complet"
    },
    "mods": [
      "HD",
      "DT"
    ],
    "name": "playStarted"
  },
  "seq": 23,
  "type": "event"
}
```

**`playEnded`** : `reason` vaut `failed` (la partie était échouée), `completed` (l'écran de résultats suit) ou `quit` (retour au menu, à la sélection, ou *retry*). `result` contient les **dernières valeurs** de la partie.

```json
{
  "event": {
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "objet Beatmap complet"
    },
    "mods": [
      "HD",
      "DT"
    ],
    "name": "playEnded",
    "reason": "completed",
    "result": {
      "score": 69300,
      "accuracy": 0.9871,
      "combo": 63,
      "maxCombo": 63,
      "rank": "S",
      "hits": {
        "great": 63,
        "meh": 0,
        "miss": 1,
        "ok": 9
      },
      "...": "objet Gameplay complet"
    }
  },
  "seq": 14,
  "type": "event"
}
```

**`paused`** et **`resumed`**

```json
{
  "event": {
    "name": "paused"
  },
  "seq": 10,
  "type": "event"
}
```

```json
{
  "event": {
    "name": "resumed"
  },
  "seq": 11,
  "type": "event"
}
```

**`failed`**

```json
{
  "event": {
    "name": "failed"
  },
  "seq": 4,
  "type": "event"
}
```

## Flux des touches

`ws://127.0.0.1:24051/api/v1/inputs/ws` (aucun paramètre : les paramètres éventuels sont ignorés)

Les touches du clavier et les boutons de souris que **le jeu voit tenus**. Elles sont lues dans le jeu **à part du reste**
et **seulement tant qu'au moins un client** (ou un widget de touches de l'overlay) les écoute : se connecter démarre la
lecture, la dernière déconnexion l'arrête. C'est l'état d'entrée **du jeu** : une touche pressée alors qu'osu! n'a pas le
focus n'est pas vue.

### Exemple d'utilisation

Voir quelles touches sont tenues, et compter les appuis :

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/inputs/ws");
let held = new Set();
let presses = 0;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type !== "hello" && msg.type !== "input") return;
  const next = new Set([...msg.data.keys, ...msg.data.mouse.map((b) => `mouse:${b}`)]);
  for (const key of next) if (!held.has(key)) presses++; // une touche qui apparaît = un appui
  held = next;
  console.log([...held].join(" + ") || "rien", `(${presses} appuis)`);
};
```

> [!SCREENSHOT] inputs-wscat
> Console du navigateur (ou terminal Node) exécutant l'exemple : des lignes « Z (1 appuis) », « Z + mouse:Left (2
> appuis) », « rien (2 appuis) » qui défilent pendant que l'on joue.

### Messages reçus

| `type` | Quand | Champs |
| --- | --- | --- |
| [`hello`](#hello-1) | À la connexion | `apiVersion`, `intervalMs`, `seq`, `at`, `data` |
| [`input`](#input) | Une touche ou un bouton a changé | `seq`, `at`, `data` |
| `pong` | Réponse à ton `ping` | |

#### `hello`

```json
{
  "apiVersion": 1,
  "at": 1792711619102,
  "data": {
    "keys": [],
    "mouse": []
  },
  "intervalMs": 2,
  "seq": 56,
  "type": "hello"
}
```

| Champ | Description |
| --- | --- |
| `apiVersion` | Version du contrat (`1`) |
| `intervalMs` | Intervalle de lecture en vigueur (`inputPollIntervalMs`) : la précision maximale de tes mesures |
| `seq` | Le compteur des touches : augmente à chaque changement |
| `at` | Heure Unix, en millisecondes, du dernier changement |
| `data` | Les touches tenues **maintenant** (souvent vide à la connexion) |

#### `input`

Une touche ou un bouton a changé. Un appui et un relâchement sont chacun un message. Appui :

```json
{
  "at": 1792711626459,
  "data": {
    "keys": [
      "Z"
    ],
    "mouse": [
      "Left"
    ]
  },
  "seq": 57,
  "type": "input"
}
```

Relâchement :

```json
{
  "at": 1792711626973,
  "data": {
    "keys": [],
    "mouse": []
  },
  "seq": 58,
  "type": "input"
}
```

| Champ | Description |
| --- | --- |
| `seq` | Augmente à chaque changement |
| `at` | Heure Unix, en millisecondes, du changement |
| `data.keys` | Touches du clavier tenues : `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… |
| `data.mouse` | Boutons de souris tenus : `Left`, `Right`, `Middle`, `Button1`, `Button2` |

- Un message `input` contient **toutes** les touches tenues à cet instant, pas seulement ce qui a changé : remplace ton état.
- Pour **compter les appuis**, compare avec l'état précédent : une touche qui apparaît est un appui.
- Une touche **tenue** n'envoie rien tant qu'elle ne change pas.
- Une touche tenue moins longtemps que `intervalMs` peut passer inaperçue.

Les noms des touches sont ceux d'osu!framework. Voir [Touches en temps réel](API.md#touches-en-temps-réel).

#### `pong`

```json
{
  "type": "pong"
}
```

## Fermeture et reconnexion

| Qui ferme | Ce que tu vois |
| --- | --- |
| **Toi** (`ws.close()`) | Le serveur répond : la fermeture est **propre** (`wasClean: true`) |
| **L'application** : changement du port, API désactivée, arrêt | Un code de fermeture **`1001`** (*going away*, raison `server stopping`), puis la connexion est coupée |
| Le réseau ou l'application plantée | Fermeture anormale (`1006`) |

Dans tous les cas, **reconnecte-toi** avec un délai croissant : à la reconnexion, le message `hello` te redonne l'état courant,
tu n'as rien à rattraper. Pour un nouveau port, utilise l'URL affichée dans l'onglet **Statut**.

```js
function connect(url, onMessage) {
  let delay = 500;
  const open = () => {
    const ws = new WebSocket(url);
    ws.onopen = () => (delay = 500);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(open, (delay = Math.min(delay * 2, 10_000)));
  };
  open();
}

connect("ws://127.0.0.1:24051/api/v1/ws", (msg) => console.log(msg.type));
```

```python
import asyncio, json
import websockets  # pip install websockets

async def main():
    async for ws in websockets.connect("ws://127.0.0.1:24051/api/v1/inputs/ws"):  # se reconnecte tout seul
        try:
            async for text in ws:
                message = json.loads(text)
                if message["type"] == "input":
                    print(message["data"]["keys"], message["data"]["mouse"])
        except websockets.ConnectionClosed:
            continue

asyncio.run(main())
```

## Choisir : WebSocket ou REST ?

| Tu veux… | Utilise |
| --- | --- |
| Afficher en direct (overlay, widget, source OBS) | WebSocket de l'état |
| Suivre les touches avec la latence la plus faible | WebSocket des touches |
| Réagir à un début ou une fin de partie | [Événements](#événements) |
| Lire une valeur une fois (script, `curl`) | [`GET /state`](REST_API.md#get-state) |
| Télécharger le fond ou la musique | [`/assets/*`](REST_API.md#fichiers-de-la-beatmap) |
| Savoir si quelque chose a changé depuis ton dernier appel | `seq` de [`GET /snapshot`](REST_API.md#get-snapshot) |

## Dépannage rapide

| Symptôme | Cause probable |
| --- | --- |
| Connexion refusée | L'API est désactivée, le port n'est pas le bon, ou l'application n'est pas lancée |
| Réponse HTTP `400` à l'ouverture | Un `topics` ou un `events` invalide (voir [Connexion](#connexion)) |
| Rien ne vient après `hello` | Rien n'a changé : le flux n'envoie que les changements |
| `connected: false` dans `data` | Le jeu n'est pas lancé ou pas encore lisible (voir `status`) |
| Les touches ne bougent pas | osu! n'a pas le focus (le jeu ne voit pas les touches), ou le jeu n'est pas connecté |
