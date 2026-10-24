# Format des layouts

Les layouts sont des fichiers JSON dans le dossier de configuration de l'application
(`overlays/<nom>.json`). Ils se modifient normalement dans l'[éditeur](EDITOR.md), mais le format est
ouvert : tu peux les lire, les générer ou les corriger à la main.

```json
{
  "version": 2,
  "name": "default",
  "referenceHeight": 1080,
  "widgets": [
    {
      "id": "score",
      "type": "score",
      "anchor": "top-right",
      "x": 30, "y": 24, "w": 500, "h": 84,
      "pages": ["playing", "paused", "break"],
      "style": { "color": "#ffffff", "align": "right", "scale": 1, "opacity": 1 }
    }
  ]
}
```

| Champ du document | Description |
| --- | --- |
| `version` | `2`. Les layouts `version: 1` sont convertis automatiquement (voir plus bas). |
| `name` | Nom du layout (celui du fichier). |
| `referenceHeight` | Hauteur de l'écran pour lequel le layout est conçu (`1080`). |
| `widgets` | Liste des widgets. L'**ordre** est l'ordre d'empilement : le dernier est au premier plan. |

## Ancrages : un layout qui tient sur tous les écrans

Chaque widget est **accroché** à l'un des neuf points de l'écran : `top-left`, `top`, `top-right`,
`left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. `x` et `y` sont les distances à ce
point :

- sur un axe accroché à un **bord**, c'est la marge **vers l'intérieur** (un widget `top-right` avec
  `x: 30` est à 30 px du bord droit) ;
- sur un axe **centré**, c'est un décalage signé depuis le centre (positif = droite / bas).

> [!SCREENSHOT] anchors-diagram
> Schéma (pas une capture) : un écran 16:9 avec les neuf points d'ancrage numérotés (top-left, top, top-right, left,
> center, right, bottom-left, bottom, bottom-right) et un widget accroché à top-right avec des flèches cotées `x: 30`
> (vers l'intérieur depuis le bord droit) et `y: 24` (depuis le haut).

Le layout est conçu pour un écran de `referenceHeight` pixels de haut (1080) et **mis à l'échelle selon
la hauteur** de la fenêtre du jeu. Sur un écran plus large (21:9, 32:9), l'écran a plus de largeur mais
les widgets gardent leur taille et restent sur leurs bords.

> [!SCREENSHOT] anchors-ultrawide
> Le même layout vu dans l'éditeur en 16:9 puis en 21:9 (deux images superposées) : les widgets restent collés à leurs
> bords, l'écran plus large ne fait qu'ajouter de l'espace au milieu.

## Champs d'un widget

| Champ | Description |
| --- | --- |
| `id` | Identifiant unique du widget dans le layout. |
| `type` | Widget intégré ([liste](BUILTIN_WIDGETS.md)) ou `web` pour un widget communautaire. |
| `widget`, `options` | Pour `web` : dossier du widget et valeurs de ses options (voir [Widgets communautaires](WIDGETS.md)). |
| `name` | Nom affiché dans l'éditeur (facultatif). |
| `anchor`, `x`, `y` | Ancrage et distances (voir ci-dessus). |
| `anchorLocked` | `true` si l'ancrage a été choisi à la main (il ne suit alors plus la position). |
| `w`, `h` | Taille en pixels de référence. |
| `rotation` | Rotation en degrés, dans le sens horaire, autour du centre du rectangle du widget (défaut `0`, absent quand c'est `0`). Ramenée dans `]-180, 180]` ; une valeur absente, non numérique ou infinie vaut `0`. Seul le dessin pivote : `x`, `y`, `w`, `h` et l'ancrage restent ceux du rectangle non tourné, donc un layout sans `rotation` (ancien) se lit et s'affiche à l'identique. |
| `pages` | Pages du jeu où le widget est affiché (voir ci-dessous). |
| `style.color` | Couleur CSS du texte / des barres. |
| `style.scale` | Multiplicateur de la taille du texte (défaut `1`). La taille de base dépend de `h`. |
| `style.opacity` | `0`–`1`. |
| `style.align` | `left`, `center` ou `right`. Absent = automatique : suit l'ancrage du widget. |
| `style.animate`, `style.animationMs` | Animation des chiffres (voir plus bas). |
| `style.font` | Police : `default` (celle du widget), `system`, `serif`, `mono`, `rounded`, `condensed`, `handwriting`, ou `custom:<id>` pour une police importée (même `id` que les images : `<32 chiffres hexadécimaux>.<ttf\|otf\|woff\|woff2>`). Absent = `default`. |
| `style.weight` | Graisse de **tout** le texte du widget, `100` à `900` (arrondie à la centaine). Absent = chaque partie du widget garde la sienne. |
| `style.tracking` | Espacement des lettres en centièmes d'em, `-10` à `50` (défaut `0`). |
| `style.shadow`, `style.shadowColor` | Ombre du texte : `auto` (l'ombre de lisibilité habituelle), `none`, `soft`, `strong` ou `glow` (lueur, dans la couleur du texte si `shadowColor` est absent). |
| `style.outline`, `style.outlineColor` | Contour du texte en pixels, `0` à `8` (défaut `0`), et sa couleur (défaut noir). |
| `locked` | Éditeur : le widget ne peut pas être déplacé. |
| `group` | Éditeur : identifiant du groupe auquel appartient le widget (`group-1`…). Les widgets qui partagent la même valeur forment un groupe, sélectionné et déplacé d'un bloc. Un groupe d'un seul widget est ignoré. N'affecte pas le rendu. |

## Pages

| Valeur | Moment du jeu |
| --- | --- |
| `playing` | En partie |
| `paused` | Partie en pause |
| `break` | Pause (break) au milieu d'une map |
| `songSelect` | Sélection de musique |
| `results` | Écran de résultats |
| `menu` | Menu principal |

Valeur par défaut : `playing`, `paused`, `break`. L'ancien champ `visibleWhen` est toujours lu :
`always` = toutes les pages, toute autre valeur = les pages de partie. Les widgets qui lisent le score
n'ont pas de données sur `results` (le score n'est lu que pendant la partie).

L'overlay n'est à l'écran que si le layout dessine quelque chose sur la page courante (voir
[Overlay en jeu](OVERLAY.md)).

## Chiffres animés

Les nombres (score, combo, précision, PP, UR, compteurs de touches) **comptent vers leur nouvelle
valeur** au lieu de sauter : ils montent, ou redescendent (par exemple un combo qui retombe à 0), avec
une courbe qui ralentit à l'arrivée.

| Champ `style` | Défaut | Effet |
| --- | --- | --- |
| `animate` | `true` | `false` désactive l'animation (le nombre saute directement). |
| `animationMs` | `250` | Durée de l'animation. |

```json
{ "id": "score", "type": "score", "anchor": "top-right", "x": 30, "y": 24, "w": 500, "h": 84,
  "pages": ["playing"], "style": { "animate": true, "animationMs": 400 } }
```

L'animation avance au rythme du rafraîchissement choisi : à 30 fps, elle fait 30 pas par seconde.

## Compatibilité

- Les layouts `version: 1` (positions absolues sur 1920×1080) sont convertis à l'ouverture : leurs
  widgets deviennent ancrés en haut à gauche.
- Les champs inconnus sont ignorés ; un document invalide est refusé (« Ce n'est pas un layout valide »).
- Les identifiants de widget en double reçoivent un suffixe (`score-2`).
