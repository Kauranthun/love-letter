# Journal des versions

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [1.1.0] — 2026-11-10

Retours après les premières parties de test.

### Ajouté
- **Main cachée** : les cartes sont affichées face cachée (dos illustré) ; « 👁 Voir ma main » les retourne.
  Elles se recachent automatiquement après son tour, au bout de 8 s hors de son tour, et dès que
  l'application passe en arrière-plan (téléphone verrouillé). Le Chancelier est aussi caché.
- Les informations secrètes (Prêtre, Baron, Roi, cartes piochées) sont masquées dans le journal et
  les bandeaux tant que la main est cachée.
- Panneau **« Dernier coup »** : la carte jouée en grand, la phrase d'action et ses conséquences
  (élimination, défausse…) ; mis en évidence quand le coup vous visait.
- Bandeau 🎯 + vibration quand un autre joueur vous cible ; bandeau quand vous êtes éliminé.
- Dernière carte défaussée de chaque joueur visible sur sa tuile.
- Rappel de l'effet de la carte choisie pendant la sélection de la cible.
- Fin de manche : ordre des éliminations et annonce du joueur qui commencera la manche suivante.
- Numéro de version sur l'accueil, dans la console et dans `/api/info` ; ce CHANGELOG.

### Modifié
- **Premier joueur de la manche suivante** : le joueur qui a **perdu en premier** la manche
  (premier éliminé, hors éliminations par l'hôte) ; sans élimination, la plus faible main révélée.
  Option d'édition `rules.nextRoundStarter` (`'firstEliminated'` par défaut, `'winner'` = règle officielle).
- **Journal par manche** : il repart de zéro à chaque nouvelle manche (y compris l'historique envoyé
  à la reconnexion) et il est regroupé par tour (« Tour de Bertrand », « Fin de la manche »…).
- État du tour plus explicite (« en train de choisir une carte… », « utilise le Chancelier… »).
- Un appui sur un bandeau le ferme.

### Tests
- 89 tests (règle du premier éliminé, option règle officielle, élimination par l'hôte non comptée,
  journal remis à zéro par manche) ; la simulation par bots vérifie que le joueur annoncé commence bien.

## [1.0.0] — 2026-11-09

Première version complète : moteur pur et testé (édition 2019, 21 cartes, 2 à 6 joueurs), serveur
Express + socket.io en réseau local avec IP et QR code, salons à code, reconnexion (y compris pendant
le Chancelier), interface mobile illustrée, README (pare-feu, Wi-Fi), simulation par bots.
