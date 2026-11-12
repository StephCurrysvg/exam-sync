// Сервер синхронизации для «Онлайн-экзамена» (Node 18+, без установки пакетов)
// Запуск: node server.js   →  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000, FILE = path.join(__dirname, 'data.json');
const COLS = ['users', 'tests', 'rooms', 'attempts', 'writings', 'queue', 'grades'];
const keyOf = x => x.id || [x.roomId, x.userId, x.testId || x.part || ''].join('|');
let rev = 0; const db = Object.fromEntries(COLS.map(c => [c, new Map()]));
try { const s = JSON.parse(fs.readFileSync(FILE, 'utf8')); rev = s.rev || 0; COLS.forEach(c => (s.db[c] || []).forEach(([k, r]) => db[c].set(k, r))); } catch {}
const state = () => ({ rev, db: Object.fromEntries(COLS.map(c => [c, [...db[c].values()]])) });
const save = () => fs.writeFileSync(FILE, JSON.stringify({ rev, db: Object.fromEntries(COLS.map(c => [c, [...db[c].entries()]])) }, null, 2) + '\n');
const clients = new Set();
setInterval(() => clients.forEach(c => c.write(': ping\n\n')), 25000);

http.createServer(async (req, res) => {
  const u = req.url.split('?')[0];
  const json = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && u === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
  if (req.method === 'GET' && u === '/api/state') return json(state());
  if (req.method === 'GET' && u === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: ' + JSON.stringify(state()) + '\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (req.method === 'POST' && u === '/api/sync') {
    let s = ''; for await (const c of req) s += c;
    let b; try { b = JSON.parse(s); } catch { return json({ error: 'bad json' }, 400); }
    const ch = (b && b.changes) || {};
    COLS.forEach(c => { const x = ch[c]; if (!x) return;
      (x.del || []).forEach(k => db[c].delete(k));
      (x.up || []).forEach(r => { if (r && typeof r === 'object') db[c].set(keyOf(r), r); }); });
    rev++; save();
    const d = 'data: ' + JSON.stringify(state()) + '\n\n'; clients.forEach(c => c.write(d));
    return json({ ok: true, rev });
  }
  json({ error: 'not found' }, 404);
}).listen(PORT, () => console.log('Запущено: http://localhost:' + PORT));
