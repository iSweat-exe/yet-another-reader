# Captures d'écran de la documentation / Documentation screenshots

Les pages de la documentation réservent des emplacements pour des captures d'écran : un cadre en pointillés qui décrit ce
que la capture doit montrer (`> [!SCREENSHOT] identifiant` dans le Markdown). Déposer un fichier dans ce dossier **remplace
automatiquement** le cadre, sans rien modifier d'autre.

The documentation pages reserve places for screenshots: a dashed frame that describes what the picture must show
(`> [!SCREENSHOT] identifier` in the Markdown). Dropping a file in this folder **replaces the frame automatically**, with
nothing else to change.

## Nommer le fichier / Naming the file

| Fichier / File | Utilisé pour / Used for |
| --- | --- |
| `<identifiant>.png` | Les deux langues / Both languages |
| `<identifiant>.fr.png` | La documentation française seulement / The French documentation only |
| `<identifiant>.en.png` | La documentation anglaise seulement / The English documentation only |

`.webp`, `.jpg` et `.jpeg` fonctionnent aussi. L'identifiant est celui écrit dans le cadre (par exemple
`editor-overview`). Quand l'image montre l'interface (donc du texte), préférer une image par langue : l'application est
affichée dans sa propre langue.

`.webp`, `.jpg` and `.jpeg` work too. The identifier is the one written in the frame (for example `editor-overview`). When
the picture shows the interface (so text), prefer one picture per language: the application is displayed in its own language.

## Conseils de prise de vue / Shooting tips

- Thème sombre de l'application, fenêtre en 1280 × 820 (taille par défaut), capture à l'échelle 100 % ou 200 %.
  Dark theme, window at 1280 × 820 (default size), captured at 100 % or 200 % scale.
- Largeur finale de 1600 px environ pour une capture pleine largeur ; recadrer au plus près pour un détail.
  About 1600 px wide for a full-width capture; crop tight for a detail.
- Données simulées de l'éditeur (menu *Données* → *Simulées*) pour que les captures soient reproductibles.
  Use the editor's simulated data (*Data* menu → *Simulated*) so the captures are reproducible.
- Pas de pseudo, d'identifiant ni de chemin personnels visibles.
  No personal user name, id or path visible.
- Les annotations (numéros, flèches) en rose `#f472b6`, la couleur d'accent de l'application.
  Annotations (numbers, arrows) in pink `#f472b6`, the application's accent colour.

## Suivre l'avancement / Following the progress

```bash
npm run docs:shots            # toutes les captures et leur état / every screenshot and its state
npm run docs:shots -- --todo  # seulement celles qui manquent / only the missing ones
```
