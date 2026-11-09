'use strict';
/**
 * Serveur Love Letter : Express (fichiers du client + petite API) et socket.io (temps réel).
 *
 *   npm start                     → port 3000
 *   PORT=4000 npm start           → autre port (PowerShell : $env:PORT=4000; npm start)
 *
 * Aucune ressource externe : le client, le script socket.io et les QR codes sont servis localement.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const { RoomManager, RoomError } = require('./rooms');
const { GameError } = require('./game/engine');
const { publicEdition } = require('./editions');
const { getLanAddresses, isLoopbackHost } = require('./net');

const CLIENT_DIR = path.join(__dirname, '..', 'client');

/**
 * Crée le serveur (sans le démarrer). Utilisé par `npm start` et par les tests d'intégration.
 * @returns {{ app, server, io, manager, listen:(port?:number, host?:string)=>Promise<number>, close:()=>Promise<void> }}
 */
function createServer({ editionId = '2019' } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    serveClient: true,          // /socket.io/socket.io.js servi localement
    pingInterval: 10000,        // détection rapide des téléphones qui se mettent en veille
    pingTimeout: 8000,
    maxHttpBufferSize: 16e3,    // les messages des clients sont minuscules
  });
  const manager = new RoomManager({
    editionId,
    emit: (socketId, event, data) => io.to(socketId).emit(event, data),
  });

  let port = 0;

  /** URL à afficher aux téléphones : jamais « localhost », toujours une IP du réseau local. */
  function publicBaseUrl(req) {
    const host = req.headers.host || '';
    const hostname = host.replace(/:\d+$/, '');
    if (host && !isLoopbackHost(hostname)) return `http://${host}`;
    const lan = getLanAddresses()[0];
    return lan ? `http://${lan.address}:${port}` : `http://localhost:${port}`;
  }

  app.disable('x-powered-by');
  app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));

  app.get('/api/edition', (req, res) => res.json(publicEdition(editionId)));

  app.get('/api/info', (req, res) => {
    res.json({
      url: publicBaseUrl(req),
      addresses: getLanAddresses().map((a) => ({ name: a.name, url: `http://${a.address}:${port}`, virtual: a.virtual })),
    });
  });

  // QR code (SVG) de l'adresse du serveur, éventuellement avec le code de salle.
  app.get('/api/qr.svg', async (req, res) => {
    try {
      const code = String(req.query.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const url = publicBaseUrl(req) + (code ? `/?code=${code}` : '/');
      const svg = await QRCode.toString(url, {
        type: 'svg', margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#3a1a1f', light: '#fff8ec' },
      });
      res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
    } catch (err) {
      console.error('QR :', err);
      res.status(500).end();
    }
  });

  io.on('connection', (socket) => {
    /** Enregistre un gestionnaire : toute erreur est renvoyée proprement, jamais de crash. */
    const handle = (event, fn) => {
      socket.on(event, (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const result = fn(data && typeof data === 'object' ? data : {}) || {};
          reply({ ok: true, ...result });
        } catch (err) {
          if (err instanceof GameError || err instanceof RoomError) {
            reply({ ok: false, error: err.message, code: err.code });
          } else {
            console.error(`Erreur inattendue (${event}) :`, err);
            reply({ ok: false, error: 'Erreur interne du serveur. La partie continue.', code: 'INTERNAL' });
          }
        }
      });
    };

    handle('create', (d) => manager.create(socket.id, d.name));
    handle('join', (d) => manager.join(socket.id, d.code, d.name));
    handle('resume', (d) => manager.resume(socket.id, d.token));
    handle('leave', () => manager.leave(socket.id));
    handle('start', () => manager.start(socket.id));
    handle('action', (d) => manager.act(socket.id, d));
    handle('host', (d) => manager.hostAction(socket.id, d));

    socket.on('disconnect', () => {
      try {
        manager.disconnect(socket.id);
      } catch (err) {
        console.error('Erreur à la déconnexion :', err);
      }
    });
  });

  // Ménage des salles abandonnées toutes les 10 minutes.
  const timer = setInterval(() => manager.cleanup(), 10 * 60e3);
  timer.unref();

  return {
    app, server, io, manager,
    listen(p = 3000, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(p, host, () => {
          server.off('error', reject);
          port = server.address().port;
          resolve(port);
        });
      });
    },
    close() {
      clearInterval(timer);
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

/** Démarrage en ligne de commande : affiche les adresses et un QR code dans la console. */
async function main() {
  const wanted = Number(process.env.PORT) || 3000;
  const app = createServer();
  let port;
  try {
    port = await app.listen(wanted, '0.0.0.0');
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Le port ${wanted} est déjà utilisé (un autre serveur tourne peut-être déjà).`);
      console.error('   Choisissez-en un autre :');
      console.error('     PowerShell : $env:PORT=3001; npm start');
      console.error('     cmd        : set PORT=3001&& npm start');
      console.error('     macOS/Linux: PORT=3001 npm start\n');
    } else {
      console.error('❌ Impossible de démarrer le serveur :', err.message);
    }
    process.exit(1);
  }

  const addrs = getLanAddresses();
  const best = addrs[0];
  const url = best ? `http://${best.address}:${port}` : null;

  console.log('\n💌  Love Letter — serveur local démarré\n');
  console.log(`   Sur cet ordinateur : http://localhost:${port}`);
  if (url) {
    console.log(`   Sur les téléphones (même Wi-Fi) : \x1b[1m${url}\x1b[0m\n`);
    console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
    const others = addrs.slice(1);
    if (others.length) {
      console.log('   Autres adresses possibles (si la première ne marche pas) :');
      for (const a of others) console.log(`     http://${a.address}:${port}   (${a.name}${a.virtual ? ', virtuelle' : ''})`);
      console.log('');
    }
  } else {
    console.log('   ⚠️  Aucune adresse réseau trouvée : cet ordinateur est-il connecté au Wi-Fi ?\n');
  }
  console.log('   Ctrl+C pour arrêter.\n');

  const stop = () => {
    console.log('\nArrêt du serveur…');
    app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  // Filet de sécurité : une erreur imprévue est journalisée mais n'arrête pas les parties en cours.
  process.on('uncaughtException', (err) => console.error('Erreur non gérée :', err));
  process.on('unhandledRejection', (err) => console.error('Promesse rejetée non gérée :', err));
  main();
}

module.exports = { createServer };
