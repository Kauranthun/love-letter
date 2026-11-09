'use strict';
/**
 * Détection des adresses IPv4 locales, pour afficher l'URL à ouvrir sur les téléphones.
 * Les adaptateurs virtuels (WSL, Hyper-V, VirtualBox, Docker, VPN…) sont classés en dernier.
 */
const os = require('os');

const VIRTUAL = /(vethernet|virtualbox|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale|zerotier|hamachi|utun|virbr|veth|^br-|^tun|^tap)/i;

function score(address, name) {
  let s = 0;
  if (address.startsWith('192.168.')) s = 30;
  else if (address.startsWith('10.')) s = 20;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s = 10; // souvent Docker/WSL : moins probable
  if (/wi-?fi|wlan|wlp|en0|wireless/i.test(name)) s += 5;
  if (VIRTUAL.test(name)) s -= 100;
  return s;
}

/** Liste des IPv4 non internes, la plus probable en premier. */
function getLanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      // Node 18.0–18.3 utilisait un nombre (4) au lieu de 'IPv4'.
      const isV4 = a.family === 'IPv4' || a.family === 4;
      if (!isV4 || a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name), score: score(a.address, name) });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Est-ce une adresse « locale à la machine » (inutilisable depuis un téléphone) ? */
function isLoopbackHost(hostname) {
  return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(hostname);
}

module.exports = { getLanAddresses, isLoopbackHost };
