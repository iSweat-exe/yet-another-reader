# Widgets intégrés

Les widgets intégrés sont fournis par l'application. Ils se trouvent dans la palette de l'[éditeur](EDITOR.md),
section **Intégrés**, classés en trois catégories. Pour en créer de nouveaux sans toucher au code,
voir [Widgets communautaires](WIDGETS.md).

> [!SCREENSHOT] palette
> Palette de gauche de l'éditeur avec les catégories Partie, Beatmap, Joueur, Touches, Divers : la première dépliée avec
> sa liste de widgets et leurs icônes, les autres repliées avec le chevron. Cadrer sur la colonne.

Dans un layout, le champ `type` d'un widget est l'identifiant de la colonne **Type**
([format](LAYOUT.md)). Les tailles sont en pixels de référence (écran de 1080 px de haut) ; la taille du
texte est une fraction de la hauteur `h` du widget, multipliée par `style.scale`.

## Partie

Ces widgets lisent la partie en cours ; hors partie, ils affichent des valeurs neutres.

> [!SCREENSHOT] gallery-gameplay
> Planche de tous les widgets de la catégorie Partie sur fond de partie (données simulées), chacun avec son nom de type
> en légende : score, combo, maxCombo, accuracy, rank, pp, ppFc, ppSs, ppMax, ppTable, playStatus, ur, health, progress, great,
> ok, meh, miss, hitErrors, hitErrorBar, playGraph, pbDelta.

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `score` | Score | Le score, avec séparateurs de milliers. | 500 × 84 |
| `combo` | Combo | Le combo actuel (`124x`). | 360 × 110 |
| `maxCombo` | Combo max | Le combo maximal atteint, avec celui de la map (`312x / 540x`). | 300 × 44 |
| `accuracy` | Précision | La précision de la partie (`98.71%`). | 300 × 48 |
| `rank` | Rang | Le rang provisoire (`SS`, `S`, `A`…). | 120 × 80 |
| `pp` | PP actuels | Les PP en direct, seuls (`412pp`). | 300 × 70 |
| `ppFc` | PP si FC | Les PP que la partie vaudrait en **FC**, seuls (`47pp FC`). | 240 × 44 |
| `ppSs` | PP si SS | Les PP que la partie vaudrait en **SS**, seuls (`628pp SS`). | 240 × 44 |
| `ppMax` | PP max | Les PP de la beatmap entière en **SS** avec les mods actifs (`340pp MAX`). Affichable hors partie. | 240 × 44 |
| `ppTable` | PP à 95 / 98 / 99 / 100 % | Ce que vaut la beatmap à ces précisions, avec les mods actifs. Affichable hors partie. | 420 × 64 |
| `playStatus` | Pause / échec | `PAUSE` ou `ÉCHEC` quand c'est le cas, rien le reste du temps. | 320 × 56 |
| `ur` | UR | L'unstable rate. | 200 × 36 |
| `health` | Santé | La barre de vie (utilise `style.color`). | 620 × 14 |
| `progress` | Progression | La position dans la chanson, en barre. | 1000 × 6 |
| `great` | Great (300) | Le nombre de 300. | 100 × 80 |
| `ok` | Good (100) | Le nombre de 100. | 100 × 80 |
| `meh` | Meh (50) | Le nombre de 50. | 100 × 80 |
| `miss` | Miss | Le nombre de miss. | 100 × 80 |
| `hitErrors` | Erreurs de timing | Les dernières erreurs de timing, en traits sur une ligne. | 500 × 36 |
| `hitErrorBar` | Barre d'erreurs de timing | Les erreurs de timing sur l'échelle des fenêtres de hit, comme dans osu!lazer. | 500 × 48 |
| `playGraph` | Graphe PP / précision | Les PP, la précision ou le score tout au long de la chanson, avec la courbe du record en option. | 520 × 140 |
| `pbDelta` | Écart au record | L'écart entre la partie et ton record, **au même point de la chanson**. | 280 × 84 |
| `ppDelta` | Écart au PP max | L'écart entre tes PP en cours et le **plus haut PP** que tu as eu sur cette map. | 280 × 84 |
| `ppGraph` | Graphe PP (formes) | Les PP de la partie au fil de la chanson, en ligne, aire, marches, barres, points ou anneau. | 420 × 140 |

> `hitCounts` (« 300 / 100 / 50 / miss » en un seul widget) existe toujours : le layout classique et les
> layouts déjà enregistrés l'utilisent. Il n'est plus proposé dans la palette ; utilise les quatre
> widgets séparés ci-dessus pour de nouveaux layouts.

Dans la palette, `hitErrorBar` est dans le groupe *Jugements* ; `playGraph` et `pbDelta` forment le groupe *Progression et record* ; `ppDelta` et `ppGraph` sont dans le groupe des PP, avec `pp`, `ppFc`, `ppSs`, `ppMax` et `ppTable`.

### Barre d'erreurs, graphe et record

**Barre d'erreurs de timing** (`hitErrorBar`) : comme le compteur d'osu!lazer, elle place chaque hit sur une échelle de timing, tôt à gauche, tard à droite, le zéro au milieu.

- Les **bandes** colorées sont les fenêtres de hit : *great* (bleu), *ok* (vert) et *meh* (jaune). Elles viennent de l'**OD effectif** : celui de la map, ×1,4 (plafonné à 10) avec **HR**, ×0,5 avec **EZ**, et la valeur forcée par **Difficulty Adjust** quand il est actif (il l'emporte sur HR et EZ).
- Les bandes ne sont dessinées que pour **osu!standard**. Dans les autres modes, la barre garde une échelle fixe de ±120 ms, sans bandes ni couleurs par jugement.
- Chaque hit laisse un **trait**, coloré selon son jugement ; le plus récent est **plus épais**, les plus anciens s'estompent.
- Un **repère** (triangle) marque la **moyenne** des erreurs : tu vois d'un coup d'œil si tu joues plutôt tôt ou tard.

**Graphe PP / précision** (`playGraph`) : la valeur choisie, dessinée **au fil de la partie**, sur toute la largeur de la map (de son premier à son dernier objet). La courbe du **record**, en tirets, peut passer derrière : la partie se lit face à ce qu'elle doit battre. Elle vient de [`GET /personal-best`](REST_API.md#get-personal-best).

**Écart au record** (`pbDelta`) : la valeur actuelle moins celle du record **au même temps de chanson** (interpolée entre deux échantillons du record), car c'est avec cela qu'un score en direct doit se comparer. **Vert** quand tu es devant (ou à égalité), **rouge** quand tu es derrière. Sous l'écart, le record final (*Record 148pp*, ou *Pas encore de record*). Sans record, ou hors partie, il affiche « — ».

**Écart au PP max** (`ppDelta`) : les PP en cours moins le **plus haut PP** que tu as atteint sur cette map, toutes parties solo terminées confondues (pas seulement celle du record : une partie au score plus bas mais aux PP plus hauts compte). **Vert** quand tu es au niveau de ce maximum ou au-dessus (un nouveau record de PP), **rouge** en dessous ; sous l'écart, le maximum (*Max de la map 152pp*). Sans maximum connu, ou hors partie, il affiche « — ». Le maximum vient de `maxPp`, dans [`GET /personal-best`](REST_API.md#get-personal-best).

**Graphe PP (formes)** (`ppGraph`) : les PP de la partie au fil de la chanson, dans la forme choisie : `line` (ligne), `area` (aire), `step` (marches), `bars` (barres), `dots` (points) ou `ring` (anneau). L'anneau n'a pas d'axe du temps : il montre les PP en cours comme part des PP d'une partie parfaite sur la map (`difficulty.pp100`).

> [!NOTE] Le record est le meilleur score **terminé en solo que l'application a vu** : les parties jouées avant son installation sont inconnues. Voir [`GET /personal-best`](REST_API.md#get-personal-best).

| Widget | Option | Défaut | Effet |
| --- | --- | --- | --- |
| `hitErrorBar` | `windows` | `true` | Dessine les bandes des fenêtres de hit (osu!standard seulement). |
| `hitErrorBar` | `colorize` | `true` | Colore chaque trait selon son jugement (osu!standard seulement). |
| `hitErrorBar` | `count` | `30` | Nombre de hits récents affichés (5 à 100). |
| `hitErrorBar` | `average` | `true` | Affiche le repère de la moyenne. |
| `hitErrorBar` | `labels` | `false` | Écrit « Tôt » et « Tard » aux deux bouts. |
| `playGraph` | `metric` | `pp` | La valeur tracée : `pp`, `accuracy` (précision) ou `score`. |
| `playGraph` | `style` | `area` | `line` (ligne seule) ou `area` (ligne et aire remplie). |
| `playGraph` | `color` | `#f472b6` | Couleur de la courbe. |
| `playGraph` | `lineWidth` | `3` | Épaisseur du trait, de 1 à 10. |
| `playGraph` | `record` | `true` | Dessine la courbe du record, en tirets. |
| `playGraph` | `showValue` | `true` | Écrit la valeur actuelle dans le coin. |
| `pbDelta` | `metric` | `pp` | Ce qu'on compare : `pp`, `accuracy` ou `score`. |
| `pbDelta` | `showRecord` | `true` | Affiche le record final sous l'écart. |
| `pbDelta` | `ahead` | `#4ade80` | Couleur quand tu es devant le record. |
| `pbDelta` | `behind` | `#f87171` | Couleur quand tu es derrière. |
| `ppDelta` | `showMax` | `true` | Affiche le PP max sous l'écart. |
| `ppDelta` | `ahead` | `#4ade80` | Couleur quand tu es au niveau du max ou au-dessus. |
| `ppDelta` | `behind` | `#f87171` | Couleur quand tu es en dessous. |
| `ppGraph` | `shape` | `area` | `line`, `area`, `step`, `bars`, `dots` ou `ring`. |
| `ppGraph` | `color` | `#f472b6` | Couleur du tracé. |
| `ppGraph` | `lineWidth` | `3` | Épaisseur du trait (ou taille des points), de 1 à 10. |
| `ppGraph` | `showValue` | `true` | Écrit les PP en cours (dans le coin, ou au centre de l'anneau). |

## Beatmap

Ces widgets lisent la beatmap sélectionnée ou jouée, avec les mods actifs.

> [!SCREENSHOT] gallery-beatmap
> Planche des widgets de la catégorie Beatmap sur fond de partie, légende avec le type sous chacun : beatmapInfo, title,
> artist, mapper, version, stars, bpm, cs/ar/od/hp en rangée, timer, mods (icônes HD et DT).

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `beatmapInfo` | Infos beatmap | Titre, artiste, difficulté, étoiles, BPM, AR et OD. | 760 × 80 |
| `title` | Titre | Le titre de la beatmap, sur une ligne. | 700 × 44 |
| `artist` | Artiste | L'artiste de la beatmap. | 600 × 36 |
| `mapper` | Mappeur | Le créateur de la beatmap (« mappée par … »). | 360 × 32 |
| `version` | Nom de la difficulté | Le nom de la difficulté (`collab expert`). | 420 × 32 |
| `background` | Image de fond | L'image de fond de la beatmap. | 640 × 360 |
| `stars` | Étoiles | La difficulté en étoiles (avec les mods). | 180 × 44 |
| `difficultyGraph` | Frise de difficulté | La difficulté de la map tout au long de la chanson, en barres (basses = calme, hautes = dense), avec un curseur qui suit la chanson et la difficulté globale (étoiles avec les mods). | 720 × 90 |
| `bpm` | BPM | Le BPM de la map. | 200 × 44 |
| `cs` | Taille des cercles (CS) | La valeur de CS. | 80 × 64 |
| `ar` | Vitesse d'approche (AR) | La valeur d'AR. | 80 × 64 |
| `od` | Difficulté globale (OD) | La valeur d'OD. | 80 × 64 |
| `hp` | Drain de vie (HP) | La valeur de HP. | 80 × 64 |
| `timer` | Chrono du morceau | Le temps écoulé sur la durée (`1:12 / 3:05`), compté du **premier au dernier hit object** : 0:00 est le premier clic, la fin est le dernier, la musique n'est pas regardée (un saut d'intro ne décale rien). La barre de progression suit la même règle. | 240 × 44 |
| `mods` | Mods | Les icônes des mods actifs. | 400 × 40 |

Les widgets texte (`title`, `artist`, `mapper`, `version`) tiennent sur **une ligne** : un texte trop long est
coupé par « … » plutôt que de déborder. Pour afficher la composition en plusieurs lignes, utilise
plusieurs widgets, ou **Infos beatmap** qui regroupe tout.

`cs`, `ar`, `od` et `hp` affichent la valeur **de la map** (sans l'effet des mods) sous son libellé :
placés côte à côte et [groupés](EDITOR.md), ils forment une rangée de statistiques.

### Options des widgets de beatmap

| Widget | Option | Défaut | Effet |
| --- | --- | --- | --- |
| `title`, `artist` | `unicode` | `false` | Affiche le texte original (Unicode : japonais, etc.) plutôt que le texte romanisé. |
| `mapper` | `prefix` | `true` | Affiche « mappée par » devant le nom. |
| `background` | `fit` | `cover` | `cover` remplit la zone en recadrant, `contain` tient entièrement dedans. |
| `background` | `radius` | `12` | Arrondi des coins, en pixels de référence. |
| `background` | `blur` | `0` | Flou de l'image, en pixels (0 à 60). |
| `difficultyGraph` | `style` | `bars` | `bars` (barres), `curve` (courbe lissée, avec remplissage en option), `line` (ligne seule), `area` (aire remplie sans trait) ou `points`. |
| `difficultyGraph` | `count` | `120` | Nombre de barres ou de points (20 à 240). Les données ont 120 valeurs : en dessous, on garde le **maximum** de chaque groupe (un pic court ne disparaît pas) ; au-dessus, on interpole. Rien n'est recalculé. |
| `difficultyGraph` | `color` | `#f472b6` | Couleur : pleine pour la partie déjà jouée, estompée pour la suite (dans tous les styles). |
| `difficultyGraph` | `height` | `100` | Part de la hauteur du widget utilisée par le graphique, en % (20 à 100). |
| `difficultyGraph` | `round` | `50` | Style `bars` : arrondi des barres, en % (0 = carrées, 100 = arrondies). |
| `difficultyGraph` | `smooth` | `60` | Styles courbes : lissage, en % (0 = segments droits, 100 = courbe pleine). La courbe est monotone : elle ne dépasse jamais les valeurs de ses deux points voisins. |
| `difficultyGraph` | `lineWidth` | `2` | Styles courbes : épaisseur du trait (ou taille des points), de 1 à 8. |
| `difficultyGraph` | `fill` | `true` | Style `curve` : remplit sous la courbe avec un dégradé. |
| `difficultyGraph` | `fillOpacity` | `45` | Opacité du haut du dégradé, en % (5 à 100). |
| `difficultyGraph` | `reverse` | `false` | Retourne le graphique à l'envers (les barres pendent du bord haut) pour le placer en haut de l'écran. |
| `difficultyGraph` | `showValue` | `false` | Affiche la difficulté globale (étoiles avec les mods) en haut à gauche. |

La **frise de difficulté** lit [`difficultyGraph`](DATA_MODEL.md#difficultygraph) : les barres sont normalisées sur la map
elle-même (la plus haute est le passage le plus dur *de cette map*) et suivent les mods de vitesse (DT, HT) et de cercles
(HR, EZ). Tant que le calcul n'est pas fini, ou si le fichier de la map est introuvable, une ligne faible tient la place.

> [!IMPORTANT] L'**image de fond** est servie par l'[API locale](REST_API.md#get-assetsbackground) : il faut qu'elle soit
> **activée** dans les réglages. Quand l'image n'est pas disponible (données simulées de l'éditeur, API coupée,
> beatmap sans image), le widget affiche un rectangle de substitution pour garder sa place. L'opacité du
> style (`style.opacity`) règle la transparence de l'image.

> [!SCREENSHOT] background-widget
> Trois widgets Image de fond côte à côte avec la même beatmap : ajustement `cover`, `contain`, puis `cover` avec
> arrondi 40 et flou 12. À droite, le panneau Options (Ajustement, Arrondi des coins, Flou).

## Joueur

Ces widgets lisent le profil du joueur connecté dans osu!lazer. Ils n'affichent rien (ou `—`) tant que
le joueur n'est pas connecté ou que ses statistiques ne sont pas chargées.

> [!SCREENSHOT] gallery-player
> Planche des widgets Joueur : photo de profil, pseudo, rang mondial, rang national, PP du joueur, précision du joueur,
> parties jouées, avec une légende sous chacun.

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `avatar` | Photo de profil | L'avatar (la lettre initiale si l'image est introuvable). | 96 × 96 |
| `username` | Pseudo | Le nom d'utilisateur. | 320 × 48 |
| `globalRank` | Rang mondial | Le rang mondial (`#12 873`). | 240 × 44 |
| `countryRank` | Rang national | Le rang dans le pays (`FR #412`). | 240 × 44 |
| `playerPp` | PP du joueur | Le total de PP du profil. | 240 × 44 |
| `playerAccuracy` | Précision du joueur | La précision du profil. | 240 × 44 |
| `playCount` | Parties jouées | Le nombre de parties jouées. | 280 × 44 |
| `flag` | Drapeau du pays | Le drapeau du pays du joueur (son code en texte si le drapeau n'existe pas). Options : afficher le code pays, arrondi des coins. | 72 × 48 |
| `spectators` | Spectateurs | Les spectateurs de la partie du joueur : nombre seul, pseudos, avatars ou avatars et pseudos. | 280 × 48 |

L'**avatar** est chargé depuis son adresse en ligne : une connexion Internet est nécessaire.

Le **pseudo** a l'option *Afficher le drapeau*. Les drapeaux sont fournis avec l'application (dossier
`public/Textures/flags`, un par code pays ISO à deux lettres) : aucun accès réseau. Ils sont servis par la fenêtre de
l'overlay ; les widgets communautaires (pages web) n'y ont pas accès, ils lisent `user.countryCode` dans l'API.

Le widget **Spectateurs** a pour options : l'affichage (*Nombre seul*, *Pseudos*, *Avatars*, *Avatars et pseudos*),
*Afficher le nombre*, le nombre maximum affiché (un « +N » complète), les avatars en pile (qui se chevauchent),
*Masquer sans spectateur* et *Charger les avatars depuis osu! (Internet)*.

> **Vie privée.** Les avatars des spectateurs viennent des serveurs d'osu! (`https://a.ppy.sh/{id}`) : les afficher
> envoie une requête réseau externe par avatar, chargée seulement quand le widget est affiché. Décoche *Charger les
> avatars depuis osu!* pour n'en faire aucune : l'image par défaut est alors utilisée (elle l'est aussi hors connexion).
>
> La liste vient du client de spectateur du jeu (`SpectatorClient.watchingUsers`) : elle n'est remplie que si le jeu est
> connecté en ligne et que quelqu'un regarde.

## Divers

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `text` | Texte | Un texte fixe : un titre, une signature, une étiquette à côté d'un autre widget. | 360 × 44 |
| `clock` | Horloge | L'heure de la journée. | 220 × 44 |
| `image` | Image | Une image importée par toi (logo, cadre, décor) : PNG, JPEG, GIF, WebP ou SVG. | 320 × 320 |

> [!SCREENSHOT] gallery-misc
> Les widgets Texte (avec « Merci d'avoir regardé » comme exemple) et Horloge (avec secondes, puis en 12 heures) sur
> fond de partie, avec le panneau Options du widget Texte à droite.

| Widget | Option | Défaut | Effet |
| --- | --- | --- | --- |
| `text` | `text` | `Text` | Le texte à afficher (les retours à la ligne sont conservés). |
| `clock` | `seconds` | `false` | Affiche aussi les secondes. |
| `clock` | `hour12` | `false` | Horloge sur 12 heures (AM/PM) au lieu de 24. |
| `image` | `image` | (aucune) | L'image à afficher : choisis-la dans la liste ou clique sur **Importer une image…**. Le layout ne garde que son identifiant. |
| `image` | `fit` | `cover` | `cover` remplit la zone en recadrant, `contain` tient entièrement dedans, `fill` étire l'image à la taille de la zone. |
| `image` | `radius` | `0` | Arrondi des coins, en pixels de référence (0 à 400). |
| `image` | `borderWidth` | `0` | Épaisseur de la bordure, en pixels (0 à 40). |
| `image` | `borderColor` | `#ffffff` | Couleur de la bordure. |
| `image` | `exposure`, `contrast`, `saturation`, `temperature`, `shadows`, `highlights` | `0` | L'éditeur d'image : exposition, contraste, saturation, température, ombres et hautes lumières, de -100 à 100 (0 = intact). |
| `image` | `hue` | `0` | Teinte, de -180 à 180 degrés. |

Les réglages de l'éditeur d'image sont un filtre appliqué à l'affichage : le fichier importé n'est jamais modifié, et les **GIF** et **WebP animés** continuent de jouer (le navigateur les anime, le filtre suit chaque image).

L'**opacité** du widget Image est celle du style (`style.opacity`).

> [!IMPORTANT] Le fichier choisi est **copié** dans les données de l'application (PNG, JPEG, GIF, WebP ou SVG, 15 Mo au
> maximum) et servi par l'[API locale](REST_API.md#get-imagesid) : il faut qu'elle soit **activée** dans les réglages, et
> les sources navigateur (OBS) affichent la même image. Si l'image est supprimée de la liste ou que l'API est coupée,
> le widget affiche un rectangle de substitution. Dans le navigateur (`npm run dev`), les images importées ne vivent
> que le temps de la session.

## Touches

Ces widgets montrent les **touches et boutons de souris que le jeu voit tenus**, en temps réel : de quoi
faire un overlay de touches. Les touches sont lues dans le jeu à part du reste, bien plus vite
(`inputPollIntervalMs`, 2 ms par défaut), et **seulement quand un de ces widgets est affiché** : sans
eux, rien n'est lu en plus. Voir [Touches en temps réel](API.md#touches-en-temps-réel) pour le détail et
l'accès par l'API.

> [!SCREENSHOT] inputs-widgets
> Une rangée de touches Z, X, M1, M2 : deux éteintes (fond sombre, contour blanc) et deux allumées (fond rose), avec
> compteurs de pressions, puis un widget « 12 KPS ». Légende « au repos » / « tenue ».

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `inputKey` | Touche | Une touche ou un bouton de souris, sous forme de touche qui s'allume quand elle est tenue. | 96 × 96 |
| `kps` | Touches par seconde | Le nombre d'appuis par seconde (sur la dernière seconde), toutes touches confondues. | 160 × 44 |

Le widget **Touche** a des **options** (section *Options* des propriétés, champ `options` du layout) :

| Option | Défaut | Effet |
| --- | --- | --- |
| `device` | `keyboard` | `keyboard` ou `mouse`. |
| `key` | `Z` | Nom de la touche : `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… pour le clavier ; `Left`, `Right`, `Middle`, `Button1`, `Button2` pour la souris. Choisie dans une liste (clavier ou souris selon `device`). Voir les noms dans [l'API](API.md#touches-en-temps-réel). |
| `label` | *(vide)* | Texte affiché à la place du nom de la touche. |
| `showCount` | `false` | Affiche le nombre d'appuis sous la touche. Le compte repart de zéro à chaque partie et ne compte que pendant une partie. |
| `pressedColor` | `#f472b6` | Couleur de fond quand la touche est tenue. |
| `trail` | `false` | Affiche la **traînée** : chaque appui laisse une barre qui s'éloigne de la touche en s'effaçant (plus l'appui est long, plus la barre est longue). La touche garde sa taille (le plus petit côté du widget) et la traînée occupe le reste : **allonge le widget** dans le sens de la traînée (par ex. 96 × 300), sinon elle n'a pas de place. |
| `trailDirection` | `up` | Sens de la traînée : `up`, `down`, `left` ou `right`. |
| `trailDuration` | `1000` | Temps (en ms, de 200 à 5000) qu'une barre met à traverser toute la traînée : plus c'est court, plus elle défile vite. |

> [!SCREENSHOT] key-options
> Section **Options** du widget Touche dans les Propriétés : liste Périphérique (Clavier), champ Nom de la touche (`Z`),
> Texte facultatif, interrupteur « Afficher le nombre de pressions » et sélecteur de couleur « Couleur quand appuyée »
> (rose).

La couleur du **style** (`style.color`) donne la couleur du contour et du texte au repos.

Pour un overlay de touches classique : ajoute un widget **Touche** par touche (`Z`, `X`, `Left` pour la
souris…), règle leurs options, puis [aligne-les et espace-les](EDITOR.md#espacement), éventuellement
en les [groupant](EDITOR.md#groupes).

## Options

Certains widgets ont des **options** (section *Options* des propriétés de l'éditeur). Elles sont enregistrées
dans le champ `options` du widget, dans le [layout](LAYOUT.md#champs-dun-widget) :

```json
{ "id": "title", "type": "title", "anchor": "top-left", "x": 30, "y": 24, "w": 700, "h": 44,
  "pages": ["playing"], "options": { "unicode": true } }
```

Une option absente prend sa valeur par défaut, donnée dans les tableaux de cette page.

## Style commun

Tous les widgets intégrés acceptent le [style](LAYOUT.md) : `color`, `scale`, `opacity`, `align`,
`animate` et `animationMs` (les chiffres des widgets de partie sont animés). Les widgets sans texte
(`health`, `progress`, `hitErrors`) n'utilisent que la couleur et l'opacité.

## Ce qui n'existe pas encore ?

Il manque un widget dont tu as besoin ? Deux options : en créer un en HTML
([Widgets communautaires](WIDGETS.md)), ou l'ajouter à l'application
([Contribuer](CONTRIBUTING.md#ajouter-un-widget-intégré)).
