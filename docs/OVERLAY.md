# Overlay en jeu

L'overlay est une fenêtre transparente posée par-dessus osu!lazer. Elle ne prend jamais le focus
et ne bloque aucun clic : tout ce que tu fais passe à travers vers le jeu.

Son contenu est un [layout](LAYOUT.md) que tu composes dans l'[éditeur](EDITOR.md).

> [!SCREENSHOT] overlay-in-game
> osu!lazer en pleine partie (mode fenêtré sans bordure) avec l'overlay affiché par-dessus : score en haut à droite,
> combo en bas à gauche, barre de vie, précision et PP. Une flèche annotée « fenêtre transparente : les clics passent au
> jeu » vers l'un des widgets.

## Utilisation

- **Afficher / masquer** : `Ctrl + Maj + O` (depuis n'importe quelle fenêtre), ou la case
  « Overlay en jeu » des [réglages](SETTINGS.md).
- **Seulement quand osu! est au premier plan** (activé par défaut) : l'overlay disparaît quand tu
  passes sur une autre fenêtre, pour ne pas couvrir ton bureau.
- **Tester** : « Tester l'overlay » (réglages) affiche de fausses données pendant 8 secondes.
- Les widgets de partie ne s'affichent que pendant une partie ; chaque widget choisit ses
  [pages](LAYOUT.md#pages).

> [!SCREENSHOT] settings-overlay
> Section **Overlay** de l'onglet Réglages recadrée : case « Overlay en jeu » avec « Raccourci : Ctrl + Maj + O »,
> bouton Tester, champ « Rafraîchissement de l'overlay » (30 fps) et case « Seulement quand osu! est au premier plan ».

## Performances

Poser une fenêtre par-dessus le jeu oblige Windows à **composer** les deux images au lieu d'afficher le
jeu directement, ce qui coûte en latence et en régularité. L'application limite donc ce coût :

- **La fenêtre n'est à l'écran que si le layout dessine quelque chose sur la page en cours** (et
  ~1 s après). Par défaut les widgets sont sur les pages de partie ; aux menus, le jeu est affiché
  normalement. Si tu ajoutes des widgets à d'autres pages (sélection de musique, résultats, menu), la
  fenêtre apparaît aussi sur ces pages.
- **Rafraîchissement réglable** (réglages → « Rafraîchissement de l'overlay », 5–144 fps, 30 par
  défaut). C'est aussi la cadence des animations. Baisse-le si tu sens une gêne.
- **Rendu léger** : ombres de texte minimales, chiffres animés sans re-rendu React.
- Hors partie, seuls les changements utiles sont envoyés à l'overlay (pas le tic de l'horloge).

## Au-dessus du plein écran

| Mode d'affichage d'osu!lazer | Comment afficher l'overlay |
| --- | --- |
| Fenêtré / plein écran sans bordure (défaut de lazer) | L'overlay transparent (rien à faire). Il est re-forcé « toujours au-dessus » plusieurs fois par seconde, au cas où le jeu reprendrait le premier plan. |
| Plein écran **exclusif** | **RivaTuner (RTSS)** : réglages → « Afficher via RivaTuner ». |

**Pourquoi RTSS ?** Windows ne laisse pas une fenêtre normale s'afficher par-dessus un plein écran
exclusif. RTSS (livré avec MSI Afterburner) s'accroche déjà au rendu des jeux (DX9/10/11/12, Vulkan,
OpenGL) et sait dessiner par-dessus. L'application lui confie seulement du **texte** via sa mémoire
partagée : **rien n'est injecté dans osu!lazer**, et l'application ne lit ni n'écrit rien d'autre chez
RTSS.

1. Installe et lance **RivaTuner Statistics Server** (inclus avec MSI Afterburner).
2. Active « Afficher via RivaTuner (RTSS) » dans les réglages ; règle la position du texte.
3. Lance une partie : un bloc de texte (score, précision, PP, combo, UR, 300/100/50/miss, titre)
   apparaît. Le réglage indique si RTSS a été détecté.

> [!SCREENSHOT] rtss-in-game
> osu!lazer en plein écran exclusif avec le bloc de texte RTSS en haut à gauche (score, précision, PP, combo, UR,
> 300/100/50/miss, titre). En insert, la section RTSS des Réglages avec le message vert « RTSS détecté : le texte est
> affiché pendant les parties ».

Limites : RTSS n'affiche que du **texte** (pas de barres ni de widgets graphiques), et le texte est
limité à de l'ASCII (les caractères spéciaux des titres deviennent `?`).

> [!ATTENTION] Si tu es en fenêtré sans bordure, **n'active pas les deux** (overlay transparent et RTSS) : tu verrais l'information en double.

## Prévisualiser sans le jeu

Dans un navigateur, avec le serveur de développement (`npm run dev`, voir [Contribuer](CONTRIBUTING.md)),
ouvre `http://localhost:1420/?bg=1#overlay` : l'overlay s'anime avec de fausses données sur un fond de
substitution. L'application complète se prévisualise sur `http://localhost:1420/` ; ajoute
`?tab=editor` pour arriver sur l'éditeur.

> [!SCREENSHOT] browser-preview
> Fenêtre de navigateur sur `http://localhost:1420/?bg=1#overlay` : le dégradé violet-rose de substitution avec les
> widgets de l'overlay animés (score, combo, barre de vie). L'URL visible dans la barre d'adresse.

## Voir aussi

- [Créer un overlay](CREATE_OVERLAY.md) pour le premier pas à pas.
- [Dépannage](TROUBLESHOOTING.md) si l'overlay n'apparaît pas.
