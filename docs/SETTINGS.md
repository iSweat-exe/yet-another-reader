# Réglages

Tout se règle dans l'onglet **Réglages**. Les modifications ne sont prises en compte qu'après un clic
sur **Appliquer** (**Annuler** revient aux valeurs en vigueur). Elles sont enregistrées dans
`settings.json` et appliquées immédiatement, sans redémarrer.

> [!SCREENSHOT] settings-tab
> L'onglet **Réglages** en entier : Langue, Intervalle de lecture (curseur + champ), Intervalle de lecture des touches,
> API locale (case + port), Overlay (toutes ses options) et RivaTuner, avec les boutons Annuler / Appliquer en bas.
> Annoter chaque bloc avec son titre du document.

## Général

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Langue** | Système | Langue de l'interface : *Système* (la première langue de ton système que l'app connaît), *English*, *Français*, *Español*, *Deutsch*, *Português*, *Русский*, *简体中文*, *한국어* ou *日本語*. La documentation n'existe qu'en français et en anglais : les autres langues lisent l'anglais. |
| **Thème** | Graphite | L'apparence de l'application : *Graphite* (l'original), *Minuit*, *Papier* (clair), *Terminal*, *Sakura*, *Braise*, *Monochrome*, *Synthwave*, *Game Boy*, *Plan*, *Journal*, *Ambre CRT*, *Nord*, *Cyber* et *Matcha*. Il s'applique tout de suite, sans « Appliquer », et ne change pas l'overlay en jeu. |

## Mises à jour

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Rechercher automatiquement** (`autoUpdateCheck`) | Activé | L'application cherche une nouvelle version 20 secondes après son démarrage, puis toutes les 6 heures. |
| **Rechercher** | | Cherche tout de suite, et affiche la version installée. |

Quand une version est disponible, un bouton **Mise à jour X.Y.Z** apparaît en haut à droite de la fenêtre. Il mène à
ce bloc, qui montre les **nouveautés** et le bouton **Installer et redémarrer**. **Rien n'est installé sans ton
clic.** L'application télécharge l'installeur, vérifie sa **signature** avec la clé publique qu'elle embarque (un
fichier qui ne correspond pas est refusé), puis se ferme et se relance. Ton jeu n'est pas touché.

Si la recherche échoue (pas de réseau, par exemple), l'application continue normalement : la raison est dans le
**Journal** (onglet **Statut**, section *Debug*). Voir [Dépannage](TROUBLESHOOTING.md#la-mise-à-jour-ne-se-fait-pas).

## Lecture du jeu

| Réglage | Défaut | Plage | Effet |
| --- | --- | --- | --- |
| **Intervalle de lecture** (`pollIntervalMs`) | `33` ms (≈ 30 mises à jour/s) | `8` – `5000` ms | Fréquence d'échantillonnage de la mémoire du jeu. Le curseur et le champ affichent le nombre de mises à jour par seconde que cela donne. |

Choisir l'intervalle :

- `16` ms pour des animations fluides à 60 Hz ;
- `33` ms (défaut) pour la plupart des overlays ;
- `100` ms ou plus pour économiser le processeur si tu n'affiches que du texte.

C'est aussi la fréquence maximale des messages WebSocket de l'[API](API.md) : un message n'est
envoyé **que si l'état a changé**.

## Touches

| Réglage | Défaut | Plage | Effet |
| --- | --- | --- | --- |
| **Intervalle de lecture des touches** (`inputPollIntervalMs`) | `2` ms (≈ 500 lectures/s) | `1` – `100` ms | Fréquence d'échantillonnage des touches et boutons de souris tenus. Beaucoup plus rapide que l'intervalle de lecture du jeu : les touches doivent être en temps réel. |

Les touches ne sont lues **que si quelqu'un les regarde** : un widget de touches affiché dans l'overlay,
l'éditeur en données en direct, ou un client de l'[API](API.md#touches-en-temps-réel). Sans cela, aucune lecture
supplémentaire n'est faite dans le jeu. Baisse la fréquence (par exemple 4 ou 8 ms) si tu veux alléger la charge ;
une touche tenue moins longtemps que l'intervalle pourrait être manquée.

> [!SCREENSHOT] settings-keys
> Champ « Intervalle de lecture des touches » recadré : valeur 2, unité « ms », et le texte d'aide « ≈ 500 lectures par
> seconde, seulement quand un overlay affiche les touches ».

## API locale

| Réglage | Défaut | Plage | Effet |
| --- | --- | --- | --- |
| **API locale** (`apiEnabled`) | activée | — | Démarre ou coupe le serveur HTTP/WebSocket sur `127.0.0.1`. |
| **Port** (`apiPort`) | `24051` | `1024` – `65535` | Port d'écoute. Si le port est occupé, l'erreur est affichée dans l'onglet **Statut**. |

> [!IMPORTANT] Les **widgets communautaires** sont servis par l'API : ils ne fonctionnent pas quand elle est coupée.

> [!SCREENSHOT] settings-api
> Section API locale des Réglages (case cochée, port 24051) au-dessus de la carte « API locale » de l'onglet Statut avec
> le badge vert « En ligne » et les URL copiables. Variante : la carte en rouge avec le message « Could not listen on
> 127.0.0.1:24051 » quand le port est pris.

## Overlay

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Overlay en jeu** | activé | Affiche ou masque l'overlay (raccourci `Ctrl + Maj + O`). |
| **Tester l'overlay** | — | Affiche de fausses données par-dessus osu! pendant 8 secondes, pour juger du rendu sans jouer. |
| **Rafraîchissement de l'overlay** | `30` fps (5–360) | Cadence de dessin de l'overlay et de ses animations. Plus bas = moins de charge pour le jeu. |
| **Seulement quand osu! est au premier plan** | activé | L'overlay disparaît quand tu passes sur une autre fenêtre. |

Voir [Overlay en jeu](OVERLAY.md) pour les performances et le plein écran.

## RivaTuner (RTSS)

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Afficher via RivaTuner (RTSS)** | désactivé | Dessine un bloc de texte par-dessus le jeu via RTSS, pour le **plein écran exclusif**. |
| **Position du texte (px)** | — | Coordonnées X et Y du bloc de texte. |

Sous la case, l'application indique si RTSS est détecté. Voir [Overlay en jeu](OVERLAY.md).

## Now playing

La map en cours, écrite dans des **fichiers** : un texte et la pochette. Une source texte et une source image d'OBS, ou un bot de chat, savent lire un fichier : pas besoin de source navigateur.

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Écrire la map en cours dans des fichiers** | désactivé | Active l'écriture des fichiers ci-dessous. Désactivé, rien n'est écrit (les fichiers déjà là ne sont pas effacés). |
| **Texte** (`Text`) | `{artist} - {title} [{version}]` | Le modèle du texte de `nowplaying.txt`, avec des variables entre accolades (voir plus bas). 500 caractères au plus. |
| **Dossier** (`Folder`) | vide | Où les fichiers sont écrits. Vide : le dossier `nowplaying` du [dossier de configuration](#où-sont-mes-fichiers). |

Deux fichiers sont écrits dans ce dossier :

| Fichier | Contenu |
| --- | --- |
| `nowplaying.txt` | Le texte, **sur une seule ligne** (les retours à la ligne deviennent des espaces). Vide quand aucune map n'est sélectionnée. Il n'est réécrit **que si son texte change** : l'application regarde deux fois par seconde. |
| `cover.jpg`, `cover.png` ou `cover.webp` | Une copie du fond de la beatmap, avec l'extension du fichier de fond (`jpg` par défaut). Les autres extensions sont supprimées : il n'y a jamais qu'une pochette. Pas de pochette si la map n'a pas de fond. |

Les variables du texte :

| Variable | Valeur |
| --- | --- |
| `{artist}`, `{title}` | Artiste et titre (romanisés). |
| `{artistUnicode}`, `{titleUnicode}` | Artiste et titre d'origine. |
| `{version}` | Nom de la difficulté. |
| `{creator}` | Mapper. |
| `{mods}` | Les mods actifs, collés : `HDDT`. |
| `{stars}` | Les étoiles avec les mods, à 2 décimales. |
| `{bpm}` | Le BPM principal, arrondi à l'entier. |
| `{link}` | `https://osu.ppy.sh/b/<id>` ; vide pour une map non publiée. |
| `{score}`, `{combo}`, `{accuracy}`, `{pp}` | Les valeurs de la partie en cours : score, combo, précision (de `0` à `1`, 2 décimales) et PP en direct (arrondis à l'entier). Elles valent **0** en dehors d'une partie. |

Une variable inconnue est **laissée telle quelle** (`{nope}` reste `{nope}`) : une faute de frappe se voit tout de suite.

> [!ASTUCE] Dans **OBS**, ajoute une source **Texte** et coche *Lire à partir d'un fichier* (`nowplaying.txt`), puis une source
> **Image** sur `cover.jpg`. Elles se mettent à jour toutes seules quand tu changes de map. L'extension de la pochette suit le
> fond de la map : si tes maps en ont de plusieurs types, un seul fichier existe à la fois. Un **bot de chat** qui sait lire un
> fichier texte peut répondre à une commande `!np` avec le contenu de `nowplaying.txt`.

Avec un texte comme `{artist} - {title} [{version}] +{mods} ({stars}★) {link}`, le fichier contient par exemple :

```text
whyalive x Denya8 - hyperpop luv <3 [collab expert] +HDDT (7.40★) https://osu.ppy.sh/b/4859840
```

> [!NOTE] Le dossier de configuration n'est affiché nulle part dans l'application. Le bouton **Ouvrir le dossier des widgets**
> de l'éditeur ouvre `widgets` : `nowplaying` est son dossier voisin, dans le même dossier parent.

## Où sont mes fichiers ?

Tout est dans le dossier de configuration de l'application (sous Windows : `%APPDATA%\io.github.isweat-exe.yet-another-reader`) :

| Chemin | Contenu |
| --- | --- |
| `settings.json` | Les réglages ci-dessus et le layout actif. |
| `overlays\<nom>.json` | Un layout par fichier (voir [Format des layouts](LAYOUT.md)). |
| `widgets\<dossier>\` | Les widgets communautaires (voir [Widgets communautaires](WIDGETS.md)). |
| `nowplaying\` | `nowplaying.txt` et `cover.*` (voir [Now playing](#now-playing)), sauf si tu as choisi un autre dossier. |
| `records\<sha256>.json` | Le meilleur score de chaque beatmap vue par l'application (voir [`GET /personal-best`](REST_API.md#get-personal-best)). |

Pour **sauvegarder ou partager** ta configuration, copie ces fichiers ; pour **repartir de zéro**, ferme
l'application et supprime le dossier.

> [!SCREENSHOT] config-folder
> Explorateur de fichiers Windows ouvert sur `%APPDATA%\io.github.isweat-exe.yet-another-reader` : le fichier `settings.json` et les dossiers
> `overlays` et `widgets`. Le chemin visible dans la barre d'adresse.
