# Éditeur

L'onglet **Éditeur** compose l'overlay à la souris, avec les vrais widgets sur des données simulées
(ou en direct). Pour un pas à pas, voir [Créer un overlay](CREATE_OVERLAY.md).

## Vue d'ensemble

| Zone | Contenu |
| --- | --- |
| **Barre du haut** | Choix du layout, **Utiliser en jeu**, nouveau / dupliquer / renommer / importer / exporter / supprimer, état d'enregistrement. |
| **Barre d'outils** | Annuler / rétablir, alignement, espacement, groupes, magnétisme, grille, format d'écran, source des données, enregistrement auto. |
| **Gauche** | La palette de widgets : **Intégrés** (par catégorie) et **Communauté**. Un clic ajoute le widget. |
| **Centre** | Les onglets de **page**, l'écran d'aperçu, et le rappel des raccourcis. |
| **Droite, en haut** | Les **Propriétés** de la sélection. |
| **Droite, en bas** | Les **Calques**. |

> [!SCREENSHOT] editor-overview
> Fenêtre complète de l'éditeur avec le layout « Classique » chargé. Numéroter en surimpression les six zones du tableau
> : 1 barre du haut, 2 barre d'outils, 3 palette de widgets, 4 écran d'aperçu avec les onglets de page, 5 propriétés, 6
> calques.

Les séparateurs entre les panneaux se déplacent à la souris ; un double-clic les remet à leur taille
d'origine.

## Pages

Un layout couvre tous les moments du jeu. L'éditeur affiche **une page à la fois** : *En jeu*,
*Pause*, *Break*, *Sélection*, *Résultats*, *Menu principal* (le nombre à côté de chaque onglet est le
nombre de widgets qui y sont). Un widget ajouté va sur la page affichée ; ses propriétés permettent de
le montrer sur d'autres pages. Voir [Format des layouts](LAYOUT.md) pour le détail.

> [!SCREENSHOT] page-tabs
> Les six onglets de page (En jeu, Pause, Break, Sélection, Résultats, Menu principal), chacun avec son compteur de
> widgets à côté du nom ; l'onglet En jeu actif. Recadrer sur la rangée d'onglets.

## Sélectionner, déplacer, redimensionner

- **Clic** sur un widget : le sélectionne. `Maj` ou `Ctrl` + clic : ajoute ou retire de la sélection.
- **Rectangle de sélection** : glisse sur l'écran vide. `Ctrl + A` sélectionne tout.
- **Glisser** : déplace la sélection. Les **poignées** d'un widget seul le redimensionnent ; `Maj`
  garde ses proportions.
- **Magnétisme** : le widget s'aligne sur les bords et centres de l'écran et des autres widgets
  (lignes guides). `Alt` le désactive pendant le glisser. La **Grille** optionnelle aide au placement : sa taille se règle (2 à 200 px, 10 par défaut) dans le champ qui apparaît à côté du bouton.
- **Flèches** : déplacent d'un pixel (`Maj` : 10).
- **Rotation** : le cercle au-dessus du cadre d'une sélection la fait pivoter autour de son centre ; le widget suit
  le pointeur exactement. `Maj` : par pas de 15°. **Double-clic** sur le cercle : remet à 0°. `Échap` pendant le geste :
  annule. Un geste = une entrée de l'historique. Le champ **Rotation (°)** de l'inspecteur (saisie, curseur,
  bouton de remise à zéro) règle la valeur d'un widget seul.
- Un widget tourné garde ses poignées, qui suivent sa rotation : elles déplacent le bord dans l'axe du widget et le
  bord opposé reste fixe. Le clic et le rectangle de sélection visent la forme tournée.
- **Sélection multiple et groupes** : la rotation est rigide. Chaque widget pivote autour du centre de la sélection (un
  groupe tourne donc comme un bloc) : sa position orbite autour de ce centre et son propre angle augmente d'autant.
- **Magnétisme et guides** : ils travaillent sur la boîte englobante du widget tourné, telle qu'on la voit. Le
  redimensionnement d'un widget tourné ne s'aligne pas sur les guides.

> [!SCREENSHOT] selection-handles
> Un widget seul sélectionné sur l'écran d'aperçu : cadre rose, huit poignées blanches (coins et milieux), étiquette
> rose avec son nom au-dessus. À côté, un rectangle de sélection bleu translucide en train d'englober deux autres
> widgets.

> [!ASTUCE] Pour déplacer un widget sans qu'il s'accroche à ses voisins, maintiens `Alt` pendant le glisser.

## Ancrage automatique

Tu n'as pas à choisir d'ancrage. Quand tu déplaces, redimensionnes, alignes, ajoutes ou colles un
widget, l'éditeur l'accroche tout seul à la zone de l'écran où il se trouve : un widget près du bord
droit devient ancré à droite et y reste sur un écran plus large.

Pour forcer un ancrage, choisis-le dans le sélecteur 3×3 des **Propriétés** : il est alors **fixé** et
ne suit plus la position. Décoche puis recoche **Ancrage automatique** pour revenir au mode automatique.
Le **format d'écran** (16:9, 21:9, 16:10, 4:3, 32:9) permet de vérifier que le layout tient partout.

> [!SCREENSHOT] anchor-selector
> Section **Placement** des Propriétés : le sélecteur d'ancrage 3×3 avec « Haut droite » en rose, les champs X, Y, W, H,
> et l'interrupteur « Ancrage automatique » avec son texte d'aide. Montrer l'état activé puis l'état désactivé (ancrage
> fixé) côte à côte.

## Alignement

Les boutons **Aligner** (gauche, centre, droite, haut, milieu, bas) agissent sur la sélection : **un
seul** objet s'aligne sur l'écran, **plusieurs** sur leur boîte commune.

> [!SCREENSHOT] align-buttons
> Barre d'outils recadrée sur le groupe « Alignement » : les six boutons (gauche, centre, droite, haut, milieu, bas)
> avec l'infobulle « Aligner à gauche » visible sur le premier, et trois widgets avant / après alignement à gauche en
> insert.

## Espacement

Avec **au moins deux objets** sélectionnés, **Propriétés → Espacement** règle l'espace entre eux :

- **Espace horizontal** / **Espace vertical** : l'espace actuel entre voisins (la moyenne s'il est
  irrégulier). Saisis une valeur : tous les objets sont espacés de façon uniforme, du premier au
  dernier, **le premier restant en place**. Une valeur négative les fait se chevaucher.
- **Répartir horizontalement / verticalement** (aussi dans la barre d'outils) : égalise les espaces en
  gardant en place les deux objets des extrémités. Il faut **trois objets** ou plus.

> [!SCREENSHOT] spacing-panel
> Trois widgets sélectionnés sur une ligne, irrégulièrement espacés (avant) puis régulièrement (après la répartition). À
> droite, la section **Espacement** avec les deux champs d'écart et les boutons Répartir horizontalement /
> verticalement. Deux images côte à côte.

Un **groupe** compte pour **un seul objet** ; les objets verrouillés ne bougent pas. Les saisies
successives dans un champ d'espacement ne forment qu'une seule étape d'annulation.

## Groupes

Un groupe rassemble plusieurs widgets en **un seul objet** : on le sélectionne, déplace, aligne et
espace d'un bloc.

| Action | Comment |
| --- | --- |
| **Grouper** | `Ctrl + G` avec au moins deux widgets sélectionnés (ou le bouton **Grouper**). |
| **Dégrouper** | `Ctrl + Maj + G` (ou le bouton **Dégrouper**). |
| **Sélectionner le groupe** | Clic sur l'un de ses widgets sur l'écran, ou sur sa ligne dans les **Calques**. |
| **Sélectionner un seul membre** | Déplie le groupe dans les **Calques** (chevron) et clique sur le widget. |

> [!SCREENSHOT] groups-layers
> Panneau **Calques** avec une ligne de groupe « Groupe 1 » dépliée : chevron, icône de groupe, compteur « 4 », boutons
> de survol (dégrouper, monter, descendre, verrouiller) et ses quatre widgets en retrait en dessous. Sur l'écran
> d'aperçu, le cadre en pointillés qui entoure le groupe sélectionné.

Dans les **Calques**, un groupe est **une seule ligne** : un chevron le déplie, un compteur donne le
nombre de widgets, et des boutons permettent de le dégrouper, de le monter ou le descendre d'un bloc et
de le verrouiller. Les membres d'un groupe forment un bloc contigu dans l'ordre d'empilement. Dupliquer
ou copier un groupe en crée un **nouveau**, sans fusion avec l'original. Un groupe qui ne contient plus
qu'un widget est dissous automatiquement.

## Propriétés d'un widget

| Section | Contenu |
| --- | --- |
| En-tête | **Nom** affiché dans l'éditeur, dupliquer, supprimer. |
| **Placement** | Ancrage (3×3), `X`, `Y`, `W`, `H`, **Ancrage automatique**. |
| **Pages** | Les pages où le widget est affiché (au moins une). |
| **Style** | Couleur, **Taille du texte** (multiplicateur), **Opacité** (curseur de 0 à 100 %), **Alignement du texte** (auto = suit l'ancrage), **Animer les chiffres** et leur durée. |
| **Typographie** | **Police** (intégrée ou importée depuis un fichier TTF, OTF, WOFF ou WOFF2), **Graisse**, **Espacement des lettres**, **Ombre** (automatique, aucune, douce, forte, lueur) et **Contour**. Pour les widgets intégrés. |
| **Options** | Pour un widget communautaire : les options de son manifeste. |

> [!SCREENSHOT] properties-panel
> Panneau **Propriétés** complet d'un widget Score, tout le panneau visible (en deux images si besoin) : en-tête avec le
> nom, Placement, Pages (six interrupteurs), Style. Annoter chaque section avec son nom du tableau.

## Calques

Les calques listent les widgets **de la page affichée**, du premier plan à l'arrière-plan. Chaque ligne
permet de **monter / descendre** le widget dans l'ordre d'empilement et de le **verrouiller** (un
widget verrouillé ne peut être ni déplacé ni supprimé, et ne se sélectionne plus en cliquant sur l'aperçu : seulement ici).
Glisse une ligne pour la **réordonner** ; `Échap` annule. Une ligne indique ce qui distingue deux widgets du même type
(la touche d'une touche, le texte d'un texte).

> [!SCREENSHOT] layers-panel
> Panneau **Calques** de la page En jeu : une dizaine de widgets du premier plan à l'arrière-plan, une ligne survolée
> montrant les boutons monter / descendre / verrouiller, une autre avec le cadenas fermé (widget verrouillé) toujours
> visible.

## Gérer plusieurs layouts

Crée autant de layouts nommés que tu veux : **Nouveau…** (modèle **Classique**, **Minimal**, **Graphique en haut**, **Touches**, **Concentré** ou
**Vide**), **Dupliquer…**, **Renommer…**, **Supprimer**. **Utiliser en jeu** choisit celui que
l'overlay affiche (le badge **Actif en jeu** indique l'actif).

> [!SCREENSHOT] layout-management
> Barre du haut avec la liste des layouts ouverte (default, Stream, Minimal, le layout actif coché) et, à droite, les
> boutons Nouveau, Dupliquer, Renommer, Importer, Exporter, Supprimer, l'infobulle de l'un d'eux visible.

**Importer / exporter** : **Exporter…** donne le JSON du layout (à copier ou télécharger) ; **Importer…**
accepte du JSON collé ou un fichier. C'est le moyen de partager un layout.

## Versions enregistrées

L'enregistrement automatique écrase le fichier à chaque modification : pour revenir en arrière, le bouton **Versions
enregistrées** (horloge, à côté d'Annuler / Rétablir) liste les versions plus anciennes du layout, gardées avant qu'un
lot de modifications ne l'écrase (au plus une toutes les deux minutes, les 40 dernières). Choisis-en une pour la voir,
puis **Restaurer cette version** : c'est une modification comme une autre, que `Ctrl + Z` annule.

## Enregistrement

Avec **Enregistrement auto**, chaque modification est enregistrée une demi-seconde plus tard et
l'overlay en jeu la reprend en direct. Sans lui, `Ctrl + S` enregistre. L'état (« Enregistré »,
« Modifications non enregistrées ») s'affiche en haut à droite.

> [!SCREENSHOT] save-state
> Deux détails recadrés, côte à côte : en haut à droite de la barre du haut, l'indicateur « Enregistré » en vert avec sa
> coche ; et, à côté, l'état « Modifications non enregistrées » en ambre. Sous chacun, l'interrupteur « Enregistrement
> auto ».

## Palette de commandes

`Ctrl + K` (ou le bouton en forme de loupe) ouvre la palette de commandes : une seule recherche pour **ajouter un widget**,
**ouvrir un layout**, changer de **thème** ou de **fond** de l'aperçu, aller à une **page**, ou lancer une action
(enregistrer, annuler, grille, magnétisme). Les flèches parcourent la liste, `Entrée` lance, `Échap` ferme. Pendant que tu
parcours la liste, la partie droite montre le résultat : le vrai widget, la miniature du thème ou le fond.

## Données de l'aperçu

Le menu **Données** choisit ce que montrent les widgets : **Simulées** (une partie fictive animée, pour
travailler sans jeu) ou **En direct** (l'état réel d'osu!lazer).

## Raccourcis

| Touches | Action |
| --- | --- |
| `Suppr` / `Retour arrière` | Supprimer la sélection |
| `Ctrl + Z` / `Ctrl + Y` (ou `Ctrl + Maj + Z`) | Annuler / rétablir |
| `Ctrl + C` / `Ctrl + V` / `Ctrl + D` | Copier / coller / dupliquer |
| `Ctrl + G` / `Ctrl + Maj + G` | Grouper / dégrouper |
| `Ctrl + A` | Tout sélectionner |
| Flèches (`Maj` : ×10) | Déplacer la sélection |
| `Alt` pendant le glisser | Désactiver le magnétisme |
| `Maj` pendant un redimensionnement | Garder les proportions |
| `Maj` pendant une rotation | Pas de 15° |
| `Échap` pendant un geste | Annuler le geste (déplacement, redimensionnement, rotation) |
| `Ctrl + S` | Enregistrer |
| `Ctrl + K` | Palette de commandes |
| `Échap` | Désélectionner |

> [!SCREENSHOT] shortcuts-bar
> Bande de raccourcis en bas de l'éditeur, recadrée : les touches Suppr, Ctrl Z / Ctrl Y, Ctrl C / Ctrl V / Ctrl D, Ctrl
> G / Ctrl Maj G, flèches, Maj, Alt et Ctrl S avec leur libellé.

Les raccourcis sont inactifs quand tu tapes dans un champ ou qu'une boîte de dialogue est ouverte.
