// Malabar Life - online layer: replaces the offline demo logic with the server.
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let ws, myId = null, vcOn = false, ms = null, pcs = {}, auds = {}, iceQueue = {}, inbox = [], atmAuth = false;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
function publishVCState() { if (P && P.position) send({ t: 'pos', x: P.position.x, z: P.position.z, r: P.rotation.y, vc: vcOn ? 1 : 0 }); }
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const CAT = [['👕 Dark hoodie', 300], ['👕 Plain white shirt', 150], ['👕 Black shirt + mundu', 400], ['👕 Check shirt', 250], ['👕 Kasavu cream', 600], ['👕 Hijab navy', 500], ['🏠 Apartment', 20000], ['🛵 Bike', 8000], ['🔫 Street Pistol (licence venam)', 4000], ['📄 Weapon Licence', 5000]];
const recolor = () => { const c = dresses[S.dress] ? dresses[S.dress][1] : 0x888888; [P.userData.body, P.userData.a1, P.userData.a2].forEach(o => o.material.color.setHex(c)); };
const visible = id => $('#' + id).style.display === 'block';

// ----- login overlay -----
const ov = document.createElement('div');
ov.style.cssText = 'position:fixed;inset:0;z-index:70;background:#120d09f2;display:flex;align-items:center;justify-content:center';
const st = 'width:100%;padding:9px;margin:5px 0;border-radius:10px;border:1px solid #e8a64a66;background:#0008;color:#f4e6d0;user-select:text;touch-action:auto';
ov.innerHTML = `<div class="b" style="width:min(330px,80vw);padding:16px"><div style="font:700 22px Georgia,serif;color:#e8a64a;margin-bottom:6px">MALABAR LIFE</div>
<input id="an" placeholder="Unique name" maxlength="14" style="${st}"><input id="ap" type="password" placeholder="Password (6+)" style="${st}">
<div id="ae" style="color:#f88;font-size:12px;min-height:16px"></div><button class="b" id="al">Login</button> <button class="b" id="ar">Register</button></div>`;
document.body.appendChild(ov);
function connect(cb) { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); ws.onopen = cb; ws.onmessage = onmsg; ws.onclose = () => { if (myId) toast('Connection poyi, refresh cheyyuka'); }; }
function auth(t) {
  const n = $('#an').value.trim(), pw = $('#ap').value;
  if (t === 'reg' && !confirm('"' + n + '" lock aakkano? Pinne maattan pattilla.')) return;
  const go = () => send({ t, name: n, pw });
  if (ws && ws.readyState === 1) go(); else connect(go);
}
$('#al').onclick = () => auth('login'); $('#ar').onclick = () => auth('reg');

function apply(s) { Object.assign(S, s); hud(); recolor(); if (S.gun) $('#fire').style.display = 'block'; if (visible('shop')) openShop(); if (visible('atm') && atmAuth) atmMenu(); }
function onmsg(e) {
  const m = JSON.parse(e.data);
  switch (m.t) {
    case 'auth': if (!m.ok) { $('#ae').textContent = m.err; break; } myId = m.id; apply(m.state); ov.remove(); break;
    case 'state': apply(m.state); break;
    case 'toast': toast(m.m); break;
    case 'atm': if (m.ok) { atmAuth = true; atmMenu(); } else toast(m.err); break;
    case 'chat': say(m.n, m.m); break;
    case 'dm': toast('💬 ' + m.from + ': ' + m.text); break;
    case 'inbox': inbox = m.list; showInbox(); break;
    case 'snap': snap(m.p); break;
    case 'sig': sig(m); break;
  }
}
// ----- players -----
function snap(list) {
  const seen = new Set();
  list.forEach(p => {
    if (p.id === myId) return; seen.add(p.id);
    let e = peersM[p.id];
    if (!e) { const g = human(dc(p.d)); g.add(tag(p.n)); e = peersM[p.id] = { g, n: p.n, mt: 0 }; g.position.set(p.x, 0, p.z); }
    e.tx = p.x; e.tz = p.z; e.r = p.r; e.vc = p.vc;
    if (e.d !== p.d) { e.d = p.d; const u = e.g.userData; [u.body, u.a1, u.a2].forEach(o => o.material.color.setHex(dc(p.d))); }
  });
  Object.keys(peersM).forEach(k => { if (!seen.has(k)) { sc.remove(peersM[k].g); delete peersM[k]; closePC(k); } });
  bots.forEach(b => b.visible = false);
  if (vcOn) vcSync();
}
window._room = { presence: o => send({ t: 'pos', x: o.x, z: o.z, r: o.r, vc: vcOn ? 1 : 0 }) };
// ----- shop / ATM (server decides everything) -----
window.openShop = function () {
  $('#shopc').innerHTML = `<div>Cash ₹${S.cash}</div>` + CAT.map((x, i) => `<button class="b" data-i="${i}">${x[0]} — ₹${x[1]}</button>`).join('');
  $('#shopc').querySelectorAll('[data-i]').forEach(b => b.onclick = () => send({ t: 'buy', i: +b.dataset.i }));
  openW('shop');
};
window.openATM = function () {
  atmAuth = false; send({ t: 'atmclose' });
  const set = !S.hasPin;
  $('#atmc').innerHTML = (set ? '4-digit PIN set cheyyuka' : 'PIN kodukku') + `<input id="pi" type="password" inputmode="numeric" maxlength="4"><button class="b" id="pg">${set ? 'Set PIN' : 'Open'}</button>`;
  $('#pg').onclick = () => { const v = $('#pi').value; if (!/^\d{4}$/.test(v)) return toast('4 digit venam'); send({ t: 'pin', pin: v }); };
  openW('atm');
};
window.atmMenu = function () {
  $('#atmc').innerHTML = `Cash ₹${S.cash} · Bank ₹${S.bank}<br><input id="am" type="number" placeholder="Amount"><button class="b" id="dp">Deposit</button><button class="b" id="wd">Withdraw</button><br><input id="to" placeholder="Player unique name"><button class="b" id="sn">Send</button><div style="font-size:12px">${(S.log || []).map(esc).join('<br>')}</div>`;
  const a = () => Math.floor(+$('#am').value) || 0;
  $('#dp').onclick = () => send({ t: 'dep', a: a() }); $('#wd').onclick = () => send({ t: 'wd', a: a() });
  $('#sn').onclick = () => { const t = $('#to').value.trim(), x = a(); if (!t || x <= 0) return toast('Name / amount'); if (confirm(t + '-inu ₹' + x + ' ayakkano?')) send({ t: 'send', to: t, a: x }); };
  openW('atm');
};
// ----- phone / chat / gun -----
$('#phoneb').onclick = () => {
  $('#phc').innerHTML = `<button class="b" id="p1">💬 Messages</button><button class="b" id="p2">🗺 Map</button><button class="b" id="p3">🏦 Bank</button><div id="pb"></div>`;
  $('#p1').onclick = () => send({ t: 'inbox' }); $('#p2').onclick = () => openMap();
  $('#p3').onclick = () => $('#pb').textContent = `Cash ₹${S.cash}, Bank ₹${S.bank}`; openW('phone');
};
function showInbox() {
  $('#pb').innerHTML = `<input id="dt" placeholder="Aarkku? (unique name)"><input id="dm" placeholder="Message" maxlength="120"><button class="b" id="ds">Send</button>` + inbox.slice(0, 8).map(x => `<div><b>${esc(x.from)}</b>: ${esc(x.text)}</div>`).join('');
  $('#ds').onclick = () => { send({ t: 'dm', to: $('#dt').value, text: $('#dm').value }); $('#dm').value = ''; };
}
$('#cs').onclick = () => { const v = $('#ci').value.trim(); if (!v) return; send({ t: 'chat', m: v }); $('#ci').value = ''; closeAll(); };
$('#fire').onclick = () => { fl = .08; toast('💥'); };
// ----- proximity voice chat (WebRTC, server only relays signals) -----
const vb = document.createElement('button'); vb.className = 'b'; vb.textContent = '🎙 VC: off'; $('#panel').insertBefore(vb, $('#reset'));
vb.onclick = async () => {
  if (vcOn) {
    vcOn = false;
    publishVCState();
    if (ms) { ms.getTracks().forEach(t => t.stop()); ms = null; }
    Object.keys(pcs).forEach(closePC);
    Object.keys(auds).forEach(closePC);
    vb.textContent = '🎙 VC: off';
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    toast('VC-kk HTTPS + microphone permission venam'); return;
  }
  try {
    ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    vcOn = true; vb.textContent = '🎙 VC: on'; publishVCState(); vcSync();
  } catch (e) { vcOn = false; ms = null; toast('Microphone permission allow cheyyuka'); }
};
function mkpc(id, init) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }); pc.t = Date.now(); pcs[id] = pc; iceQueue[id] = iceQueue[id] || [];
  ms.getTracks().forEach(t => pc.addTrack(t, ms));
  pc.onicecandidate = e => e.candidate && send({ t: 'sig', to: id, d: { c: e.candidate } });
  pc.ontrack = e => {
    let a = auds[id]; if (!a) { a = new Audio(); a.autoplay = true; a.playsInline = true; auds[id] = a; }
    if (e.streams && e.streams[0]) a.srcObject = e.streams[0];
    a.play().catch(() => toast('Voice audio play cheyyan screen tap cheyyuka'));
  };
  pc.onconnectionstatechange = () => { if (['failed','closed','disconnected'].includes(pc.connectionState)) { if (pc.connectionState !== 'disconnected' || Date.now() - pc.t > 10000) closePC(id); } };
  if (init) pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => send({ t: 'sig', to: id, d: { s: pc.localDescription } })).catch(() => closePC(id));
  return pc;
}
function vcSync() {
  if (!vcOn || !ms) return;
  Object.keys(peersM).forEach(id => {
    const e = peersM[id];
    if (e.vc && !pcs[id] && Number(myId) < Number(id)) mkpc(id, true);
    if (!e.vc && pcs[id]) closePC(id);
  });
}
async function sig(m) {
  if (!vcOn || !m || !m.d || !m.from) return;
  const id = String(m.from); let pc = pcs[id];
  try {
    if (m.d.s) {
      if (!pc) pc = mkpc(id, false);
      await pc.setRemoteDescription(m.d.s);
      for (const c of (iceQueue[id] || [])) await pc.addIceCandidate(c);
      iceQueue[id] = [];
      if (m.d.s.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); send({ t: 'sig', to: id, d: { s: pc.localDescription } }); }
    } else if (m.d.c) {
      if (pc && pc.remoteDescription) await pc.addIceCandidate(m.d.c);
      else { iceQueue[id] = iceQueue[id] || []; if (iceQueue[id].length < 64) iceQueue[id].push(m.d.c); }
    }
  } catch (e) { /* connection may fail on restrictive NAT; TURN relay may be needed */ }
}
function closePC(id) {
  if (pcs[id]) { pcs[id].ontrack = null; pcs[id].close(); delete pcs[id]; }
  if (auds[id]) { auds[id].pause(); auds[id].srcObject = null; delete auds[id]; }
  delete iceQueue[id];
}
setInterval(() => {
  Object.keys(auds).forEach(id => { const e = peersM[id]; if (!e) return; const d = Math.hypot(e.g.position.x - P.position.x, e.g.position.z - P.position.z); auds[id].volume = Math.max(0, Math.min(1, 1 - d / 35)); });
  Object.keys(pcs).forEach(id => { const pc = pcs[id]; if (pc.connectionState !== 'connected' && Date.now() - pc.t > 10000) closePC(id); });
}, 300);
connect();
})();
