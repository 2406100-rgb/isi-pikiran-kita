import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'isipikiran.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS thoughts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'Ide',
    mood       TEXT NOT NULL DEFAULT 'Biasa',
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_thoughts_user ON thoughts(user_id);
  CREATE INDEX IF NOT EXISTS idx_thoughts_created ON thoughts(created_at);
`);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Data awal (hanya jika database masih kosong)
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const now = new Date().toISOString();
  const addUser = db.prepare(
    'INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)'
  );
  const aku = addUser.run('aku', 'Aku', hashPassword('aku123'), now).lastInsertRowid;
  const kamu = addUser.run('kamu', 'Kamu', hashPassword('kamu123'), now).lastInsertRowid;

  const addThought = db.prepare(
    `INSERT INTO thoughts (user_id, title, content, category, mood, is_private, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const day = 24 * 3600 * 1000;
  const ago = (d) => new Date(Date.now() - d * day).toISOString();
  addThought.run(aku, 'Ide liburan akhir tahun', 'Pengen ke tempat yang tenang, ada pantai dan sunset. Mungkin Pangandaran atau Karimunjawa.', 'Rencana', 'Semangat', 0, ago(1), ago(1));
  addThought.run(kamu, 'Hal kecil yang bikin bersyukur', 'Hari ini kopi pagi rasanya pas banget dan hujan turun pas aku sudah di rumah.', 'Syukur', 'Senang', 0, ago(2), ago(2));
  addThought.run(aku, 'Catatan pribadi', 'Ini hanya bisa dilihat oleh pemiliknya.', 'Perasaan', 'Biasa', 1, ago(3), ago(3));
  addThought.run(kamu, 'Kenangan pertama kali ngobrol', 'Awalnya canggung, tapi ternyata obrolannya nyambung sampai larut malam.', 'Kenangan', 'Senang', 0, ago(8), ago(8));
}
