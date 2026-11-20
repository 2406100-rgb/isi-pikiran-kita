# Isi Pikiran Kita

Ruang catatan bersama untuk ide, perasaan, rencana, dan kenangan. Tampilannya
mengikuti gaya Gudangku (login biru, kartu putih), tetapi isinya adalah catatan
pikiran, bukan stok gudang.

## Fitur

- Login dengan sesi aman (cookie HttpOnly), password di-hash dengan scrypt
- Tulis, ubah, hapus catatan (hanya pemilik yang bisa mengubah/menghapus)
- Catatan bisa **dibagikan** (terlihat semua pengguna) atau **pribadi**
- Kategori, suasana hati, pencarian, dan filter
- Database SQLite (satu file: `data/isipikiran.db`)
- **Tanpa dependensi npm**: tidak perlu `npm install`

## Cara menjalankan

Syarat: **Node.js 22.13 atau lebih baru** (cek dengan `node -v`).
SQLite sudah bawaan Node, jadi tidak ada paket tambahan.

```bash
cd isi-pikiran-kita
npm start
```

Lalu buka **http://localhost:3000** di browser. Jangan membuka `index.html`
lewat Live Server, karena aplikasi ini butuh server dan database.

Akun demo (dibuat otomatis saat database pertama kali dibuat):

| Username | Password |
| -------- | -------- |
| aku      | aku123   |
| kamu     | kamu123  |

Untuk mengganti port: `PORT=8080 npm start` (Windows PowerShell:
`$env:PORT=8080; npm start`).

## Struktur

```
isi-pikiran-kita/
├── server.js        # server HTTP + API + file statis
├── db.js            # koneksi SQLite, tabel, data awal
├── package.json
├── public/          # tampilan (HTML, CSS, JS)
└── data/            # dibuat otomatis, berisi file database
```

## Database

| Tabel      | Isi                                                          |
| ---------- | ------------------------------------------------------------ |
| `users`    | id, username, display_name, password_hash, created_at        |
| `sessions` | token_hash, user_id, expires_at                              |
| `thoughts` | id, user_id, title, content, category, mood, is_private, ... |

Untuk mengulang dari awal, hentikan server lalu hapus folder `data/`.

## Sebelum dipakai sungguhan

Ganti password akun demo, atau hapus data awal di `db.js` dan tambahkan
pengguna Anda sendiri. Jika dipasang di internet, gunakan HTTPS dan tambahkan
atribut `Secure` pada cookie di `server.js`.
