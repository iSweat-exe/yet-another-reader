# Prise en main

**Yet Another Reader** lit l'état d'**osu!lazer** pendant que tu joues et le met à ta disposition de
trois façons :

- un **overlay en jeu** : une fenêtre transparente posée par-dessus le jeu (score, combo, PP, UR…),
  que tu composes toi-même dans l'**éditeur** ;
- une **API locale** (HTTP + WebSocket) pour tes propres outils, sources navigateur OBS, scripts ;
- des **widgets communautaires** en HTML/CSS/JavaScript, qui s'ajoutent à l'overlay sans toucher au code.

L'application est **en lecture seule** : elle ne modifie pas le jeu, n'injecte aucun code et ne
simule aucune touche. Elle lit la mémoire d'osu!lazer comme le ferait un outil de diagnostic.

## Ce qu'il te faut

| Élément | Détail |
| --- | --- |
| Système | **Windows** (la lecture du jeu utilise l'API Windows). |
| Jeu | **osu!lazer**. Les versions récentes sont détectées automatiquement à chaque connexion. |
| WebView2 | Installé avec Windows 10/11 ; sinon, le runtime Microsoft Edge WebView2. |
| Facultatif | **RivaTuner Statistics Server (RTSS)** pour afficher l'information en plein écran exclusif (voir [Overlay en jeu](OVERLAY.md)). |

## Premier lancement

1. Lance **Yet Another Reader**.
2. Lance **osu!lazer**. La connexion est **automatique** : l'onglet **Statut** passe de
   « En attente de osu!lazer » à « Connexion en cours… » (quelques secondes la première fois, le
   temps de repérer les objets du jeu), puis à « Connecté à osu!lazer ».
3. Ouvre l'onglet **Éditeur** pour voir l'overlay par défaut, ou lance une partie : l'overlay s'affiche
   par-dessus le jeu.

> [!SCREENSHOT] status-connected
> Fenêtre de l'application sur l'onglet **Statut**, osu!lazer lancé et connecté. Montrer la carte « Connexion » (point
> vert, « Connecté à osu!lazer », version, profil, durée de connexion) et la carte « API locale » (« En ligne » et les
> URL). Cadrer toute la fenêtre.

> [!NOTE] Au premier lancement l'application crée son dossier de configuration, avec un exemple de widget
> communautaire (`hello-score`). Voir [Réglages](SETTINGS.md) pour son emplacement.

## Visite de l'application

L'application a quatre onglets en haut de la fenêtre :

| Onglet | Rôle |
| --- | --- |
| **Statut** | Informations sur le reader : connexion à osu!lazer (version, profil, durée de connexion) et état de l'API locale avec ses URLs. |
| **Réglages** | Langue, fréquence de lecture, API, overlay, RTSS. Voir [Réglages](SETTINGS.md). |
| **Éditeur** | Composer l'overlay à la souris. Voir [Éditeur](EDITOR.md). |
| **Documentation** | Ce que tu lis. |

> [!SCREENSHOT] app-tabs
> Bandeau supérieur de la fenêtre, recadré : le titre « Yet Another Reader » et les quatre onglets **Statut**,
> **Réglages**, **Éditeur**, **Documentation**, l'onglet Statut actif (trait rose dessous). Numéroter 1 à 4 en
> surimpression.

## Par où continuer ?

| Je veux… | Page |
| --- | --- |
| Faire mon premier overlay pas à pas | [Créer un overlay](CREATE_OVERLAY.md) |
| Comprendre tous les réglages | [Réglages](SETTINGS.md) |
| Afficher l'overlay en plein écran exclusif | [Overlay en jeu](OVERLAY.md) |
| Connaître les widgets disponibles | [Widgets intégrés](BUILTIN_WIDGETS.md) |
| Créer mon propre widget en HTML | [Widgets communautaires](WIDGETS.md) |
| Lire les données depuis mon code ou OBS | [API locale](API.md), [API REST](REST_API.md), [WebSocket](WEBSOCKET.md) |
| Résoudre un problème | [Dépannage](TROUBLESHOOTING.md) |
| Contribuer au projet | [Contribuer](CONTRIBUTING.md) |

## Raccourci global

`Ctrl + Maj + O` affiche ou masque l'overlay en jeu, depuis n'importe quelle fenêtre.
