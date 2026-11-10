'use strict';
/**
 * Gestion des salles : création, lobby, joueurs, connexions, reconnexion,
 * relais des actions vers le moteur et diffusion des vues personnalisées.
 *
 * Ce module ne dépend PAS de socket.io : il reçoit une fonction `emit(socketId, event, data)`
 * (injectée par server/index.js, ou par les tests).
 *
 * Identifiants :
 *  - player.id    : public (sert à désigner une cible), connu de tous ;
 *  - player.token : SECRET, connu seulement du téléphone du joueur (localStorage).
 *                   Il permet de reprendre sa place après une déconnexion.
 *
 * Messages émis vers un client :
 *  - 'state'   : { room, me, game }  vue complète, personnalisée (jamais de jeton ni de carte cachée)
 *  - 'events'  : [événements]        nouveaux événements visibles par ce joueur
 *  - 'history' : [événements]        journal complet (à la (re)connexion)
 *  - 'kicked'  : { message }         le joueur a été retiré du lobby
 */
const crypto = require('crypto');
const engine = require('./game/engine');
const { buildView, eventsFor } = require('./game/views');
const { getEdition } = require('./editions');

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O (confusion avec 1 et 0)
const MAX_NAME = 16;
const MAX_EVENTS = 400;

class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

/** Nettoie un pseudo : espaces, caractères de contrôle, longueur. */
function cleanName(name) {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) throw new RoomError('BAD_NAME', 'Choisissez un pseudo.');
  if (s.length > MAX_NAME) throw new RoomError('BAD_NAME', `Pseudo trop long (${MAX_NAME} caractères maximum).`);
  return s;
}

/** Ne garde que les champs attendus d'une action venant du réseau. */
function sanitizeAction(a) {
  if (!a || typeof a !== 'object') throw new RoomError('BAD_ACTION', 'Action invalide.');
  const out = { type: String(a.type ?? '') };
  if (a.card != null) out.card = String(a.card);
  if (a.target != null) out.target = String(a.target);
  if (a.guess != null) out.guess = String(a.guess);
  if (a.index != null) out.index = Number(a.index);
  if (Array.isArray(a.order)) out.order = a.order.slice(0, 3).map(Number);
  return out;
}

class RoomManager {
  /**
   * @param {object} opts
   * @param {(socketId:string, event:string, data:any)=>void} [opts.emit]
   * @param {()=>number} [opts.now]
   * @param {string} [opts.editionId]
   */
  constructor({ emit = () => {}, now = () => Date.now(), editionId = '2019' } = {}) {
    this.emit = emit;
    this.now = now;
    this.editionId = editionId;
    this.rooms = new Map();   // code → room
    this.tokens = new Map();  // token → { code, playerId }
    this.sockets = new Map(); // socketId → { code, playerId }
  }

  // -------------------------------------------------------------------------
  // Accès
  // -------------------------------------------------------------------------

  newCode() {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('NO_CODE', 'Impossible de créer une salle, réessayez.');
  }

  getRoom(code) {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room) throw new RoomError('NO_ROOM', 'Aucune partie avec ce code.');
    return room;
  }

  /** Joueur lié à une socket (ou erreur). */
  bySocket(socketId) {
    const link = this.sockets.get(socketId);
    if (!link) throw new RoomError('NOT_IN_ROOM', "Vous n'êtes dans aucune partie.");
    const room = this.rooms.get(link.code);
    const player = room && room.players.find((p) => p.id === link.playerId);
    if (!player) {
      this.sockets.delete(socketId);
      throw new RoomError('NOT_IN_ROOM', "Vous n'êtes plus dans cette partie.");
    }
    return { room, player };
  }

  requireHost(room, player) {
    if (room.hostId !== player.id) throw new RoomError('NOT_HOST', "Seul l'hôte peut faire cela.");
  }

  // -------------------------------------------------------------------------
  // Connexions
  // -------------------------------------------------------------------------

  /** Lie une socket à un joueur (une socket ne peut représenter qu'un joueur). */
  attach(socketId, room, player) {
    const prev = this.sockets.get(socketId);
    if (prev && !(prev.code === room.code && prev.playerId === player.id)) this.detach(socketId);
    this.sockets.set(socketId, { code: room.code, playerId: player.id });
    player.sockets.add(socketId);
    room.lastActivity = this.now();
  }

  /** Délie une socket ; le joueur est « déconnecté » s'il n'a plus aucune socket. */
  detach(socketId, { silent = false } = {}) {
    const link = this.sockets.get(socketId);
    if (!link) return;
    this.sockets.delete(socketId);
    const room = this.rooms.get(link.code);
    const player = room && room.players.find((p) => p.id === link.playerId);
    if (!player) return;
    player.sockets.delete(socketId);
    if (!silent && player.sockets.size === 0) this.broadcast(room);
  }

  /** Appelé par le serveur quand une socket se ferme (téléphone verrouillé, Wi-Fi perdu…). */
  disconnect(socketId) {
    this.detach(socketId);
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  newPlayer(name) {
    const player = {
      id: crypto.randomBytes(4).toString('hex'),
      token: crypto.randomBytes(18).toString('base64url'),
      name,
      sockets: new Set(),
    };
    return player;
  }

  /** Crée une salle ; le créateur en devient l'hôte et y entre comme joueur. */
  create(socketId, name) {
    const clean = cleanName(name);
    const code = this.newCode();
    const player = this.newPlayer(clean);
    const room = {
      code,
      hostId: player.id,
      players: [player],
      game: null,
      events: [],
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    this.rooms.set(code, room);
    this.tokens.set(player.token, { code, playerId: player.id });
    this.attach(socketId, room, player);
    this.sendFull(room, player, socketId);
    return { code, token: player.token, playerId: player.id };
  }

  /** Rejoint une salle existante (avant le début de la partie). */
  join(socketId, code, name) {
    const room = this.getRoom(code);
    const clean = cleanName(name);
    if (room.game) throw new RoomError('STARTED', 'La partie a déjà commencé.');
    const ed = getEdition(this.editionId);
    if (room.players.length >= ed.maxPlayers) {
      throw new RoomError('FULL', `La partie est complète (${ed.maxPlayers} joueurs maximum).`);
    }
    if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new RoomError('NAME_TAKEN', 'Ce pseudo est déjà pris dans cette partie.');
    }
    const player = this.newPlayer(clean);
    room.players.push(player);
    this.tokens.set(player.token, { code: room.code, playerId: player.id });
    this.attach(socketId, room, player);
    this.pushEvents(room, [{ scope: 'public', type: 'join', text: `${clean} a rejoint la partie.` }]);
    return { code: room.code, token: player.token, playerId: player.id };
  }

  /** Reconnexion avec le jeton secret : on retrouve sa place, même en pleine décision. */
  resume(socketId, token) {
    const link = this.tokens.get(String(token ?? ''));
    const room = link && this.rooms.get(link.code);
    const player = room && room.players.find((p) => p.id === link.playerId);
    if (!player) throw new RoomError('BAD_TOKEN', 'Partie introuvable (terminée ou serveur redémarré).');
    const wasOffline = player.sockets.size === 0;
    this.attach(socketId, room, player);
    this.sendFull(room, player, socketId);
    if (wasOffline) this.broadcast(room, [], player.id); // les autres voient « reconnecté »
    return { code: room.code, token: player.token, playerId: player.id };
  }

  /** Quitter le lobby (ou abandonner sa place quand la partie n'a pas commencé). */
  leave(socketId) {
    const { room, player } = this.bySocket(socketId);
    if (room.game && room.game.phase !== 'gameOver') {
      throw new RoomError('IN_GAME', "Impossible de quitter pendant la partie : demandez à l'hôte de vous retirer.");
    }
    this.removeFromRoom(room, player);
    return {};
  }

  removeFromRoom(room, player, { kicked = false } = {}) {
    for (const sid of player.sockets) {
      this.sockets.delete(sid);
      if (kicked) this.emit(sid, 'kicked', { message: "L'hôte vous a retiré de la partie." });
    }
    this.tokens.delete(player.token);
    room.players = room.players.filter((p) => p !== player);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === player.id) {
      // Le rôle d'hôte passe au joueur connecté suivant.
      const next = room.players.find((p) => p.sockets.size > 0) || room.players[0];
      room.hostId = next.id;
    }
    this.pushEvents(room, [{ scope: 'public', type: 'leave', text: `${player.name} a quitté la partie.` }]);
  }

  /** L'hôte lance la partie. `seed` est optionnel (tests). */
  start(socketId, { seed } = {}) {
    const { room, player } = this.bySocket(socketId);
    this.requireHost(room, player);
    if (room.game && room.game.phase !== 'gameOver') throw new RoomError('STARTED', 'La partie a déjà commencé.');
    const ed = getEdition(this.editionId);
    const n = room.players.length;
    if (n < ed.minPlayers) throw new RoomError('NOT_ENOUGH', `Il faut au moins ${ed.minPlayers} joueurs.`);
    const { state, events } = engine.createGame({
      players: room.players.map((p) => ({ id: p.id, name: p.name })),
      seed,
      editionId: this.editionId,
    });
    room.game = state;
    room.events = [];
    this.pushEvents(room, [
      { scope: 'public', type: 'gameStart', text: `🎲 La partie commence ! ${state.tokensToWin} jetons pour gagner.` },
      ...events,
    ]);
    return {};
  }

  // -------------------------------------------------------------------------
  // Jeu
  // -------------------------------------------------------------------------

  /** Action d'un joueur : validée par le moteur, puis diffusée. */
  act(socketId, rawAction) {
    const { room, player } = this.bySocket(socketId);
    if (!room.game) throw new RoomError('NO_GAME', "La partie n'a pas commencé.");
    const action = sanitizeAction(rawAction);
    const { state, events } = engine.applyAction(room.game, player.id, action);
    room.game = state;
    this.pushEvents(room, events);
    return {};
  }

  /** Actions réservées à l'hôte. */
  hostAction(socketId, rawAction) {
    const { room, player } = this.bySocket(socketId);
    this.requireHost(room, player);
    const action = sanitizeAction(rawAction);

    if (action.type === 'kick') {
      // Retirer quelqu'un du lobby (avant la partie).
      if (room.game && room.game.phase !== 'gameOver') throw new RoomError('IN_GAME', 'La partie est en cours.');
      const target = room.players.find((p) => p.id === action.target);
      if (!target || target === player) throw new RoomError('BAD_TARGET', 'Joueur invalide.');
      this.removeFromRoom(room, target, { kicked: true });
      return {};
    }
    if (action.type === 'restart') {
      // Après la fin de partie : retour au lobby avec les mêmes joueurs.
      if (!room.game || room.game.phase !== 'gameOver') throw new RoomError('IN_GAME', "La partie n'est pas terminée.");
      room.game = null;
      room.events = [];
      this.pushEvents(room, [{ scope: 'public', type: 'lobby', text: 'Retour au salon : prêts pour une nouvelle partie !' }]);
      return {};
    }

    if (!room.game) throw new RoomError('NO_GAME', "La partie n'a pas commencé.");
    if (action.type === 'forceEliminate' || action.type === 'removePlayer') {
      const target = room.players.find((p) => p.id === action.target);
      if (!target) throw new RoomError('BAD_TARGET', 'Joueur invalide.');
      if (target.sockets.size > 0) {
        throw new RoomError('CONNECTED', `${target.name} est connecté : on ne peut retirer qu'un joueur déconnecté.`);
      }
    } else if (action.type !== 'nextRound') {
      throw new RoomError('BAD_ACTION', `Action inconnue : « ${action.type} ».`);
    }
    const { state, events } = engine.applyHostAction(room.game, { type: action.type, target: action.target });
    room.game = state;
    this.pushEvents(room, events);
    return {};
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  /** Vue personnalisée d'un joueur (aucun jeton, aucune carte cachée). */
  payloadFor(room, player) {
    const ed = getEdition(this.editionId);
    return {
      room: {
        code: room.code,
        hostId: room.hostId,
        status: room.game ? 'game' : 'lobby',
        minPlayers: ed.minPlayers,
        maxPlayers: ed.maxPlayers,
        tokensToWin: { ...ed.tokensToWin },
        players: room.players.map((p) => ({
          id: p.id, name: p.name, connected: p.sockets.size > 0, isHost: p.id === room.hostId,
        })),
      },
      me: { id: player.id, name: player.name, isHost: player.id === room.hostId },
      game: room.game ? buildView(room.game, player.id) : null,
    };
  }

  /**
   * Enregistre des événements et diffuse le nouvel état à tous.
   * Le journal repart de zéro à chaque nouvelle manche (événement 'roundStart').
   */
  pushEvents(room, events) {
    const k = events.map((e) => e.type).lastIndexOf('roundStart');
    if (k >= 0) room.events = events.slice(k);
    else room.events.push(...events);
    if (room.events.length > MAX_EVENTS) room.events.splice(0, room.events.length - MAX_EVENTS);
    room.lastActivity = this.now();
    this.broadcast(room, events);
  }

  /** Envoie à chaque joueur connecté sa vue et les nouveaux événements qui le concernent. */
  broadcast(room, events = [], exceptPlayerId = null) {
    for (const p of room.players) {
      if (p.id === exceptPlayerId) continue;
      const payload = this.payloadFor(room, p);
      const evs = events.length ? eventsFor(events, p.id) : [];
      for (const sid of p.sockets) {
        this.emit(sid, 'state', payload);
        if (evs.length) this.emit(sid, 'events', evs);
      }
    }
  }

  /** État complet + journal pour une seule socket (connexion / reconnexion). */
  sendFull(room, player, socketId) {
    this.emit(socketId, 'state', this.payloadFor(room, player));
    this.emit(socketId, 'history', eventsFor(room.events, player.id));
  }

  /** Supprime les salles abandonnées. */
  cleanup({ idleMs = 2 * 3600e3, maxIdleMs = 12 * 3600e3 } = {}) {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.lastActivity;
      const anyone = room.players.some((p) => p.sockets.size > 0);
      if ((!anyone && idle > idleMs) || idle > maxIdleMs) {
        for (const p of room.players) {
          this.tokens.delete(p.token);
          for (const sid of p.sockets) this.sockets.delete(sid);
        }
        this.rooms.delete(room.code);
      }
    }
  }
}

module.exports = { RoomManager, RoomError, cleanName, sanitizeAction };
