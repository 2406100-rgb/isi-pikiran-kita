import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, verifyPassword } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const SESSION_MS = 7 * 24 * 3600 * 1000;

const CATEGORIES = ['Ide', 'Perasaan', 'Rencana', 'Kenangan', 'Syukur'];
const MOODS = ['Senang', 'Semangat', 'Biasa', 'Sedih', 'Marah'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// ---------- helper ----------
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100 * 1024) {
        reject(Object.assign(new Error('Data terlalu besar'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Format data tidak valid'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.display_name
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), Date.now()) || null
  );
}

// Batasi percobaan login (per IP)
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < 5 * 60 * 1000);
  attempts.set(ip, rec);
  return rec.length >= 10;
}

function cleanText(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validateThought(body) {
  const title = cleanText(body.title, 120);
  const content = cleanText(body.content, 5000);
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  const mood = MOODS.includes(body.mood) ? body.mood : null;
  if (!title) return { error: 'Judul wajib diisi' };
  if (!content) return { error: 'Isi pikiran wajib diisi' };
  if (!category) return { error: 'Kategori tidak valid' };
  if (!mood) return { error: 'Suasana hati tidak valid' };
  return { value: { title, content, category, mood, is_private: body.is_private ? 1 : 0 } };
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  if (route === '/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'x';
    if (tooManyAttempts(ip)) {
      return json(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
    }
    const body = await readJson(req);
    const username = cleanText(body.username, 50).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      attempts.get(ip)?.push(Date.now()) ?? attempts.set(ip, [Date.now()]);
      return json(res, 401, { error: 'Username atau password salah' });
    }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      sha256(token),
      user.id,
      Date.now() + SESSION_MS
    );
    return json(
      res,
      200,
      { user: { id: user.id, username: user.username, display_name: user.display_name } },
      { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}` }
    );
  }

  if (route === '/logout' && method === 'POST') {
    const token = parseCookies(req).sid;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  const user = currentUser(req);
  if (route === '/me' && method === 'GET') {
    return user ? json(res, 200, { user }) : json(res, 401, { error: 'Belum masuk' });
  }
  if (!user) return json(res, 401, { error: 'Silakan masuk terlebih dahulu' });

  if (route === '/meta' && method === 'GET') {
    return json(res, 200, { categories: CATEGORIES, moods: MOODS });
  }

  if (route === '/stats' && method === 'GET') {
    const one = (sql, ...p) => db.prepare(sql).get(...p).n;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    return json(res, 200, {
      total: one('SELECT COUNT(*) AS n FROM thoughts WHERE is_private = 0 OR user_id = ?', user.id),
      mine: one('SELECT COUNT(*) AS n FROM thoughts WHERE user_id = ?', user.id),
      private: one('SELECT COUNT(*) AS n FROM thoughts WHERE user_id = ? AND is_private = 1', user.id),
      week: one(
        'SELECT COUNT(*) AS n FROM thoughts WHERE (is_private = 0 OR user_id = ?) AND created_at >= ?',
        user.id,
        weekAgo
      ),
    });
  }

  if (route === '/thoughts' && method === 'GET') {
    const q = cleanText(url.searchParams.get('q') || '', 100);
    const category = url.searchParams.get('category') || '';
    const scope = url.searchParams.get('scope') || 'all';
    const where = ['(t.is_private = 0 OR t.user_id = ?)'];
    const params = [user.id];
    if (scope === 'mine') {
      where.push('t.user_id = ?');
      params.push(user.id);
    }
    if (CATEGORIES.includes(category)) {
      where.push('t.category = ?');
      params.push(category);
    }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      where.push("(t.title LIKE ? ESCAPE '\\' OR t.content LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    const rows = db
      .prepare(
        `SELECT t.id, t.user_id, t.title, t.content, t.category, t.mood, t.is_private,
                t.created_at, t.updated_at, u.display_name AS author
         FROM thoughts t JOIN users u ON u.id = t.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY t.created_at DESC LIMIT 200`
      )
      .all(...params);
    return json(res, 200, {
      thoughts: rows.map((r) => ({ ...r, is_private: !!r.is_private, mine: r.user_id === user.id })),
    });
  }

  if (route === '/thoughts' && method === 'POST') {
    const { value, error } = validateThought(await readJson(req));
    if (error) return json(res, 400, { error });
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO thoughts (user_id, title, content, category, mood, is_private, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, value.title, value.content, value.category, value.mood, value.is_private, now, now);
    return json(res, 201, { id: Number(info.lastInsertRowid) });
  }

  const m = route.match(/^\/thoughts\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const row = db.prepare('SELECT * FROM thoughts WHERE id = ?').get(id);
    // Pikiran pribadi milik orang lain dianggap tidak ada
    if (!row || (row.is_private && row.user_id !== user.id)) {
      return json(res, 404, { error: 'Catatan tidak ditemukan' });
    }
    if (row.user_id !== user.id) {
      return json(res, 403, { error: 'Hanya pemilik yang bisa mengubah catatan ini' });
    }
    if (method === 'PUT') {
      const { value, error } = validateThought(await readJson(req));
      if (error) return json(res, 400, { error });
      db.prepare(
        `UPDATE thoughts SET title=?, content=?, category=?, mood=?, is_private=?, updated_at=? WHERE id=?`
      ).run(value.title, value.content, value.category, value.mood, value.is_private, new Date().toISOString(), id);
      return json(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      db.prepare('DELETE FROM thoughts WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: 'Endpoint tidak ditemukan' });
}

// ---------- file statis ----------
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Metode tidak diizinkan', { Allow: 'GET, HEAD' });
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Tidak ditemukan');
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (e.status) return json(res, e.status, { error: e.message });
    console.error(e);
    return json(res, 500, { error: 'Terjadi kesalahan pada server' });
  }
});

server.listen(PORT, () => {
  console.log(`Isi Pikiran Kita berjalan di http://localhost:${PORT}`);
});
