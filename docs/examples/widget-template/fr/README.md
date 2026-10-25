# __NAME__

Un widget communautaire pour **Yet Another Reader** : une petite page web (HTML, CSS, JavaScript) dessinée par l'overlay
en jeu par-dessus osu!lazer. Ce dossier est un point de départ propre et vide ; tout ce qu'il faut pour le remplir est ici.

## Ce que contient ce dossier

| Fichier | Rôle |
| --- | --- |
| `manifest.json` | L'identité du widget : nom, taille par défaut et **options** modifiables dans l'éditeur. |
| `index.html` | La page. Charge `style.css` et `script.js`. |
| `style.css` | L'apparence. Le fond de la page est transparent : elle est dessinée par-dessus le jeu. |
| `script.js` | La logique : reçoit l'état du jeu, les événements et les options, et dessine. Commence ici. |
| `types.d.ts` | Les types des données de l'API, pour qu'un éditeur (VS Code) complète `state.gameplay.combo` à ta place. |
| `docs/` | La documentation de l'API, copiée ici pour voyager avec le widget : `WIDGETS.md` (ce format), `DATA_MODEL.md` (chaque champ), `REST_API.md`, `WEBSOCKET.md` (état et événements). |

Modifie un fichier et enregistre : **l'overlay et l'éditeur rechargent le widget tout seuls** (rechargement à chaud).

## Comment ça marche

- L'overlay affiche `index.html` dans un cadre isolé (`sandbox="allow-scripts"`) : ton script peut tourner et appeler l'API
  locale, rien d'autre. Pas de cookies, pas de `localStorage`, pas d'accès à l'app.
- L'adresse est `index.html?api=http://127.0.0.1:24051&options={...}` : lis les deux dans `location.search`
  (`script.js` le fait déjà).
- Quand l'utilisateur change une option dans l'éditeur, la page reçoit un message `{ type: "yar:options", options }`
  au lieu d'être rechargée.
- Les données du jeu viennent de l'API locale, comme pour une source navigateur OBS :
  - **État** (l'allure du jeu maintenant) : WebSocket `/api/v1/ws`. `?topics=gameplay,beatmap` ne garde que ce que tu utilises.
  - **Événements** (quelque chose vient d'arriver : un hit, un miss, un combo cassé, une partie commencée ou finie) : WebSocket
    `/api/v1/events/ws`, `?names=miss,comboBreak` pour filtrer.
  - **Lectures ponctuelles** : routes REST comme `/api/v1/beatmap` ou `/api/v1/personal-best`.

## Ajouter une option

Dans `manifest.json`, ajoute une entrée à `options` ; l'éditeur affiche un contrôle pour elle :

```json
{ "key": "color", "type": "color", "label": "Couleur", "default": "#f472b6" }
```

Types : `string`, `number` (`min`, `max`), `boolean`, `color`, `select` (`choices: [{ "value": "a", "label": "A" }]`).
Dans `script.js`, lis-la avec `options.color` et réagis dans `applyOptions()`.

## Taille

`defaultSize` dans le manifeste est la taille (en pixels de layout, pour un écran de 1080 px de haut) du widget quand on l'ajoute.
L'utilisateur peut le redimensionner ; fais remplir son cadre à la page (`#app` fait 100 % de large et de haut) et utilise des unités relatives.

## L'essayer

- Dans l'éditeur, ajoute le widget depuis la palette (section Communauté, **Actualiser** s'il n'y est pas encore) : la simulation le nourrit.
- Hors de l'app : lance `cargo run -p overlay-server --example sample` dans le projet, ouvre
  `http://127.0.0.1:24051/widgets/<dossier>/index.html` et regarde une partie scénarisée.
- La documentation est aussi dans l'app (onglet Documentation, **API** et **Widgets communautaires**) et a un terrain de jeu de l'API.

## Le partager

Zippe ce dossier (sans rien de privé). Pour installer un widget partagé, dézippe-le dans le dossier des widgets
(palette de l'éditeur, **Ouvrir le dossier des widgets**) : il apparaît tout seul dans la palette.
