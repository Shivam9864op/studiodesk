import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MemoryStore, PostgresStore } from './store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(root, '..');
const dist = path.join(appRoot, 'dist');
const uploads = path.join(appRoot, 'uploads');
const port = Number(process.env.PORT || 8789);
const limit = Number(process.env.BODY_LIMIT || 8_500_000);
const privateMode = process.env.PRIVATE_MODE === 'true';
const counters = new Map();

await fs.mkdir(uploads, { recursive: true });
let store = new MemoryStore();
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
    store = new PostgresStore(pool);
    await store.init();
  } catch (error) {
    console.warn(`Database unavailable; using memory demo store: ${error.message}`);
    store = new MemoryStore();
  }
}

function headers(extra = {}) {
  return { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'no-referrer', ...extra };
}
function send(res, status, body, extra) { res.writeHead(status, headers(extra)); res.end(JSON.stringify(body)); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => part.trim().split('='))); }
function role(req) { return parseCookies(req).sd_role || 'owner'; }
function allowed(req, needed = 'owner') { if (!privateMode) return true; const rank = { client: 1, editor: 2, owner: 3 }; return (rank[role(req)] || 0) >= (rank[needed] || 3); }
async function body(req) {
  let text = ''; for await (const chunk of req) { text += chunk; if (text.length > limit) throw new Error('Request body too large.'); }
  return text ? JSON.parse(text) : {};
}
function rateLimited(req) {
  const ip = req.socket.remoteAddress || 'unknown'; const now = Date.now(); const current = counters.get(ip) || { started: now, count: 0 };
  if (now - current.started > 60_000) { current.started = now; current.count = 0; }
  current.count += 1; counters.set(ip, current); return current.count > 180;
}
function csvToRows(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const columns = lines[0].split(',').map((x) => x.trim());
  return lines.slice(1).map((line) => { const values = line.split(','); return Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? ''])); });
}
async function staticFile(res, pathname) {
  const safe = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (safe.includes('..')) return send(res, 400, { error: 'Invalid path.' });
  const file = path.join(dist, safe);
  try { const data = await fs.readFile(file); const type = safe.endsWith('.js') ? 'text/javascript' : safe.endsWith('.css') ? 'text/css' : safe.endsWith('.svg') ? 'image/svg+xml' : 'text/html'; res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff' }); res.end(data); }
  catch { try { const data = await fs.readFile(path.join(dist, 'index.html')); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(data); } catch { send(res, 503, { error: 'StudioDesk is not built yet.' }); } }
}

const server = http.createServer(async (req, res) => {
  try {
    if (rateLimited(req)) return send(res, 429, { error: 'Rate limit reached. Try again shortly.' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'studiodesk', demo: !process.env.DATABASE_URL });
      if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { role: role(req), privateMode });
      if (url.pathname === '/api/session' && req.method === 'POST') { const input = await body(req); const selected = ['owner', 'editor', 'client'].includes(input.role) ? input.role : 'client'; res.writeHead(200, headers({ 'set-cookie': `sd_role=${selected}; Path=/; HttpOnly; SameSite=Lax` })); return res.end(JSON.stringify({ role: selected })); }
      if (url.pathname === '/api/snapshot' && req.method === 'GET') return send(res, 200, await store.snapshot());
      const factMatch = url.pathname.match(/^\/api\/facts\/([a-zA-Z]+)$/);
      if (factMatch && req.method === 'PATCH') { if (!allowed(req, 'editor')) return send(res, 403, { error: 'Editor access required.' }); const input = await body(req); return send(res, 200, await store.updateFact(factMatch[1], input.value, input.actor || role(req))); }
      const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
      if (assetMatch && req.method === 'PATCH') { if (!allowed(req, 'editor')) return send(res, 403, { error: 'Editor access required.' }); const input = await body(req); return send(res, 200, await store.revise(assetMatch[1], input.body, input.actor || role(req))); }
      const approveMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/approve$/);
      if (approveMatch && req.method === 'POST') { if (!allowed(req, 'client')) return send(res, 403, { error: 'Reviewer access required.' }); const input = await body(req); return send(res, 200, await store.approve(approveMatch[1], input.actor || role(req))); }
      if (url.pathname === '/api/reports/import' && req.method === 'POST') { const input = await body(req); const rows = Array.isArray(input.rows) ? input.rows : csvToRows(input.csv); return send(res, 200, await store.report(rows)); }
      if (url.pathname === '/api/uploads' && req.method === 'POST') {
        if (!allowed(req, 'editor')) return send(res, 403, { error: 'Editor access required.' });
        const input = await body(req);
        const mime = String(input.mime || '');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return send(res, 415, { error: 'Only PNG, JPEG and WebP uploads are supported.' });
        const raw = String(input.data || '').replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        if (!buffer.length || buffer.length > 6_000_000) return send(res, 413, { error: 'Image must be smaller than 6 MB.' });
        const ext = mime.split('/')[1].replace('jpeg', 'jpg');
        const file = `${crypto.randomUUID()}.${ext}`;
        await fs.writeFile(path.join(uploads, file), buffer, { flag: 'wx', mode: 0o640 });
        return send(res, 201, { path: `/uploads/${file}`, size: buffer.length });
      }
      if (url.pathname === '/api/handoff' && req.method === 'GET') { const snapshot = await store.snapshot(); const { campaign } = snapshot; const outstanding = campaign.assets.filter((asset) => asset.status !== 'approved'); const markdown = [`# ${campaign.name}`, '', 'Personal demo · synthetic campaign', '', `Updated: ${campaign.updatedAt}`, '', '## Outstanding work', ... (outstanding.length ? outstanding.map((asset) => `- ${asset.type} (${asset.channel}) — ${asset.status}`) : ['- None']), '', '## Current facts', ...Object.values(campaign.facts).map((fact) => `- ${fact.label}: ${fact.value}`)].join('\n'); return send(res, 200, { markdown, json: snapshot }); }
      return send(res, 404, { error: 'API route not found.' });
    }
    if (url.pathname.startsWith('/uploads/')) { const file = path.join(uploads, path.basename(url.pathname)); try { const data = await fs.readFile(file); res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=0' }); return res.end(data); } catch { return send(res, 404, { error: 'Upload not found.' }); } }
    return staticFile(res, url.pathname);
  } catch (error) { console.error(error); return send(res, 400, { error: error.message || 'Request failed.' }); }
});

server.listen(port, '0.0.0.0', () => console.log(`StudioDesk listening on http://127.0.0.1:${port}`));
