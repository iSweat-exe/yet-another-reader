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
> en légende : score, combo, maxCombo, accuracy, rank, pp, ppFc, ppSs, ppTable, playStatus, ur, health, progress, great,
> ok, meh, miss, hitErrors.

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `score` | Score | Le score, avec séparateurs de milliers. | 500 × 84 |
| `combo` | Combo | Le combo actuel (`124x`). | 360 × 110 |
| `maxCombo` | Combo max | Le combo maximal atteint, avec celui de la map (`312x / 540x`). | 300 × 44 |
| `accuracy` | Précision | La précision de la partie (`98.71%`). | 300 × 48 |
| `rank` | Rang | Le rang provisoire (`SS`, `S`, `A`…). | 120 × 80 |
| `pp` | PP | Les PP en direct, et ce qu'ils seraient en **FC** et en **SS**. | 300 × 70 |
| `ppFc` | PP si FC | Les PP que la partie vaudrait en **FC**, seuls (`47pp FC`). | 240 × 44 |
| `ppSs` | PP si SS | Les PP que la partie vaudrait en **SS**, seuls (`628pp SS`). | 240 × 44 |
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

> `hitCounts` (« 300 / 100 / 50 / miss » en un seul widget) existe toujours : le layout classique et les
> layouts déjà enregistrés l'utilisent. Il n'est plus proposé dans la palette ; utilise les quatre
> widgets séparés ci-dessus pour de nouveaux layouts.

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
| `bpm` | BPM | Le BPM de la map. | 200 × 44 |
| `cs` | Taille des cercles (CS) | La valeur de CS. | 80 × 64 |
| `ar` | Vitesse d'approche (AR) | La valeur d'AR. | 80 × 64 |
| `od` | Difficulté globale (OD) | La valeur d'OD. | 80 × 64 |
| `hp` | Drain de vie (HP) | La valeur de HP. | 80 × 64 |
| `timer` | Chrono du morceau | Le temps écoulé sur la durée (`1:12 / 3:05`). | 240 × 44 |
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

L'**avatar** est chargé depuis son adresse en ligne : une connexion Internet est nécessaire.

## Divers

| Type | Nom | Affiche | Taille par défaut |
| --- | --- | --- | --- |
| `text` | Texte | Un texte fixe : un titre, une signature, une étiquette à côté d'un autre widget. | 360 × 44 |
| `clock` | Horloge | L'heure de la journée. | 220 × 44 |

> [!SCREENSHOT] gallery-misc
> Les widgets Texte (avec « Merci d'avoir regardé » comme exemple) et Horloge (avec secondes, puis en 12 heures) sur
> fond de partie, avec le panneau Options du widget Texte à droite.

| Widget | Option | Défaut | Effet |
| --- | --- | --- | --- |
| `text` | `text` | `Text` | Le texte à afficher (les retours à la ligne sont conservés). |
| `clock` | `seconds` | `false` | Affiche aussi les secondes. |
| `clock` | `hour12` | `false` | Horloge sur 12 heures (AM/PM) au lieu de 24. |

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
| `key` | `Z` | Nom de la touche : `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… pour le clavier ; `Left`, `Right`, `Middle`, `Button1`, `Button2` pour la souris. Voir les noms dans [l'API](API.md#touches-en-temps-réel). |
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
