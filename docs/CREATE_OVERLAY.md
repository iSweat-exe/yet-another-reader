# Créer un overlay

Ce tutoriel te fait composer un petit overlay de partie de A à Z : score, combo, précision, une
rangée de statistiques de la map, et une pause. Compte 10 minutes. Les détails de chaque outil sont
dans l'[Éditeur](EDITOR.md).

## Le principe en deux minutes

- Un **layout** est un overlay : une liste de **widgets** positionnés sur un écran virtuel de
  1080 px de haut. Tu peux en avoir autant que tu veux et choisir celui qui est actif en jeu.
- Un layout est découpé en **pages** : *En jeu*, *Pause*, *Break*, *Sélection*, *Résultats*, *Menu
  principal*. Chaque widget indique sur quelles pages il est affiché. L'éditeur montre **une page à
  la fois** (les onglets au-dessus de l'écran).
- Les widgets sont **ancrés** à l'écran (coin, bord ou centre) : ton overlay garde le même aspect
  sur un écran 16:9, 21:9 ou 32:9.

## 1. Créer un layout

1. Ouvre l'onglet **Éditeur**.
2. Dans la barre du haut, clique sur **Nouveau…**, donne un nom (lettres, chiffres, espaces, `-`,
   `_`, 40 caractères max) et choisis le modèle **Vide** (ou **Classique** / **Minimal** pour
   partir d'un exemple).

> [!SCREENSHOT] new-layout-dialog
> Boîte de dialogue « Nouveau layout » ouverte au-dessus de l'éditeur : champ de nom rempli avec `mon-overlay`, liste «
> Partir de » sur **Vide** (les trois choix visibles si possible : Classique, Minimal, Vide) et les boutons Annuler /
> Créer.

Les **données de l'aperçu** sont simulées par défaut (menu *Données*) : tu vois les widgets vivre
sans lancer le jeu.

## 2. Ajouter des widgets

Sélectionne l'onglet de page **En jeu**. Dans la liste de gauche, section **Partie**, clique sur
**Score**, **Combo** et **Précision** : chaque widget apparaît au centre de l'écran, déjà sélectionné.

> [!SCREENSHOT] add-widgets-playing
> Éditeur sur la page **En jeu** avec un layout vide. À gauche, la catégorie **Partie** dépliée (Score, Combo, Précision
> visibles). Au centre, trois widgets fraîchement ajoutés, empilés au milieu de l'écran d'aperçu, le dernier sélectionné
> avec son cadre rose.

## 3. Les placer

- **Glisse** un widget pour le déplacer. Le **magnétisme** l'aligne sur les bords et les centres de
  l'écran et des autres widgets (lignes guides). Maintiens `Alt` pour l'éviter, ou désactive
  **Magnétisme** dans la barre.
- Redimensionne-le avec ses **poignées** (`Maj` garde les proportions). La taille du texte suit la
  hauteur du widget.
- Précise au pixel dans le panneau **Propriétés** à droite (X, Y, W, H), ou avec les **flèches** du
  clavier (`Maj` = 10 px).

> [!SCREENSHOT] move-snapping
> Capture pendant un glisser : le widget Score est en train d'être déplacé vers le coin supérieur droit de l'écran
> d'aperçu ; deux lignes guides cyan sont visibles (l'une sur le bord droit de l'écran, l'autre alignée sur le centre
> d'un autre widget). Curseur de déplacement visible.

Place le score en haut à droite, le combo en bas à gauche, la précision sous le score.

> [!ASTUCE] Tu n'as pas à t'occuper des ancrages : l'éditeur accroche chaque widget au bord le plus proche
> ([détails](EDITOR.md#ancrage-automatique)).

## 4. Régler le style

Avec un widget sélectionné, **Propriétés → Style** : couleur, taille du texte, opacité, alignement du
texte, animation des chiffres. Pour changer plusieurs widgets d'un coup, modifie-les un à un ou duplique
un widget déjà réglé (`Ctrl + D`).

> [!SCREENSHOT] style-section
> Panneau **Propriétés** d'un widget Score sélectionné, défilé jusqu'à la section **Style** : couleur (pastille rose et
> code hexadécimal), taille du texte, opacité, alignement du texte (Auto), « Animer les chiffres » activé et durée 250
> ms.

## 5. Une rangée de statistiques

1. Dans **Beatmap**, ajoute **CS**, **AR**, **OD** et **HP** : ce sont quatre widgets séparés.
2. Sélectionne-les (rectangle de sélection sur l'écran vide, ou `Ctrl + clic`).
3. Clique sur **Aligner en haut** dans la barre d'outils pour les mettre sur une ligne.
4. Dans **Propriétés → Espacement**, règle **Espace horizontal** (par exemple `16`) : ils sont
   espacés de façon uniforme. Avec trois widgets ou plus, **Répartir horizontalement** égalise les
   espaces entre les deux extrémités.
5. Appuie sur `Ctrl + G` pour les **grouper** : la rangée se déplace désormais comme un seul objet et
   n'occupe qu'une ligne dépliable dans les **Calques**.

> [!SCREENSHOT] stats-row
> Les quatre widgets CS, AR, OD, HP alignés sur une ligne dans l'écran d'aperçu et sélectionnés ensemble (cadre en
> pointillés autour du groupe). À droite, le panneau « 4 widgets sélectionnés » avec la section **Espacement** : espace
> horizontal 16, espace vertical 0 et les deux boutons Répartir.

## 6. Une page Pause

1. Sélectionne l'onglet **Pause**.
2. Ajoute les widgets voulus (par exemple un grand **Combo** et le **Score**).

> [!SCREENSHOT] pause-page
> Les onglets de page avec **Pause** actif (compteur de widgets visible sur chaque onglet) et, dans l'écran d'aperçu,
> une page de pause simple : un grand Combo au centre et le Score en haut à droite.

Un widget peut être sur plusieurs pages : dans **Propriétés → Pages**, coche les moments du jeu où il
doit apparaître (au moins un).

## Variante : un overlay de touches

Les touches se lisent dans le jeu, en temps réel. Pour un overlay de touches :

1. Dans la catégorie **Touches**, ajoute un widget **Touche** par touche à afficher.
2. Pour chacun, règle ses **options** : le nom de la touche (`Z`, `X`…), ou *Souris* et `Left` / `Right`
   pour les clics ; coche **Afficher le nombre de pressions** si tu veux un compteur.
3. Sélectionne-les, **aligne** et **espace** les touches, puis `Ctrl + G` pour les grouper.
4. Ajoute **Touches par seconde** pour un compteur de KPS.

> [!SCREENSHOT] key-overlay
> Résultat final d'un overlay de touches sur fond de partie : quatre touches Z, X, M1, M2 alignées, Z et M1 allumées en
> rose (appuyées), compteurs de pressions sous chaque lettre, et un compteur « 7 KPS » à côté. Montrer aussi la ligne «
> Groupe 1 » repliée dans les Calques si la place le permet.

Les touches ne sont lues dans le jeu que tant que l'overlay en affiche. Voir
[Widgets intégrés](BUILTIN_WIDGETS.md#touches).

## 7. Tester

- Dans l'éditeur, passe le menu **Données** sur *En direct* pour voir les vrais chiffres d'une partie
  en cours.
- Dans **Réglages**, **Tester l'overlay** affiche de fausses données par-dessus osu! pendant 8 s.

> [!SCREENSHOT] data-menu
> Barre d'outils de l'éditeur avec la liste **Données** ouverte : les deux choix « Simulées » (coché) et « En direct »
> visibles. Zoomer sur la zone, avec le format d'écran 16:9 à côté.

## 8. L'utiliser en jeu

Clique sur **Utiliser en jeu** : c'est ce layout que l'overlay affichera. Avec
**Enregistrement auto** activé (par défaut), l'overlay suit tes modifications en direct. Lance une
partie : l'overlay apparaît par-dessus le jeu et disparaît entre les parties si ton layout n'a rien à
dessiner sur la page courante.

> [!SCREENSHOT] use-in-game-badge
> Barre du haut de l'éditeur, deux états côte à côte : à gauche le bouton rose **Utiliser en jeu** (layout non actif), à
> droite le badge **Actif en jeu** (layout actif), avec le sélecteur de layout visible.

> [!ATTENTION] Si tu joues en **plein écran exclusif**, un overlay transparent ne peut pas s'afficher : voir
> [Overlay en jeu](OVERLAY.md) (RTSS).

## 9. Le partager

**Exporter…** donne le JSON de ton layout (à copier ou télécharger) ; l'autre personne le charge
avec **Importer…**. Si le layout utilise des widgets communautaires, elle doit aussi avoir leurs
dossiers (ils sont référencés par leur nom de dossier).

> [!SCREENSHOT] export-dialog
> Boîte de dialogue « Exporter » : le JSON du layout affiché dans une zone de texte (début lisible avec `"version": 2`)
> et les boutons « Copier le JSON » et « Télécharger le fichier ».

## Aller plus loin

- Tous les widgets disponibles : [Widgets intégrés](BUILTIN_WIDGETS.md).
- Un widget qui n'existe pas ? Crée-le en HTML : [Widgets communautaires](WIDGETS.md).
- Modifier le layout à la main : [Format des layouts](LAYOUT.md).
- Les raccourcis et astuces de l'éditeur : [Éditeur](EDITOR.md).
