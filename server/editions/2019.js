'use strict';
/**
 * Édition 2019 de Love Letter : 21 cartes, 2 à 6 joueurs.
 *
 * Ce fichier ne contient QUE des données. Le moteur (server/game/engine.js)
 * lit ces données ; les effets sont référencés par leur nom (champ `effect`)
 * et implémentés dans server/game/cards.js.
 *
 * Champs d'une carte :
 *  - id                : identifiant technique (utilisé dans le protocole)
 *  - value             : valeur de la carte
 *  - name / article    : nom affiché et article (« le Garde », « l'Espionne »)
 *  - count             : nombre d'exemplaires dans le paquet
 *  - effect            : nom de l'effet (voir cards.js)
 *  - targeting         : 'opponent' (un adversaire non protégé), 'anyone' (soi-même autorisé) ou absent
 *  - cannotGuess       : cartes qu'on ne peut pas nommer (Garde)
 *  - draw              : nombre de cartes piochées (Chancelier)
 *  - mustPlayIfHolding : la carte DOIT être jouée si l'autre carte en main est l'une de celles-ci (Comtesse)
 *  - eliminateOnDiscard: jouer ou défausser cette carte élimine son détenteur (Princesse)
 *  - endOfRoundBonus   : bonus de fin de manche (Espionne)
 *  - text              : résumé de l'effet affiché aux joueurs
 */
module.exports = {
  id: '2019',
  name: 'Love Letter — édition 2019',
  minPlayers: 2,
  maxPlayers: 6,

  cards: [
    {
      id: 'spy', value: 0, name: 'Espionne', article: "l'", count: 2,
      effect: 'none', endOfRoundBonus: 'spy',
      text: "Aucun effet quand elle est jouée. En fin de manche, si vous êtes le seul joueur encore en lice à avoir joué ou défaussé une Espionne, vous gagnez 1 jeton.",
    },
    {
      id: 'guard', value: 1, name: 'Garde', article: 'le ', count: 6,
      effect: 'guess', targeting: 'opponent', cannotGuess: ['guard'],
      text: "Choisissez un adversaire et nommez une carte autre que Garde. S'il a cette carte en main, il est éliminé.",
    },
    {
      id: 'priest', value: 2, name: 'Prêtre', article: 'le ', count: 2,
      effect: 'peek', targeting: 'opponent',
      text: "Regardez en secret la main d'un adversaire.",
    },
    {
      id: 'baron', value: 3, name: 'Baron', article: 'le ', count: 2,
      effect: 'compare', targeting: 'opponent',
      text: "Comparez en secret votre main avec celle d'un adversaire. Le plus faible est éliminé (égalité : rien ne se passe).",
    },
    {
      id: 'handmaid', value: 4, name: 'Servante', article: 'la ', count: 2,
      effect: 'protect',
      text: "Jusqu'à votre prochain tour, aucune carte ne peut vous cibler.",
    },
    {
      id: 'prince', value: 5, name: 'Prince', article: 'le ', count: 2,
      effect: 'discardDraw', targeting: 'anyone',
      text: "Choisissez un joueur (vous compris) : il défausse sa main sans effet et pioche une nouvelle carte.",
    },
    {
      id: 'chancellor', value: 6, name: 'Chancelier', article: 'le ', count: 2,
      effect: 'chancellor', draw: 2,
      text: "Piochez 2 cartes, gardez-en 1 parmi vos 3 et remettez les 2 autres sous la pioche dans l'ordre de votre choix.",
    },
    {
      id: 'king', value: 7, name: 'Roi', article: 'le ', count: 1,
      effect: 'swap', targeting: 'opponent',
      text: "Échangez votre main avec celle d'un adversaire.",
    },
    {
      id: 'countess', value: 8, name: 'Comtesse', article: 'la ', count: 1,
      effect: 'none', mustPlayIfHolding: ['king', 'prince'],
      text: "Aucun effet, mais vous devez la jouer si vous avez aussi le Roi ou un Prince en main.",
    },
    {
      id: 'princess', value: 9, name: 'Princesse', article: 'la ', count: 1,
      effect: 'none', eliminateOnDiscard: true,
      text: "Si vous la jouez ou la défaussez, pour quelque raison que ce soit, vous êtes éliminé.",
    },
  ],

  /** Jetons de faveur nécessaires pour gagner, selon le nombre de joueurs en début de partie. */
  tokensToWin: { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 },

  /** Mise en place d'une manche. */
  setup: {
    faceDown: 1,                       // cartes écartées face cachée
    faceUpByPlayerCount: { 2: 3 },     // cartes retirées face visible (à 2 joueurs uniquement)
  },

  /** Options de règles (modifiables par partie via createGame({ options })). */
  rules: {
    /**
     * Qui commence la manche suivante ?
     *  - 'firstEliminated' : le premier joueur éliminé de la manche (règle de la table, par défaut).
     *    Si personne n'a été éliminé, celui qui avait la plus faible main à la révélation.
     *  - 'winner'          : le gagnant de la manche (règle officielle).
     */
    nextRoundStarter: 'firstEliminated',
  },
};
