# Dépannage

Commence toujours par l'onglet **Statut** : il dit si l'application voit le jeu et si l'API tourne.

## Voir ce que fait l'application

Sous la carte de connexion, la section **Débogage** de l'onglet Statut montre le travail du logiciel en direct :

- **Lecture du jeu** : combien de fois par seconde l'état du jeu est lu (comparé à ce qui est demandé dans les réglages), le temps d'une lecture, les lectures échouées, si les touches sont lues et **qui les demande** (fenêtre overlay, WebSocket, client REST), les clients WebSocket connectés et la durée de la session.
- **Ce que le logiciel lit** : l'écran, le mode, les mods (avec la vitesse réelle), la beatmap, l'horloge, la partie en cours et les touches tenues, tels que l'application les voit.
- **Journal** : les derniers événements (connexion, changement d'écran ou de mods, début et fin de partie, erreurs de lecture, démarrage de l'API, réglages modifiés). Le bouton de copie met tout le journal dans le presse-papiers : joins-le à un ticket.

## L'application ne se connecte pas à osu!lazer

| Ce que tu vois | Cause probable | Que faire |
| --- | --- | --- |
| **En attente de osu!lazer** | Le jeu n'est pas lancé (ou pas encore détecté). | Lance osu!lazer. L'application réessaie toute seule toutes les 2 secondes. |
| **Connexion en cours…** qui dure | Premier repérage des objets du jeu, qui prend quelques secondes ; plus long juste après le démarrage du jeu. | Attends une dizaine de secondes. Si cela ne passe pas, relance le jeu. |
| **Lecture impossible** + un message | Le jeu a changé de version, ou l'accès à son processus est refusé. | Lis le message. Après une mise à jour d'osu!lazer, relance les deux programmes. Si le message persiste, ouvre un ticket avec le message et la version affichée (voir [Contribuer](CONTRIBUTING.md)). |

> [!SCREENSHOT] status-states
> Les trois états de la carte Connexion de l'onglet Statut côte à côte : « En attente de osu!lazer » (point gris), «
> Connexion en cours… » (point ambre qui pulse) et « Lecture impossible » avec son message d'erreur (point rouge).

Si le jeu est lancé **en administrateur** et pas l'application, Windows peut refuser la lecture : lance
les deux avec les mêmes droits.

Une fois connecté, de rares échecs de lecture isolés sont normaux (le ramasse-miettes du jeu déplace
des objets) : l'application les ignore et ne se reconnecte qu'après une longue série d'échecs.

## L'overlay n'apparaît pas

Vérifie dans l'ordre :

1. **Overlay en jeu** est activé dans les [réglages](SETTINGS.md) (ou bascule avec `Ctrl + Maj + O`).
2. **Le layout actif contient des widgets sur la page courante.** L'overlay n'est à l'écran que si
   quelque chose est à dessiner sur la page où se trouve le jeu. Par défaut les widgets sont sur les
   pages de partie : aux menus, c'est normal qu'il n'y ait rien. Voir [Format des layouts](LAYOUT.md#pages).
3. **Le bon layout est utilisé en jeu** : badge **Actif en jeu** dans l'éditeur, sinon **Utiliser en jeu**.
4. **« Seulement quand osu! est au premier plan »** : si une autre fenêtre est au premier plan, l'overlay se
   cache volontairement.
5. **Tu joues en plein écran exclusif.** Windows n'affiche aucune fenêtre par-dessus. Passe osu!lazer en
   fenêtré sans bordure, ou utilise **RTSS** ([Overlay en jeu](OVERLAY.md)).
6. Utilise **Tester l'overlay** (réglages) pour voir si l'overlay s'affiche avec de fausses données.

> [!SCREENSHOT] overlay-checklist
> Deux détails assemblés pour la liste de contrôle : la case « Overlay en jeu » cochée dans les Réglages, et la barre du
> haut de l'éditeur avec le badge **Actif en jeu** à côté du sélecteur de layout.

## L'overlay est affiché mais vide ou à zéro

- Vérifie la **connexion** dans l'onglet **Statut**.
- Les widgets de partie n'affichent des valeurs qu'**en partie**.
- Les widgets **Joueur** (rang, PP…) attendent que le profil soit chargé par le jeu.
- L'**avatar** demande une connexion Internet.

## L'overlay gêne le jeu (saccades)

Poser une fenêtre sur le jeu a un coût (voir [Overlay en jeu](OVERLAY.md#performances)). Dans les
[réglages](SETTINGS.md) :

- baisse le **Rafraîchissement de l'overlay** (par exemple 20 ou 15 fps) ;
- augmente l'**Intervalle de lecture** (`50`–`100` ms) ;
- retire les widgets inutiles et évite les widgets communautaires coûteux (animations permanentes, flous).

## L'API ne répond pas

| Symptôme | Que faire |
| --- | --- |
| **Erreur** dans la carte API du **Statut** | Le message dit pourquoi, le plus souvent : **le port est déjà utilisé**. Change le port dans les [réglages](SETTINGS.md). |
| **Désactivée** | Active **API locale** dans les réglages. |
| `curl` sans réponse | Vérifie l'URL affichée dans le **Statut** (le port a pu changer) : `http://127.0.0.1:<port>/api/v1/health`. |
| Un autre PC ne peut pas se connecter | Normal : l'API n'écoute que sur `127.0.0.1`, jamais sur le réseau. |

> [!SCREENSHOT] api-port-busy
> Carte « API locale » de l'onglet Statut en erreur : badge rouge « Erreur » et le message « Could not listen on
> 127.0.0.1:24051 » (port déjà utilisé), avec en dessous le champ Port des Réglages pour le changer.

Voir [API locale](API.md#notes-et-limites).

## Un widget communautaire n'apparaît pas

- L'**API locale doit être activée** : les widgets sont servis par elle.
- Clique sur **Actualiser** dans la palette de l'éditeur (section **Communauté**).
- Le dossier doit contenir un `manifest.json` **valide** et la page d'entrée annoncée (`index.html` par
  défaut). Un dossier invalide est ignoré, sans message. Voir [Widgets communautaires](WIDGETS.md).
- Dans l'éditeur, « Ce widget n'est pas dans le dossier des widgets » signifie qu'un layout référence un
  dossier qui n'existe plus (ou a été renommé).

> [!SCREENSHOT] palette-api-off
> Section Communauté de la palette avec l'avertissement ambre « Les widgets communautaires ont besoin de l'API locale :
> active-la dans les réglages. » au-dessus de la liste.

## RTSS n'affiche rien

- RivaTuner Statistics Server doit être **lancé** (le réglage indique « RTSS introuvable » sinon).
- Le texte n'apparaît **qu'en partie**.
- RTSS n'affiche que du texte ASCII (les caractères spéciaux deviennent `?`).
- Ne l'active pas en plus de l'overlay transparent : tu verrais l'information en double.

## Mon layout a disparu ou est invalide

Les layouts sont des fichiers `overlays\<nom>.json` dans le dossier de configuration (voir
[Réglages](SETTINGS.md#où-sont-mes-fichiers)). Un document invalide est refusé à l'import avec
« Ce n'est pas un layout valide » : compare-le au [format](LAYOUT.md). Pense à **exporter** tes
layouts pour en garder une copie.

## La mise à jour ne se fait pas

Regarde d'abord le **Journal** (onglet **Statut**, section *Debug*) : les lignes `updates` disent ce qui s'est passé.

| Message ou symptôme | Cause probable |
| --- | --- |
| Rien n'est proposé alors qu'une version existe | La version est encore un brouillon ou une pré-version sur GitHub, ou son numéro n'est pas plus grand que le tien. Clique sur **Rechercher** dans **Réglages > Mises à jour**. |
| `update check failed` avec une erreur réseau | Pas de connexion, ou un pare-feu bloque `github.com`. L'application réessaie toute seule (toutes les 6 h) ; **Rechercher** réessaie tout de suite. |
| `signature` dans l'erreur | Le fichier téléchargé n'a pas la signature attendue : il est **refusé volontairement**. Ne contourne pas : réinstalle depuis la page des versions du projet et préviens les mainteneurs. |
| L'installation échoue au redémarrage | Ferme l'application complètement (icône de la zone de notification, gestionnaire des tâches) puis relance **Installer et redémarrer**. À défaut, lance l'installeur téléchargé depuis la page des versions. |

## Repartir de zéro

Ferme l'application, puis supprime le dossier de configuration (`%APPDATA%\io.github.isweat-exe.yet-another-reader`). Tes layouts et
widgets communautaires y sont aussi : sauvegarde-les avant.

## Signaler un problème

Un bug, une version de jeu non reconnue, un widget manquant ? Voir [Contribuer](CONTRIBUTING.md#signaler-un-bug).
