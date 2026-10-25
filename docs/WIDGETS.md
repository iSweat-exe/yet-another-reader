# Widgets communautaires

Un widget communautaire est une petite page **HTML / CSS / JavaScript** qui s'affiche dans
l'overlay. Il lit les données du jeu via l'[API locale](API.md) (comme une source navigateur OBS)
et peut déclarer des **options** que l'éditeur affiche sous forme de formulaire.
Aucune compilation, aucun code natif : un dossier suffit.

## Démarrage rapide

1. Dans l'éditeur, ouvre le **dossier des widgets** (« Ouvrir le dossier des widgets » sous
   *Communauté*). Au premier lancement il contient un exemple, `hello-score`.
2. Copie ce dossier, renomme-le (`mon-widget`), modifie-le.
3. Ton widget apparaît dans la palette (elle se met à jour toute seule, voir [Rechargement à chaud](#rechargement-à-chaud) ; **Actualiser** force la relecture) : ajoute-le au layout.

Pour partir d'un modèle plutôt que de copier un dossier, voir [Créer un widget depuis un modèle](#créer-un-widget-depuis-un-modèle).

> [!SCREENSHOT] community-palette
> Section **Communauté** de la palette : le widget d'exemple « Hello score » avec son icône, le bouton Actualiser
> (flèches circulaires) à côté du titre et le lien « Ouvrir le dossier des widgets » en bas.

> [!IMPORTANT] L'**API locale doit être activée** (réglages) : les widgets sont servis par elle.

## Créer un widget depuis un modèle

Un **générateur** crée le dossier d'un widget qui marche déjà. Deux façons de l'utiliser :

- dans l'éditeur, le bouton **Nouveau widget…** de la section *Communauté* de la palette (dans l'application seulement) : donne un nom, c'est fait ;
- en ligne de commande, depuis le dépôt du projet :

```bash
npm run widget:new -- "Mon widget"
npm run widget:new -- "Mon widget" --dir ./mes-widgets
npm run widget:new -- "Mon widget" --lang fr
```

Sans `--dir`, le widget est créé dans le **dossier des widgets de l'application** (sous Windows : `%APPDATA%\io.github.isweat-exe.yet-another-reader\widgets`). Le nom (40 caractères au plus) devient le nom du widget, et son dossier en
est une version en minuscules, mots séparés par des tirets (`Mon widget !` donne `mon-widget`). Un dossier qui existe déjà n'est **jamais touché** : le nom suivant prend un suffixe (`mon-widget-2`).

Le modèle, copié depuis `docs/examples/widget-template/`, est un point de départ **propre et vide**, livré avec toute la documentation nécessaire :

- `manifest.json` : un widget de 320 × 120 **sans option** (ajoute les tiens dans `options`) ;
- `index.html`, `style.css` et `script.js` : une page transparente qui ne dessine rien. `script.js` est déjà branché : il lit l'adresse de l'API et les options dans l'URL, reçoit les messages `yar:options`, suit l'[état](WEBSOCKET.md#flux-de-létat) (`/api/v1/ws`, limité aux sujets `gameplay,beatmap,mods,time`) et les [événements](WEBSOCKET.md#flux-des-événements) (`/api/v1/events/ws`), et appelle `draw()` et `onEvent()` que tu remplis ;
- `types.d.ts` : les types de l'état et des événements, pour la complétion dans ton éditeur (`// @ts-check` est déjà en tête de `script.js`) ;
- `README.md` : comment le widget fonctionne, comment ajouter une option, la taille, comment l'essayer et le partager, dans ta langue (français ou anglais) ;
- `docs/` : une copie de cette page, du [modèle de données](DATA_MODEL.md), des [routes REST](REST_API.md) et du [WebSocket](WEBSOCKET.md), pour que le widget voyage avec sa documentation.

Dans l'éditeur, la langue du README et des docs est celle de l'interface (français ou anglais ; les autres langues reçoivent l'anglais). En ligne de commande, ajoute `--lang fr` (anglais par défaut).

Une fois créé, le widget est dans la palette : ajoute-le au layout, puis modifie `script.js`.

## Rechargement à chaud

L'application surveille le dossier des widgets : **chaque fois que tu enregistres, ajoutes ou supprimes un fichier** d'un dossier de widget, ce widget est rechargé dans l'overlay **et** dans l'éditeur, et la liste de la palette est mise à jour. Tu peux donc modifier `index.html` avec l'overlay ouvert et voir le résultat tout de suite, sans cliquer sur **Actualiser**.

- Le dossier est **sondé toutes les 0,5 seconde** : l'application compare les tailles et les dates de modification, elle **ne lit pas** les fichiers. Ça marche pareil sur un disque réseau ou un dossier synchronisé.
- Seul le widget modifié recharge sa page (son état de page repart de zéro) ; les autres ne bougent pas.
- Un nouveau dossier apparaît dans la palette, un dossier supprimé en disparaît. Un manifeste à moitié écrit est surveillé aussi : le widget se recharge dès qu'il est corrigé.
- Sont comptés les fichiers du dossier du widget et de ses sous-dossiers (jusqu'à 4 niveaux et 400 fichiers par widget), sauf les sous-dossiers dont le nom commence par un point.

## Structure

```
widgets/
  mon-widget/
    manifest.json     # obligatoire
    index.html        # page d'entrée (nom configurable)
    ...               # tes scripts, styles, images, polices
```

Le nom du dossier est l'identifiant du widget (lettres, chiffres, `-`, `_`, espaces ; pas de point
au début). Tous les fichiers sont servis à `http://127.0.0.1:<port>/widgets/<dossier>/...`.

> [!SCREENSHOT] widgets-folder
> Explorateur de fichiers sur le dossier `widgets` : un sous-dossier `mon-widget` déplié avec `manifest.json`,
> `index.html` et un dossier `images`. Le chemin complet visible.

## `manifest.json`

```json
{
  "name": "Hello score",
  "version": "1.0.0",
  "author": "Toi",
  "description": "Affiche le score en direct.",
  "entry": "index.html",
  "defaultSize": { "w": 420, "h": 140 },
  "options": [
    { "key": "label", "type": "string", "label": "Libellé", "default": "SCORE" },
    { "key": "color", "type": "color", "label": "Couleur", "default": "#f472b6" },
    { "key": "showAccuracy", "type": "boolean", "label": "Afficher la précision", "default": true },
    { "key": "size", "type": "number", "label": "Taille du texte", "default": 56, "min": 12, "max": 200 },
    {
      "key": "mode", "type": "select", "label": "Mode", "default": "score",
      "choices": [{ "value": "score", "label": "Score" }, { "value": "pp", "label": "PP" }]
    }
  ]
}
```

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `name` | oui | Nom affiché dans l'éditeur. |
| `version`, `author`, `description` | non | Informations affichées (info-bulle). |
| `entry` | non | Page d'entrée, `index.html` par défaut (chemin relatif, sans `..`). |
| `defaultSize` | non | Taille `{ w, h }` à l'ajout, en pixels de référence (1080 de haut). |
| `options` | non | Options configurables (voir ci-dessous). |

Un dossier sans `manifest.json` valide, ou dont la page d'entrée n'existe pas, est ignoré.

### Options

| `type` | Contrôle dans l'éditeur | Valeur |
| --- | --- | --- |
| `string` | champ texte | string |
| `number` | champ numérique (`min`, `max`) | number |
| `boolean` | case à cocher | boolean |
| `color` | sélecteur de couleur | `"#rrggbb"` |
| `select` | liste (`choices: [{ value, label }]`) | la `value` choisie |

> [!SCREENSHOT] widget-options-form
> Le widget Hello score sélectionné dans l'éditeur et, à droite, la section **Options** générée par son manifeste :
> champ texte (Libellé), sélecteur de couleur, case « Afficher la précision », champ numérique (Taille du texte) et
> liste (Mode).

Chaque option a une `key`, un `label` (affiché) et une valeur par défaut `default`.

## Ce que reçoit ta page

L'adresse de l'API et les options sont passées dans l'URL, pour que le **premier affichage** soit
déjà correct :

- `?api=http://127.0.0.1:24051` : base de l'API (le port peut changer) ;
- `&options={"color":"#f472b6","size":56}` : valeurs des options (défauts + choix de l'utilisateur),
  en JSON.

Quand l'utilisateur modifie une option dans l'éditeur, la page **n'est pas rechargée** : elle
reçoit un message :

```js
window.addEventListener("message", (event) => {
  if (event.data?.type === "yar:options") {
    const options = event.data.options; // toutes les valeurs, à jour
    // ... mets ton affichage à jour
  }
});
```

### Lire les données

```js
const params = new URLSearchParams(location.search);
const api = params.get("api");
let options = JSON.parse(params.get("options") || "{}");

const ws = new WebSocket(api.replace("http", "ws") + "/api/v1/ws?topics=gameplay&events=false");
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "hello" || msg.type === "state") {
    // msg.data.gameplay.score, .combo, .accuracy, .pp ... (voir le [modèle de données](DATA_MODEL.md))
  }
};
```

Voir l'exemple complet : [`examples/hello-score`](examples/hello-score/index.html).

## Lire les touches

Les touches du clavier et de la souris vues par le jeu sont disponibles en temps réel sur leur propre
WebSocket, `/api/v1/inputs/ws` (voir [API locale](API.md#touches-en-temps-réel)) : un widget de touches
personnalisé s'y connecte comme au flux principal.

```js
const input = new WebSocket(api.replace("http", "ws") + "/api/v1/inputs/ws");
input.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "hello" || msg.type === "input") draw(msg.data.keys, msg.data.mouse);
};
```

Tant que ton widget garde ce WebSocket ouvert, l'application lit les touches dans le jeu.

## Réagir aux événements

Pour **réagir** à quelque chose (une note, un miss, un combo cassé, le début d'une partie), le [WebSocket des événements](WEBSOCKET.md#flux-des-événements) est plus simple que de comparer deux états : il n'envoie que les événements, et `?names=` garde ceux qui t'intéressent. Garde le flux de l'état pour les valeurs affichées en continu.

```js
const params = new URLSearchParams(location.search);
const api = params.get("api");

function pulse(color) {
  document.body.animate([{ background: color }, { background: "transparent" }], 300);
}

// Ouvre le flux des événements et appelle onEvent pour chacun de ceux demandés.
function listen(names, onEvent) {
  const ws = new WebSocket(api.replace("http", "ws") + `/api/v1/events/ws?names=${names.join(",")}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "event") onEvent(msg.event);
  };
  ws.onclose = () => setTimeout(() => listen(names, onEvent), 1000); // se reconnecte si l'API redémarre
}

listen(["hit", "miss", "comboBreak"], (event) => {
  if (event.name === "hit" && event.judgement === "great") pulse("#38bdf8");
  if (event.name === "miss") pulse("#f87171");
  if (event.name === "comboBreak") console.log(`combo perdu : ${event.lost}`);
});
```

`hit` donne le `judgement`, le `count` de notes et, quand le jeu les fournit, leurs erreurs de timing (`errorsMs`) ; `miss` le `count` ; `comboBreak` le combo perdu (`lost`), aussi quand un slider casse le combo sans miss. Tous les champs sont dans [Événements](WEBSOCKET.md#événements).

## Bonnes pratiques

- **Fond transparent** : `html, body { background: transparent; }` — le widget est dessiné
  par-dessus le jeu. Ajoute une ombre de texte (`text-shadow`) pour la lisibilité.
- **Remplis la zone** : la page occupe exactement la boîte du widget ; utilise des unités
  relatives (`%`, `em`, `vw`) ou des variables CSS pour qu'elle s'adapte au redimensionnement.
- **Reconnexion** : l'API peut être redémarrée (changement de port, redémarrage de l'app) ;
  rouvre le WebSocket avec un délai quand il se ferme.
- **Reste léger** : l'overlay est peint par-dessus le jeu. Évite les animations permanentes ou les
  effets coûteux (flous, grandes ombres) ; un rafraîchissement faible suffit pour du texte.
- **Filtre ce que tu reçois** : `?topics=gameplay,time` réduit le trafic ; `&events=false`
  coupe les événements si tu n'en as pas besoin. Pour les seuls événements, `/api/v1/events/ws?names=miss,comboBreak`.

## Sécurité : ce que ton widget peut (et ne peut pas) faire

Chaque widget tourne dans une **iframe isolée** (`sandbox="allow-scripts"`, sans
`allow-same-origin`) : sa page a une origine « opaque ». Concrètement :

- il exécute son propre JavaScript et peut lire l'API locale en `GET` / WebSocket ;
- il **ne peut pas** accéder à l'application, à ses commandes internes, au stockage du
  navigateur, ni aux autres widgets ;
- il ne peut pas ouvrir de fenêtre ni de formulaire (pas de `allow-popups` / `allow-forms`).

Un widget téléchargé peut cependant faire des requêtes réseau (comme toute page web) :

> [!ATTENTION] **N'installe que des widgets dont tu fais confiance** à la source, comme tu le ferais pour une source
> navigateur OBS.

## Partager un widget

Un widget est un simple dossier : zippe-le, ou publie-le dans un dépôt. Pour l'utiliser, il suffit
de le déposer dans le dossier des widgets et d'actualiser la palette. Les layouts qui l'utilisent
se partagent à part (export JSON de l'éditeur) ; ils référencent le widget par le nom de son
dossier.
