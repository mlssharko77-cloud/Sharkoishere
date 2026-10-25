// Malabar Life - game server (login, economy, ATM+PIN, chat, DM, positions, VC signaling)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const DB = path.join(process.env.DATA_DIR || __dirname, 'data.json');
const ROOT = path.join(__dirname, 'public');

// ---------- storage (JSON file; swap for a real DB when you grow) ----------
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
let dirty = false;
const save = () => { dirty = true; };
function flush() { if (!dirty) return; dirty = false; try { fs.writeFileSync(DB + '.tmp', JSON.stringify(db)); fs.renameSync(DB + '.tmp', DB); } catch (e) { console.error(e); } }
setInterval(flush, 3000);
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, () => { flush(); process.exit(0); }));

// ---------- crypto ----------
const hs = (s, salt) => crypto.scryptSync(s, salt, 32).toString('hex');
const mk = s => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + hs(s, salt); };
const ck = (s, h) => { const [salt, x] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(hs(s, salt), 'hex'), Buffer.from(x, 'hex')); };

// ---------- names ----------
const RES = /(admin|mod|owner|support|staff|police|system)/i;
const BAD = /(fuck|bitch|cunt|dick|pussy|sex)/i;
const skel = n => n.toLowerCase().replace(/[^a-z]/g, '');
function nameErr(n) {
  if (!/^[A-Za-z0-9_]{3,14}$/.test(n)) return 'Name 3-14 letters/numbers/_ mathram';
  if (skel(n).length < 3) return 'Kurach kooduthal letters venam';
  if (RES.test(n) || BAD.test(n)) return 'Ee name pattilla';
  if (Object.values(db.users).some(u => skel(u.name) === skel(n))) return 'Ee name (allenkil athu pole ulla name) eduthu poyi';
  return null;
}

// ---------- shop (server decides prices, client only sends item index) ----------
const PRICE = [300, 150, 400, 250, 600, 500, 20000, 8000, 4000, 5000];
function buy(u, i) {
  if (!Number.isInteger(i) || i < 0 || i >= PRICE.length) return 'Sheriyalla';
  if (u.cash < PRICE[i]) return 'Paisa illa';
  if (i === 6 && u.home) return 'Already undu';
  if (i === 7 && u.car) return 'Already undu';
  if (i === 9 && u.lic) return 'Already undu';
  if (i === 8) { if (!u.lic) return 'Aadyam Weapon Licence vangu'; if (u.gun) return 'Already undu'; }
  u.cash -= PRICE[i];
  if (i < 6) u.dress = i; else if (i === 6) u.home = 1; else if (i === 7) u.car = 1; else if (i === 8) u.gun = 1; else u.lic = 1;
  return null;
}
const state = u => ({ name: u.name, cash: u.cash, bank: u.bank, dress: u.dress, gun: !!u.gun, lic: !!u.lic, home: !!u.home, car: !!u.car, hasPin: !!u.pin, log: u.log.slice(0, 5) });

// ---------- http (serves /public) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  fs.readFile(f, (e, d) => { if (e) return res.writeHead(404).end('Not found'); res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const clients = new Map(); let nid = 0;
const tx = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const byName = n => db.users[String(n || '').trim().toLowerCase()];
const online = u => [...clients.values()].find(w => w.u === u);
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v || 0));
const tries = {};

wss.on('connection', (ws, req) => {
  ws.id = String(++nid);
  ws.ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; } try { handle(ws, m); } catch (e) { console.error(e); } });
  ws.on('close', () => clients.delete(ws.id));
});

function handle(ws, m) {
  if (m.t === 'reg' || m.t === 'login') {
    const now = Date.now(); tries[ws.ip] = (tries[ws.ip] || []).filter(t => now - t < 60000);
    if (tries[ws.ip].length >= 10) return tx(ws, { t: 'auth', ok: 0, err: 'Kooduthal try, 1 minute kazhinju nokku' });
    tries[ws.ip].push(now);
    const n = String(m.name || '').trim(), pw = String(m.pw || '');
    if (m.t === 'reg') {
      const e = nameErr(n); if (e) return tx(ws, { t: 'auth', ok: 0, err: e });
      if (pw.length < 6 || pw.length > 64) return tx(ws, { t: 'auth', ok: 0, err: 'Password 6+ character venam' });
      db.users[n.toLowerCase()] = { name: n, pw: mk(pw), cash: 2500, bank: 5000, dress: 0, gun: 0, lic: 0, home: 0, car: 0, pin: null, log: [], inbox: [], created: now };
      save();
    }
    const u = byName(n);
    if (!u || !ck(pw, u.pw)) return tx(ws, { t: 'auth', ok: 0, err: 'Name / password thettaanu' });
    clients.forEach(w => { if (w.u === u) { w.u = null; w.close(); clients.delete(w.id); } });
    ws.u = u; clients.set(ws.id, ws);
    return tx(ws, { t: 'auth', ok: 1, id: ws.id, state: state(u) });
  }
  const u = ws.u; if (!u) return;
  const now = Date.now();
  switch (m.t) {
    case 'pos': ws.pos = { x: clamp(m.x, -200, 200), z: clamp(m.z, -200, 200), r: clamp(m.r, -7, 7), vc: m.vc ? 1 : 0 }; break;
    case 'chat': {
      if (now - (ws.lastChat || 0) < 700) return; ws.lastChat = now;
      let s = String(m.m || '').slice(0, 80).trim(); if (!s) return;
      s = s.replace(BAD, '***');
      const o = JSON.stringify({ t: 'chat', n: u.name, m: s }); clients.forEach(w => w.readyState === 1 && w.send(o)); break;
    }
    case 'dm': {
      if (now - (ws.lastDm || 0) < 1000) return; ws.lastDm = now;
      const to = byName(m.to), s = String(m.text || '').slice(0, 120).trim().replace(BAD, '***');
      if (!to || !s) return tx(ws, { t: 'toast', m: 'Aale kandilla' });
      to.inbox.unshift({ from: u.name, text: s, at: now }); to.inbox.length = Math.min(to.inbox.length, 50); save();
      const w = online(to); if (w) tx(w, { t: 'dm', from: u.name, text: s });
      tx(ws, { t: 'toast', m: 'Ayachu ✔' }); break;
    }
    case 'inbox': tx(ws, { t: 'inbox', list: u.inbox.slice(0, 20) }); break;
    case 'buy': { const e = buy(u, m.i); save(); tx(ws, { t: 'state', state: state(u) }); tx(ws, { t: 'toast', m: e || 'Vangi ✔' }); break; }
    case 'atmclose': ws.atmOk = 0; break;
    case 'pin': {
      if (now < (u.lockUntil || 0)) return tx(ws, { t: 'atm', ok: 0, err: 'ATM lock aanu, kurach neram kazhinju nokku' });
      const pin = String(m.pin || ''); if (!/^\d{4}$/.test(pin)) return tx(ws, { t: 'atm', ok: 0, err: '4 digit venam' });
      if (!u.pin) { u.pin = mk(pin); save(); }
      else if (!ck(pin, u.pin)) { u.fails = (u.fails || 0) + 1; if (u.fails >= 3) { u.lockUntil = now + 60000; u.fails = 0; } return tx(ws, { t: 'atm', ok: 0, err: 'PIN thettaanu' }); }
      u.fails = 0; ws.atmOk = now + 120000; tx(ws, { t: 'state', state: state(u) }); tx(ws, { t: 'atm', ok: 1 }); break;
    }
    case 'dep': case 'wd': case 'send': {
      if (!(ws.atmOk > now)) return tx(ws, { t: 'toast', m: 'Aadyam PIN kodukku' });
      const a = Math.floor(+m.a); if (!Number.isFinite(a) || a <= 0) return tx(ws, { t: 'toast', m: 'Amount sheriyalla' });
      if (m.t === 'dep') { if (a > u.cash) return tx(ws, { t: 'toast', m: 'Cash illa' }); u.cash -= a; u.bank += a; }
      else if (m.t === 'wd') { if (a > u.bank) return tx(ws, { t: 'toast', m: 'Bank-il illa' }); u.bank -= a; u.cash += a; }
      else {
        const to = byName(m.to);
        if (!to || to === u) return tx(ws, { t: 'toast', m: 'Aale kandilla' });
        if (a > 10000) return tx(ws, { t: 'toast', m: 'Oru thavana max ₹10000' });
        if (a > u.bank) return tx(ws, { t: 'toast', m: 'Bank-il illa' });
        const day = new Date().toISOString().slice(0, 10); if (!u.day || u.day.d !== day) u.day = { d: day, total: 0 };
        const lim = now - u.created < 86400000 ? 5000 : 50000;
        if (u.day.total + a > lim) return tx(ws, { t: 'toast', m: 'Innathe send limit ₹' + lim });
        u.day.total += a; u.bank -= a; to.bank += a;
        u.log.unshift(to.name + ': -₹' + a); to.log.unshift(u.name + ': +₹' + a);
        u.log.length = Math.min(u.log.length, 30); to.log.length = Math.min(to.log.length, 30);
        const w = online(to); if (w) { tx(w, { t: 'state', state: state(to) }); tx(w, { t: 'toast', m: u.name + ' ₹' + a + ' ayachu' }); }
      }
      save(); tx(ws, { t: 'state', state: state(u) }); tx(ws, { t: 'toast', m: 'Sheri ✔' }); break;
    }
    case 'sig': { const w = clients.get(String(m.to)); if (w && w !== ws) tx(w, { t: 'sig', from: ws.id, d: m.d }); break; }
  }
}

setInterval(() => {
  if (!clients.size) return;
  const p = []; clients.forEach(w => { if (w.pos && w.u) p.push({ id: w.id, n: w.u.name, d: w.u.dress, ...w.pos }); });
  const s = JSON.stringify({ t: 'snap', p }); clients.forEach(w => w.readyState === 1 && w.send(s));
}, 100);

server.listen(PORT, () => console.log('Malabar Life server: http://localhost:' + PORT));
