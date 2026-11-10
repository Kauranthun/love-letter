# 💌 Love Letter — édition 2019, en réseau local

**Version 1.1.0** — voir le [CHANGELOG](CHANGELOG.md). Branches : `main` = dernière version ;
`release/x.y.z` = chaque version figée (tags `vx.y.z`).

Jeu de cartes **Love Letter (édition 2019)** pour **2 à 6 joueurs**, jouable autour d'une table :
un ordinateur lance le serveur, chaque joueur rejoint depuis le **navigateur de son téléphone**.

- Aucune application à installer, aucun compte, **aucune connexion Internet pendant la partie**
  (tout est servi par l'ordinateur : pages, scripts, QR codes).
- Serveur **autoritatif** : toutes les règles sont appliquées côté serveur ; chaque téléphone ne reçoit
  que ce qu'il a le droit de voir (jamais la main des autres, la pioche ni la carte écartée).
- Reconnexion automatique si un téléphone se verrouille ou perd le Wi-Fi, même au milieu d'une décision.

> Love Letter est un jeu de Seiji Kanai. Ce projet est une adaptation non officielle, à usage privé ;
> les illustrations des cartes sont des créations originales en SVG.

---

## Sommaire

1. [Installation](#1-installation)
2. [Lancer une partie](#2-lancer-une-partie)
3. [Connecter 3 à 6 téléphones](#3-connecter-3-à-6-téléphones)
4. [Pare-feu (Windows, macOS, Linux)](#4-pare-feu)
5. [Dépannage Wi-Fi (réseau « invité », isolation des appareils)](#5-dépannage-wi-fi)
6. [Règles implémentées](#6-règles-implémentées)
7. [Tests et simulation](#7-tests-et-simulation)
8. [Architecture](#8-architecture)
9. [Checklist de test manuel](#9-checklist-de-test-manuel)
10. [Versions et branches](#10-versions-et-branches)

---

## 1. Installation

Prérequis : **Node.js 18 ou plus récent** (la version LTS est recommandée) — https://nodejs.org

```bash
# Windows (alternative) : winget install OpenJS.NodeJS.LTS
node --version          # doit afficher v18 ou plus
```

Puis, dans le dossier du projet (une seule fois, **avec** Internet) :

```bash
npm install
```

Après cela, Internet n'est plus nécessaire.

## 2. Lancer une partie

```bash
npm start
```

La console affiche :

```
💌  Love Letter — serveur local démarré

   Sur cet ordinateur : http://localhost:3000
   Sur les téléphones (même Wi-Fi) : http://192.168.1.23:3000

   ▄▄▄▄▄▄▄ ... (QR code)
```

- Ouvrez **http://localhost:3000** sur l'ordinateur : la page d'accueil affiche aussi le QR code.
- Si plusieurs adresses sont listées (VPN, WSL, machine virtuelle…), la première est la plus probable ;
  essayez les autres si elle ne fonctionne pas.
- Autre port : `PORT=3001 npm start` (macOS/Linux), `$env:PORT=3001; npm start` (PowerShell),
  `set PORT=3001&& npm start` (cmd).
- Arrêt : `Ctrl+C`.

Le serveur peut héberger **plusieurs parties simultanées** (chacune a son code à 4 lettres).

## 3. Connecter 3 à 6 téléphones

1. **Tous les appareils sur le même Wi-Fi** que l'ordinateur (pas de réseau « invité », pas de 4G/5G).
2. Sur le premier téléphone (ou l'ordinateur) : scannez le QR code de la console, entrez un pseudo,
   puis **« Créer une partie »**. Vous êtes l'**hôte**. Un code de 4 lettres s'affiche (ex. `KQTR`).
3. Les autres joueurs scannent le **QR code du salon** (il contient déjà le code de la partie) ou
   ouvrent l'adresse et tapent le code, puis **« Rejoindre »**.
4. Le salon indique le nombre de joueurs et les **jetons nécessaires** pour gagner
   (2 joueurs : 6 · 3 : 5 · 4 : 4 · 5–6 : 3).
5. L'hôte appuie sur **« Lancer la partie »** (2 à 6 joueurs).

Conseils :

- **Main cachée** : vos cartes s'affichent face cachée pour que vos voisins ne les voient pas d'un coup
  d'œil. Touchez « 👁 Voir ma main » ; elles se recachent après votre tour, au bout de 8 secondes hors de
  votre tour, ou dès que le téléphone se verrouille. Les informations secrètes (Prêtre, Baron, Roi) du
  journal sont masquées de la même façon.
- **Écran verrouillé / Wi-Fi perdu** : rouvrez simplement la page, le téléphone reprend sa place
  (jeton enregistré dans le navigateur). Les autres voient 📴 pendant l'absence.
- Si un joueur ne revient pas, l'**hôte** peut l'**éliminer de la manche** (bouton dans le panneau
  « Hôte »), puis le **retirer de la partie** entre deux manches.
- Pour tester seul avec plusieurs onglets sur un même navigateur : ouvrez les joueurs suivants en
  **fenêtre privée**, ou avec l'adresse `http://localhost:3000/?nouveau`.
- Gardez l'écran allumé pendant la partie (ou réglez la mise en veille à 2–5 minutes).

## 4. Pare-feu

Le serveur écoute sur le port **TCP 3000** (ou celui de `PORT`). Il doit accepter les connexions entrantes
du réseau local.

### Windows 10 / 11

Au premier `npm start`, Windows affiche « Le Pare-feu Windows Defender a bloqué certaines fonctionnalités
de Node.js » : cochez **Réseaux privés** et cliquez **Autoriser l'accès**.

Si vous avez cliqué sur « Annuler » ou si les téléphones n'arrivent pas à se connecter :

1. **Le Wi-Fi doit être un réseau « Privé »** (en « Public », Windows bloque les connexions entrantes) :
   *Paramètres → Réseau et Internet → Wi-Fi → (votre réseau) → Type de profil réseau → **Privé***.
   En PowerShell administrateur :
   ```powershell
   Get-NetConnectionProfile                                   # repérer InterfaceAlias (ex. "Wi-Fi")
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
   ```
2. **Ajouter une règle d'autorisation pour le port** (PowerShell **administrateur**) :
   ```powershell
   New-NetFirewallRule -DisplayName "Love Letter (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
   ou, en invite de commandes administrateur :
   ```bat
   netsh advfirewall firewall add rule name="Love Letter (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=private
   ```
3. **Supprimer d'éventuelles règles de blocage de Node.js** (un blocage l'emporte sur une autorisation) :
   *Pare-feu Windows Defender → Paramètres avancés → Règles de trafic entrant* → cherchez
   « Node.js JavaScript Runtime » avec une icône rouge 🚫 → supprimez-les (ou passez-les en « Autoriser »).
   Alternative : *Autoriser une application via le pare-feu* → cochez **Privé** pour Node.js.
4. Un antivirus tiers (Norton, Avast, Kaspersky…) peut avoir son propre pare-feu : autorisez-y Node.js.

Pour retirer la règle plus tard :

```powershell
Remove-NetFirewallRule -DisplayName "Love Letter (TCP 3000)"
```

### macOS

*Réglages Système → Réseau → Coupe-feu → Options* : autorisez les connexions entrantes pour **node**
(macOS le demande aussi au premier lancement : cliquez « Autoriser »).

### Linux

```bash
sudo ufw allow 3000/tcp                                    # Ubuntu/Debian (ufw)
sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload   # Fedora (firewalld)
```

## 5. Dépannage Wi-Fi

### Diagnostic pas à pas

| Test | Résultat | Conclusion |
|---|---|---|
| `http://localhost:3000` sur l'ordinateur | ne s'ouvre pas | le serveur n'est pas lancé (ou port déjà pris : voir le message dans la console) |
| `http://<IP>:3000` **sur l'ordinateur lui-même** | ne s'ouvre pas | mauvaise IP : essayez une autre adresse listée dans la console |
| `http://<IP>:3000` sur le téléphone | « délai dépassé » / tourne dans le vide | pare-feu (§4) **ou** isolation Wi-Fi (ci-dessous) |
| Le téléphone affiche « site inaccessible » immédiatement | | le téléphone n'est pas sur le même réseau (vérifiez qu'il n'est pas en 4G/5G) |

Vérifiez aussi :

- l'**IP du téléphone** (Réglages Wi-Fi → détails du réseau) commence comme celle de l'ordinateur
  (ex. `192.168.1.x` des deux côtés) ;
- tapez bien **`http://`** et non `https://` (le serveur local n'a pas de certificat) ;
- désactivez le **VPN** de l'ordinateur et du téléphone, ainsi que les « relais privés » (iCloud) ;
- sur iPhone/Android, l'option « adresse Wi-Fi privée » ne pose pas de problème.

### Réseau « invité » et isolation des appareils

Beaucoup de box et de bornes (réseaux **invités**, Wi-Fi d'hôtel, de gîte, de camping, d'entreprise,
d'école…) activent l'**isolation des clients** (*AP isolation*, *client isolation*, *isolation Wi-Fi*) :
chaque appareil accède à Internet mais **ne peut pas joindre les autres appareils** du même Wi-Fi.
Symptôme : tout semble correct, le pare-feu est ouvert, mais aucun téléphone ne se connecte.

Pour le confirmer : désactivez temporairement le pare-feu de l'ordinateur pour ce réseau privé.
Si les téléphones ne se connectent toujours pas, c'est l'isolation. Réactivez ensuite le pare-feu.

Solutions, de la plus simple à la plus technique :

1. **Utiliser le réseau principal** de la box au lieu du réseau « invité ».
2. **Créer un point d'accès depuis l'ordinateur** (fonctionne sans Internet) :
   *Windows : Paramètres → Réseau et Internet → Point d'accès mobile* → activez-le, puis connectez les
   téléphones à ce réseau. L'ordinateur a alors généralement l'adresse `http://192.168.137.1:3000`
   (relancez `npm start` pour afficher la bonne adresse et le bon QR code).
   *macOS : Partage Internet* nécessite une connexion source ; préférez la solution 3.
3. **Partage de connexion d'un téléphone** : l'ordinateur et les autres téléphones se connectent au
   point d'accès d'un des téléphones. La plupart des téléphones n'isolent pas les appareils
   (la data mobile n'est pas consommée par le jeu, tout reste local).
4. Désactiver l'isolation dans l'interface d'administration de la box/borne (option souvent nommée
   « isolation des clients », « AP isolation » ou « isolation Wi-Fi »), si vous en avez l'accès.

## 6. Règles implémentées

21 cartes : Espionne (0) ×2, Garde (1) ×6, Prêtre (2) ×2, Baron (3) ×2, Servante (4) ×2, Prince (5) ×2,
Chancelier (6) ×2, Roi (7), Comtesse (8), Princesse (9). Le bouton **📜 Règles** du jeu résume chaque carte.

Précisions d'arbitrage retenues :

- Sans cible légale (adversaires protégés ou éliminés), Garde, Prêtre, Baron et Roi sont joués **sans effet** ;
  le Prince doit alors cibler son propre joueur.
- La fin de manche « pioche vide » est vérifiée après la résolution complète du tour (Chancelier compris).
- Chancelier : la carte remise **en premier** passe sous la pioche avant la seconde, qui finit donc tout en dessous.
- **Premier joueur de la manche suivante (règle de la table)** : le joueur qui a **perdu en premier** la
  manche (premier éliminé). Si personne n'a été éliminé, celui qui avait la plus faible main à la révélation
  (puis la plus petite défausse). Une élimination décidée par l'hôte (joueur déconnecté) ne compte pas.
  La règle officielle (« le gagnant commence ; s'il y en a plusieurs, le premier dans l'ordre du tour ») reste
  disponible : `rules.nextRoundStarter: 'winner'` dans `server/editions/2019.js`.
- Le journal repart de zéro à chaque manche (il reste lisible jusqu'au lancement de la suivante).
- Égalité au seuil de jetons : manche de départage avec les seuls ex aequo (mise en place selon leur nombre,
  donc 3 cartes visibles s'ils sont 2) ; la partie s'arrête dès que l'un d'eux a strictement plus de jetons.
- La carte écartée face cachée n'est **jamais** révélée, même en fin de manche ; le dernier survivant
  d'une manche ne révèle pas sa main.
- Joueur éliminé par l'hôte pendant son Chancelier : toutes les cartes en sa possession sont défaussées.
- Le seuil de jetons reste celui du début de partie, même si un joueur est retiré.

## 7. Tests et simulation

```bash
npm test          # tests unitaires et d'intégration (Node test runner, aucune dépendance)
npm run bots      # 600 parties aléatoires de 2 à 6 joueurs avec vérification des invariants
npm run bots -- --games 3000 --seed 42
```

Les tests couvrent : composition du paquet et mise en place (2 à 6 joueurs), chaque carte et ses cas
limites, le Chancelier (pioche de 3+, 1 et 0 carte, ordre, choix invalides), le bonus Espionne, les fins
de manche (élimination, pioche vide, départages), les jetons et la fin de partie, l'absence de fuite
d'information dans les vues, le lobby, la reconnexion pendant une décision en attente et un vrai
serveur socket.io.

La simulation vérifie à **chaque action** : 21 cartes au total, tailles de main cohérentes, jetons
jamais en baisse, coups légaux toujours acceptés, coups illégaux refusés proprement, aucune fuite dans
les vues privées, et que chaque partie se termine.

Vérifier soi-même l'absence de fuite : sur un téléphone ou dans le navigateur, *DevTools → Réseau → WS* :
les messages `state` ne contiennent que **votre** main (`hand`), le nombre de cartes des autres
(`handCount`) et le nombre de cartes de la pioche (`deckCount`).

## 8. Architecture

```
love-letter/
├── package.json
├── README.md
├── server/
│   ├── index.js            # Express + socket.io, IP locale, QR (console et /api/qr.svg)
│   ├── net.js              # détection des adresses IPv4 du réseau local
│   ├── rooms.js            # salles, joueurs, jetons de reconnexion, diffusion des vues
│   ├── editions/
│   │   ├── index.js        # registre des éditions
│   │   └── 2019.js         # DONNÉES : cartes, quantités, jetons, mise en place
│   └── game/
│       ├── engine.js       # moteur PUR : createGame, applyAction, applyHostAction, legalPlays
│       ├── cards.js        # effets des cartes
│       ├── rng.js          # aléatoire avec graine (déterministe, état dans la partie)
│       └── views.js        # vue privée de chaque joueur (liste blanche)
├── client/                 # HTML/CSS/JS vanilla, modules ES, aucune étape de build
│   ├── index.html
│   ├── css/style.css
│   └── js/ (main, socket, util, rules, cards-art, screens/home|lobby|game)
├── scripts/bots.js         # simulation de parties aléatoires
└── tests/                  # node:test — engine, cards, views, rooms, server
```

- **Moteur pur** : `applyAction(state, playerId, action) → { state, events }`, sans réseau ni effet de bord ;
  l'état d'origine n'est jamais modifié ; une action illégale lève une `GameError` au message clair.
- **Décisions en attente** : `state.pending` (Chancelier : étape « garder » puis « ordre »). Comme elles font
  partie de l'état, un joueur qui se reconnecte retrouve exactement la même décision.
- **Événements** publics ou privés (`scope`/`to`) : le journal public ne révèle rien du Prêtre, du Baron,
  du Roi ni du Chancelier ; les détails ne vont qu'aux joueurs concernés.
- **Protocole** (socket.io, réponses `{ ok, error }`) : `create`, `join`, `resume`, `leave`, `start`,
  `action`, `host` ; le serveur pousse `state`, `events`, `history`, `kicked`.

### Ajouter l'édition 2012

1. Créer `server/editions/2012.js` sur le modèle de `2019.js` (16 cartes, pas d'Espionne ni de Chancelier,
   jetons et mise en place propres à cette édition).
2. L'enregistrer dans `server/editions/index.js`.
3. Si une carte a un effet inédit, l'ajouter dans `server/game/cards.js` (un nom d'effet = une fonction).
4. Choisir l'édition à la création du serveur (`createServer({ editionId: '2012' })`).

## 9. Checklist de test manuel

À faire avec l'ordinateur et 3 à 6 téléphones (ou des fenêtres privées en mode appareil à 360 px).

**Connexion et salon**
- [ ] `npm start` affiche l'IP locale et un QR code ; `http://localhost:3000` affiche le QR sur l'accueil.
- [ ] Un téléphone scanne le QR, crée une partie : code à 4 lettres et QR du salon affichés.
- [ ] Les autres rejoignent via le QR du salon (code pré-rempli) ; la liste se met à jour partout.
- [ ] Pseudo déjà pris, code inconnu, 7ᵉ joueur : message d'erreur clair.
- [ ] Le salon affiche le bon nombre de jetons requis (6/5/4/3/3).
- [ ] Seul l'hôte voit « Lancer la partie » ; il peut retirer un joueur du salon (double confirmation).

**Déroulement**
- [ ] Le premier joueur change d'une partie à l'autre ; son téléphone vibre et affiche « À vous de jouer ! ».
- [ ] À 2 joueurs : 3 cartes retirées visibles affichées ; à 3+ : aucune.
- [ ] Garde : seules les cibles légales sont proposées ; « Garde » n'est pas proposé ; l'Espionne l'est ;
      étape de confirmation avant l'envoi.
- [ ] Prêtre : seul le joueur actif voit la carte (bandeau 🔒) ; le journal public dit seulement « regarde la main ».
- [ ] Baron : seuls les deux joueurs voient la comparaison ; égalité → rien.
- [ ] Servante : 🛡️ affiché, le joueur n'est plus proposé comme cible jusqu'à son tour.
- [ ] Tous les adversaires protégés : la carte est jouée « sans effet » ; le Prince ne propose que « Vous-même ».
- [ ] Prince sur un joueur qui a la Princesse : il est éliminé.
- [ ] Comtesse + Roi (ou Prince) : l'autre carte est grisée avec la raison ; Comtesse + Chancelier : libre.
- [ ] Chancelier : écran privé avec 3 cartes, choix de la carte gardée, puis ordre (« Remettre en premier »),
      les autres voient seulement « utilise le Chancelier ».
- [ ] Roi : échange des mains, chacun voit la carte reçue.
- [ ] Indicateur 🕵️ sur les joueurs ayant joué une Espionne, ligne « Espionne jouée par… ».
- [ ] Défausses repliables par joueur ; nombre de cartes de la pioche à jour.

**Reconnexion**
- [ ] Verrouiller un téléphone 30 s : les autres voient 📴 ; au déverrouillage, retour automatique dans la partie.
- [ ] Fermer l'onglet pendant son Chancelier, rouvrir l'adresse : même écran, mêmes 3 cartes, même étape.
- [ ] Couper le Wi-Fi d'un téléphone : bandeau « Connexion perdue » puis retour automatique.
- [ ] Joueur déconnecté pendant son tour : l'hôte l'élimine de la manche, la partie continue.
- [ ] Entre deux manches, l'hôte peut retirer définitivement un joueur déconnecté.

**Fins de manche et de partie**
- [ ] Fin par élimination : le survivant gagne 1 jeton, sa main n'est pas révélée.
- [ ] Fin par pioche vide : mains révélées, somme des défausses affichée, ex aequo gérés.
- [ ] Bonus Espionne détaillé (un seul → +1 ; plusieurs → aucun).
- [ ] Le **premier éliminé** commence la manche suivante (annoncé en fin de manche) ; sans éliminé, la plus faible main.
- [ ] Le journal est vide au début de chaque nouvelle manche, et regroupé par tour.

**Lisibilité et discrétion (v1.1)**
- [ ] La main est affichée face cachée ; « Voir ma main » la retourne ; elle se recache après mon tour,
      après 8 s hors de mon tour, et quand je verrouille le téléphone.
- [ ] Quand la main est cachée, les lignes secrètes du journal et les bandeaux (Prêtre, Baron, Roi) sont masqués.
- [ ] Le panneau « Dernier coup » montre la carte jouée et ses conséquences ; il est surligné si j'étais visé.
- [ ] Chaque tuile de joueur affiche sa dernière carte défaussée.
- [ ] Quand un autre joueur me cible, un bandeau 🎯 s'affiche (et le téléphone vibre sur Android).
- [ ] Fin de partie : classement, « Nouvelle partie » ramène tout le monde au salon.

**Confidentialité et robustesse**
- [ ] DevTools → Réseau → WS : aucune main adverse, aucun contenu de pioche, aucune carte écartée.
- [ ] Deux parties en parallèle (deux codes) ne se mélangent pas.
- [ ] Affichage correct à 360 px de large avec 6 joueurs (pas de défilement horizontal).
- [ ] Bouton « 📜 Règles » disponible sur l'accueil, le salon et en jeu.

## 10. Versions et branches

| Branche / tag | Contenu |
|---|---|
| `main` | toujours la **dernière version** publiée |
| `release/1.1.0` · tag `v1.1.0` | main cachée, journal par manche, premier éliminé qui commence, interface plus claire |
| `release/1.0.0` · tag `v1.0.0` | première version complète |

Numérotation [SemVer](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`. Une nouvelle version se
prépare sur une branche `release/x.y.z`, puis est fusionnée dans `main` et marquée d'un tag `vx.y.z`.
Pour rejouer une ancienne version : `git checkout v1.0.0` (puis `npm install` et `npm start`).
