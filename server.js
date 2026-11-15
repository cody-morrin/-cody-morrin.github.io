// Wordle with lying hints: a static site, no login, no data kept on the server. Every file is
// read once at start (the container is rebuilt to change them) and served from memory. / is the daily word,
// /random (or /random.html, as on a plain static host) a new word on every load; both are the same page, which tells
// them apart by its path.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const DIR = path.join(import.meta.dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};
const files = new Map();
for (const name of fs.readdirSync(DIR, { withFileTypes: true }).filter((f) => f.isFile() && !f.name.startsWith('_')).map((f) => f.name)) {
  const body = fs.readFileSync(path.join(DIR, name));
  const etag = `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 16)}"`;
  files.set(`/${name}`, { body, etag, type: TYPES[path.extname(name)] || 'application/octet-stream' });
}
// the page asks for its files with their version (?v=), so a phone that keeps them for hours (Cloudflare tells browsers
// to keep .js and .css for 4 h) still gets the new ones the moment the page changes; the page itself is never kept
{
  const page = files.get('/index.html'), v = (name) => files.get(name)?.etag.slice(1, 9);
  const body = Buffer.from(page.body.toString('utf8').replace(/(["'])([\w.-]+\.(?:js|css|svg|webmanifest))\1/g, (m, q, name) => (v(`/${name}`) ? `${q}${name}?v=${v(`/${name}`)}${q}` : m)));
  files.set('/index.html', { ...page, body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 16)}"` });
}
const PAGES = new Set(['/', '/random', '/random.html', '/daily']);
const AWAY = { '/random/': '/random', '/daily/': '/', '/index.html': '/' }; // (the page's links are relative: it can't sit one folder down)
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-cache', // always asks (cheaply, by ETag), so a new version shows on the next load
};

const server = http.createServer((req, res) => {
  const send = (status, body, type, extra = {}) => {
    res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', 'text/plain', { Allow: 'GET, HEAD' });
  let p;
  try { p = new URL(req.url, 'http://x').pathname; } catch { return send(400, 'Bad request', 'text/plain'); }
  if (p === '/healthz') return send(200, 'ok', 'text/plain', { 'Cache-Control': 'no-store' });
  if (AWAY[p]) return send(301, 'Moved', 'text/plain', { Location: AWAY[p] });
  const f = files.get(PAGES.has(p) ? '/index.html' : p);
  if (!f || p === '/index.html') return send(404, 'Not found', 'text/plain');
  const inm = req.headers['if-none-match'];
  if (inm && (inm.trim() === '*' || inm.split(',').some((t) => t.trim().replace(/^W\//, '') === f.etag))) { res.writeHead(304, { ...HEADERS, ETag: f.etag }); return res.end(); }
  send(200, f.body, f.type, { ETag: f.etag });
});
server.listen(PORT, () => console.log(`wordle listening on :${PORT}`));
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => server.close(() => process.exit(0)));
