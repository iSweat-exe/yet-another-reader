# Guide de l'API locale

Yet Another Reader lit l'état d'osu!lazer **en lecture seule** et le publie sur une API locale (HTTP + WebSocket).
Elle sert de base pour construire des overlays : composants web, sources navigateur OBS, scripts, etc.

- **Version du contrat** : `1` (préfixe `/api/v1`). Les changements non rétrocompatibles incrémentent ce numéro ;
  ajouter un champ n'est pas un changement cassant.
- **Réseau** : écoute uniquement sur `127.0.0.1` (jamais exposée au réseau local).
- **Lecture seule** : aucune route ne modifie le jeu ni l'application. Tout est en `GET`.
- **Cette documentation** est aussi servie par l'application : `GET /api/v1/docs` (les quatre pages à la suite).

## Sommaire

1. [Les quatre pages de l'API](#les-quatre-pages-de-lapi)
2. [Démarrage rapide](#démarrage-rapide)
3. [Réglages](#réglages)
4. [Conventions](#conventions)
5. [Touches en temps réel](#touches-en-temps-réel)
6. [REST ou WebSocket ?](#rest-ou-websocket)
7. [Exemples complets](#exemples-complets)
8. [Notes et limites](#notes-et-limites)

---

## Les quatre pages de l'API

C'est **une seule API**, décrite en quatre pages. Elle se lit de deux façons (REST et WebSocket) et publie les mêmes données.

| Page | Elle répond à… |
| --- | --- |
| **Guide** (cette page) | Comment démarrer ? Quels réglages ? Quelles règles communes ? Un exemple complet ? |
| [Routes REST](REST_API.md) | Quelle route appeler pour quelle donnée ? Que répond-elle, comment échoue-t-elle ? Chaque route a un exemple d'appel et une réponse réelle |
| [WebSocket](WEBSOCKET.md) | Comment recevoir les changements en direct : l'état, les événements, les touches ? Chaque message a un exemple réel |
| [Modèle de données](DATA_MODEL.md) | Que contient chaque champ (`beatmap`, `gameplay`, `user`…) ? Quelles valeurs peut-il prendre ? |

---

## Démarrage rapide

1. Lance **Yet Another Reader** puis **osu!lazer** (la connexion est automatique, elle prend
   quelques secondes la première fois).
2. Vérifie que l'API répond :

> [!SCREENSHOT] curl-health
> Terminal avec la commande `curl http://127.0.0.1:24051/api/v1/health` et sa réponse `{"ok":true,"uptimeMs":17023}` ;
> en dessous, `curl .../api/v1/state` avec le début du JSON.

```bash
curl http://127.0.0.1:24051/api/v1/health
```

```json
{ "ok": true, "uptimeMs": 17023 }
```

3. Récupère l'état complet, ou ouvre un WebSocket pour être notifié à chaque changement :

```bash
curl http://127.0.0.1:24051/api/v1/state
```

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

Il y a **trois WebSockets** : `/api/v1/ws` (l'état, le statut et les événements), `/api/v1/inputs/ws` (les touches) et
`/api/v1/events/ws` (les événements seuls, sans état : une note touchée, un miss, un combo cassé). Voir [WebSocket](WEBSOCKET.md).

> Le port par défaut est **24051**. Il se change dans l'application (carte « Réglages »).

---

## Réglages

Ces réglages se changent dans l'application. Ils sont enregistrés dans `settings.json`
(dossier de configuration de l'application) et appliqués immédiatement.

| Réglage | Défaut | Plage | Effet |
| --- | --- | --- | --- |
| Intervalle de lecture (`pollIntervalMs`) | `33` ms (≈ 30/s) | `8` – `5000` ms | Fréquence d'échantillonnage de la mémoire du jeu. C'est aussi la fréquence maximale des messages WebSocket : un message n'est envoyé **que si l'état a changé**. |
| Intervalle de lecture des touches (`inputPollIntervalMs`) | `2` ms (≈ 500/s) | `1` – `100` ms | Fréquence d'échantillonnage des touches et boutons de souris tenus ([voir plus bas](#touches-en-temps-réel)). Bien plus rapide que le reste : les touches doivent être en temps réel. Elles ne sont lues que si quelqu'un les écoute. |
| API locale (`apiEnabled`) | activée | — | Active ou coupe le serveur HTTP/WebSocket. |
| Port (`apiPort`) | `24051` | `1024` – `65535` | Port d'écoute sur `127.0.0.1`. Si le port est occupé, l'application affiche l'erreur. |

Choisir l'intervalle : `16` ms pour des animations fluides à 60 Hz, `33` ms (défaut) pour la
plupart des overlays, `100`+ ms pour économiser le processeur si tu n'affiches que du texte.

Les valeurs en vigueur sont lisibles via `GET /api/v1/settings` (lecture seule).

---

## Conventions

| Sujet | Règle |
| --- | --- |
| Format | JSON UTF-8, clés en `camelCase`. |
| Absence de valeur | `null` (par ex. `gameplay` hors partie). Une route qui renvoie « rien » répond `200` avec `null`, pas `404`. |
| Temps | Millisecondes (`...Ms`). Le temps de la chanson peut être négatif pendant l'intro. |
| Pourcentages | `accuracy` de partie : `0.0`–`1.0`. `statistics.accuracy` de l'utilisateur : `0`–`100`. `health` : `0.0`–`1.0`. |
| Cache | `Cache-Control: no-store` sur toutes les réponses : toujours des données fraîches. |
| CORS | Toutes les origines sont autorisées (`Access-Control-Allow-Origin: *`) : une page `file://`, OBS ou un autre port peut appeler l'API. |
| Erreurs | Code HTTP + corps `{"error": {"code": "...", "message": "..."}}`. |
| Version | `GET /api/v1` renvoie `apiVersion` (pas de `/` final : `/api/v1/` répond `404`). |

Codes d'erreur : `notFound` (404) · `invalidTopic` (400) · `invalidEvent` (400) · `io` (500). Le détail est dans les [routes REST](REST_API.md#erreurs).

```json
{ "error": { "code": "notFound", "message": "no such endpoint; see /api/v1" } }
```

---

## Touches en temps réel

L'application lit aussi **les touches du clavier et les boutons de souris que le jeu voit tenus**, ce qu'il faut pour un
overlay de touches (« key overlay »). Elles sont lues **à part du reste**, dans une boucle bien plus rapide
(`inputPollIntervalMs`, `2` ms par défaut, soit environ 500 lectures par seconde, contre ~30 pour l'état de la partie), et
publiées **à chaque changement**.

- Pour les suivre en direct : le [WebSocket des touches](WEBSOCKET.md#flux-des-touches).
- Pour les lire ponctuellement : [`GET /inputs`](REST_API.md#get-inputs).
- Dans l'application : les widgets **Touche** et **Touches par seconde** de l'éditeur.

> [!IMPORTANT] Les touches ne sont lues **que tant que quelqu'un les écoute** : un client connecté à `/inputs/ws`, une requête
> récente sur `/inputs` (pendant 5 secondes), ou un widget de touches affiché dans l'overlay. Sinon, aucune lecture
> supplémentaire n'est faite dans le jeu.

C'est l'état d'entrée **du jeu lui-même** : une touche pressée alors qu'une autre fenêtre a le focus n'est pas vue. Pendant un **replay** ou avec un mod qui joue à ta place (**AT**, **CN**, **RX**), les touches rejouées (celles que le jeu affiche) apparaissent aussi : elles sont déduites des actions du ruleset et de tes raccourcis (Z/X par défaut). Tes propres touches sont alors **ignorées** (le jeu les ignore aussi), pour ne pas mélanger les deux. Seul ce que le jeu presse lui-même est lu (le dernier état de replay de son gestionnaire d'entrées), jamais tes touches physiques, y compris avec **RX**. Avec RX, AT et Cinéma, le jeu retire de son conteneur les raccourcis des boutons : les touches affichées sont alors celles de ta dernière partie normale du même ruleset, sinon `Z` et `X` pour osu!. Les noms
sont ceux d'osu!framework (`osuTK.Input.Key` et `MouseButton`) : lettres (`Z`), chiffres (`Number1`), `Space`, `ShiftLeft`,
`ControlLeft`, `Escape`, `Tilde`, `Up`, `F1`, `Keypad0`…, et pour la souris `Left`, `Right`, `Middle`, `Button1`, `Button2`.

---

## REST ou WebSocket ?

| Tu veux… | Utilise |
| --- | --- |
| Afficher en direct (overlay, widget, source OBS) | [WebSocket](WEBSOCKET.md#flux-de-létat) |
| Suivre les touches avec la latence la plus faible | [WebSocket des touches](WEBSOCKET.md#flux-des-touches) |
| Réagir à un début ou une fin de partie | [Événements](WEBSOCKET.md#événements) |
| Réagir à chaque note, à un miss ou à un combo cassé | [WebSocket des événements](WEBSOCKET.md#flux-des-événements) |
| Comparer la partie en cours avec ton meilleur score sur la map | [`GET /personal-best`](REST_API.md#get-personal-best) |
| Lire une valeur une fois (script, `curl`) | [`GET /state`](REST_API.md#get-state) |
| Télécharger le fond ou la musique | [`/assets/*`](REST_API.md#fichiers-de-la-beatmap) |
| Savoir si quelque chose a changé depuis ton dernier appel | `seq` de [`GET /snapshot`](REST_API.md#get-snapshot) |

---

## Exemples complets

### Exemple : lire l'état une fois (fetch)

```js
const BASE = "http://127.0.0.1:24051/api/v1";

const state = await (await fetch(`${BASE}/state`)).json();
if (!state.connected) {
  console.log("osu!lazer n'est pas lancé");
} else if (state.gameplay) {
  console.log(`${state.gameplay.score} — ${(state.gameplay.accuracy * 100).toFixed(2)}%`);
}
```

### Exemple : WebSocket avec reconnexion automatique

```js
function connect(onState, onEvent) {
  const url = "ws://127.0.0.1:24051/api/v1/ws?topics=beatmap,gameplay,time,mods";
  let delay = 500;
  let ws;

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => (delay = 500);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "hello" || msg.type === "state") onState(msg.data);
      else if (msg.type === "event") onEvent(msg.event);
    };
    // L'application peut redémarrer : on retente avec un délai croissant.
    ws.onclose = () => setTimeout(open, (delay = Math.min(delay * 2, 8000)));
  };

  open();
  return () => ws?.close();
}

connect(
  (data) => console.log("score", data.gameplay?.score ?? "-"),
  (event) => event.name === "playEnded" && console.log("fin de partie :", event.reason),
);
```

### Exemple : source navigateur OBS (compteur de PP)

Crée un fichier `pp.html`, puis dans OBS ajoute une **source navigateur** → *Fichier local* :

> [!SCREENSHOT] obs-browser-source
> Fenêtre de propriétés d'OBS pour une source navigateur : case « Fichier local » cochée avec le chemin de `pp.html`,
> largeur et hauteur renseignées ; derrière, l'aperçu OBS avec le compteur « 188pp / FC : 231pp » en blanc.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body { margin: 0; background: transparent; color: white; font: 700 48px system-ui; }
  small { font-size: 18px; opacity: 0.7; }
</style>
<div id="pp">–</div>
<small id="fc"></small>
<script>
  const el = document.getElementById("pp");
  const fc = document.getElementById("fc");
  function connect() {
    const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws?topics=gameplay&events=false");
    ws.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type !== "hello" && type !== "state") return;
      const pp = data.gameplay?.pp;
      el.textContent = pp ? `${Math.round(pp.live)}pp` : "–";
      fc.textContent = pp ? `FC : ${Math.round(pp.fc)}pp` : "";
    };
    ws.onclose = () => setTimeout(connect, 1000);
  }
  connect();
</script>
```

### Exemple : fond d'écran et barre de progression

```js
const state = await (await fetch("http://127.0.0.1:24051/api/v1/state")).json();
const map = state.beatmap;
if (map?.assets.background) {
  document.body.style.backgroundImage =
    `url(http://127.0.0.1:24051/api/v1/assets/background?v=${map.sha256})`;
}
const progress = Math.min(1, Math.max(0, state.time.currentMs / map.lengthMs));
```

### Exemple : réagir à un combo cassé (événements)

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/events/ws?names=miss,comboBreak");
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "event" && msg.event.name === "comboBreak") console.log(`combo perdu : ${msg.event.lost}`);
};
```

### Exemple : Python

```python
import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:24051/api/v1/gameplay") as r:
    play = json.load(r)
print("pas en partie" if play is None else f"{play['score']} pts, {play['accuracy']:.2%}")
```

### Exemple : curl

```bash
curl -s http://127.0.0.1:24051/api/v1/gameplay | jq '{score, combo, rank}'
curl -s http://127.0.0.1:24051/api/v1/assets/background -o background.jpg
curl -s -H "Range: bytes=0-99" http://127.0.0.1:24051/api/v1/assets/audio -D -
```

---

## Notes et limites

- **Lecture seule et locale.** L'application n'écrit jamais dans la mémoire du jeu, n'injecte
  rien et n'envoie aucune touche. Elle ne fonctionne qu'avec **osu!lazer** (pas osu!stable).
- **Fréquence.** Les valeurs sont échantillonnées toutes les `pollIntervalMs` ms ; un overlay ne
  peut pas être plus précis que cet intervalle.
- **Plein écran exclusif.** Une fenêtre overlay ne s'affiche pas par-dessus un jeu en plein écran
  exclusif ; utilise le mode fenêtré sans bordure (par défaut dans lazer) ou une source OBS.
- **Mises à jour d'osu!lazer.** La version détectée est dans `version` / `status.version`.
  Si une mise à jour change l'organisation interne du jeu, `status.phase` passe à `error` ou
  certains champs deviennent `null` jusqu'à ce que l'application soit mise à jour (elle suit les noms des champs du jeu,
  pas leurs adresses mémoire, et le même profil sert aujourd'hui à toutes les versions connues).
- **Étoiles du jeu vs calculées.** `beatmap.starRating` vient d'osu!lazer (sans mods),
  `difficulty.stars` est recalculé avec les mods : un très léger écart est normal.
- **Stabilité du contrat.** Les noms de champs et les valeurs d'énumérations listés ici sont
  stables dans `v1`. De nouveaux champs peuvent apparaître : ignore ceux que tu ne connais pas.
