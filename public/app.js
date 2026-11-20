/* ===== Isi Pikiran Kita: app.js =====
   Data disimpan di localStorage supaya tampilan bisa langsung dicoba.
   Untuk menyambungkan ke backend (server.js + db.js), ganti isi objek `api` di bawah. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const CATEGORIES = ["Rencana", "Syukur", "Perasaan", "Ide", "Lainnya"];
const MOODS = [
  { e: "😊", n: "Senang" }, { e: "😍", n: "Semangat" }, { e: "😌", n: "Tenang" },
  { e: "🥺", n: "Sedih" }, { e: "😴", n: "Lelah" }, { e: "😤", n: "Kesal" },
];

/* ---------- Lapisan data (ganti dengan fetch ke server bila perlu) ---------- */
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const api = {
  users: () => read("ipk_users", []),
  saveUsers: (u) => write("ipk_users", u),
  thoughts: () => read("ipk_thoughts", []),
  saveThoughts: (t) => write("ipk_thoughts", t),
  session: () => read("ipk_session", null),
  saveSession: (s) => write("ipk_session", s),
};

function seed() {
  if (api.users().length) return;
  api.saveUsers([
    { username: "dina", password: "dina123" },
    { username: "raka", password: "raka123" },
  ]);
  const day = 864e5, now = Date.now();
  api.saveThoughts([
    { id: uid(), title: "Ide liburan akhir tahun", content: "Pengen ke tempat yang tenang, ada pantai dan sunset. Mungkin Pangandaran atau Karimunjawa.", category: "Rencana", mood: "😍", private: false, author: "dina", createdAt: now - day },
    { id: uid(), title: "Hari ini bersyukur", content: "Kerjaan lancar, makan siang enak, dan sore ini hujan pas aku udah di rumah.", category: "Syukur", mood: "😊", private: false, author: "raka", createdAt: now - 2 * day },
    { id: uid(), title: "Pantai Santolo", content: "Pengen nyunset.", category: "Rencana", mood: "😍", private: true, author: "dina", createdAt: now },
  ]);
}

/* ---------- Util ---------- */
function uid() { return Math.random().toString(36).slice(2, 10); }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (t) => new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- State ---------- */
let me = null;
let editingId = null;
let pickedMood = MOODS[0].e;
const filter = { scope: "all", cat: "", q: "" };
let authMode = "login";

/* ---------- Tema ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("ipk_theme", t);
}

/* ---------- Auth ---------- */
function setMode(mode) {
  authMode = mode;
  $$(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  $("#authTitle").textContent = mode === "login" ? "Hai, apa kabar pikiranmu hari ini?" : "Yuk, buat ruang kecilmu sendiri.";
  $("#authSubmit").textContent = mode === "login" ? "Mulai menulis" : "Buat akun";
  $("#authError").hidden = true;
}

function login(username, password) {
  const u = api.users().find((x) => x.username === username && x.password === password);
  if (!u) return showAuthError("Nama pengguna atau kata sandi belum cocok.");
  me = u.username; api.saveSession(me); showApp();
}

function register(username, password) {
  const name = username.toLowerCase().replace(/\s+/g, "");
  if (api.users().some((x) => x.username === name)) return showAuthError("Nama itu sudah dipakai, coba yang lain.");
  api.saveUsers([...api.users(), { username: name, password }]);
  me = name; api.saveSession(me); showApp(); toast("Akun dibuat. Selamat datang!");
}

function showAuthError(m) { const e = $("#authError"); e.textContent = m; e.hidden = false; }

/* ---------- Tampilan ---------- */
function showAuth() { $("#appView").hidden = true; $("#authView").hidden = false; }

function showApp() {
  $("#authView").hidden = true; $("#appView").hidden = false;
  $("#meName").textContent = cap(me); $("#avatar").textContent = me[0].toUpperCase();
  const h = new Date().getHours();
  const sapa = h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
  $("#greeting").textContent = `${sapa}, ${cap(me)}.`;
  resetComposer(); render();
}

function visibleThoughts() { return api.thoughts().filter((t) => !t.private || t.author === me); }

function render() {
  const all = visibleThoughts();
  const week = all.filter((t) => Date.now() - t.createdAt < 7 * 864e5).length;
  const mine = all.filter((t) => t.author === me).length;
  $("#statLine").textContent = `${all.length} pikiran terkumpul · ${mine} milikmu · ${week} dalam seminggu ini`;

  const q = filter.q.trim().toLowerCase();
  const rows = all
    .filter((t) => filter.scope === "all" || t.author === me)
    .filter((t) => !filter.cat || t.category === filter.cat)
    .filter((t) => !q || (t.title + " " + t.content).toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);

  $("#empty").hidden = rows.length > 0;
  $("#list").innerHTML = rows.map((t) => {
    const own = t.author === me;
    return `
    <article class="note" data-cat="${esc(t.category)}" style="animation-delay:${Math.min(rows.indexOf(t) * 40, 300)}ms">
      <div class="note-top">
        <span class="note-mood" title="Perasaan">${esc(t.mood)}</span>
        <span class="note-tag">${t.private ? "🔒 " : ""}${esc(t.category)}</span>
      </div>
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.content)}</p>
      <div class="note-foot">
        <span>${own ? "Kamu" : esc(cap(t.author))} · ${fmtDate(t.createdAt)}</span>
        ${own ? `<span class="note-actions">
          <button class="mini" data-act="edit" data-id="${t.id}" type="button">Ubah</button>
          <button class="mini danger" data-act="del" data-id="${t.id}" type="button">Hapus</button>
        </span>` : ""}
      </div>
    </article>`;
  }).join("");
}

/* ---------- Composer ---------- */
function expandComposer(open) {
  $("#cTitle").hidden = !open; $("#cExtra").hidden = !open;
  $("#cContent").rows = open ? 3 : 1;
}

function drawMoods() {
  $("#moodPick").innerHTML = MOODS.map((m) =>
    `<button type="button" class="mood-btn ${m.e === pickedMood ? "is-on" : ""}" data-mood="${m.e}" title="${m.n}">${m.e}</button>`).join("");
}

function resetComposer() {
  editingId = null; pickedMood = MOODS[0].e;
  $("#composer").reset(); $("#cCategory").value = CATEGORIES[0];
  $("#cSave").textContent = "Simpan pikiran";
  drawMoods(); expandComposer(false);
}

function saveThought(e) {
  e.preventDefault();
  const content = $("#cContent").value.trim();
  if (!content) return toast("Tulis dulu sesuatu ya.");
  const title = $("#cTitle").value.trim() || content.split(/\s+/).slice(0, 5).join(" ");
  const data = { title, content, category: $("#cCategory").value, mood: pickedMood, private: $("#cPrivate").checked };
  let list = api.thoughts();
  if (editingId) {
    list = list.map((t) => (t.id === editingId && t.author === me ? { ...t, ...data } : t));
    toast("Pikiran diperbarui.");
  } else {
    list.push({ id: uid(), author: me, createdAt: Date.now(), ...data });
    toast("Tersimpan. Lega ya?");
  }
  api.saveThoughts(list); resetComposer(); render();
}

function startEdit(id) {
  const t = api.thoughts().find((x) => x.id === id && x.author === me);
  if (!t) return;
  editingId = id; pickedMood = t.mood;
  expandComposer(true);
  $("#cTitle").value = t.title; $("#cContent").value = t.content;
  $("#cCategory").value = t.category; $("#cPrivate").checked = t.private;
  $("#cSave").textContent = "Simpan perubahan"; drawMoods();
  $("#composer").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#cContent").focus();
}

function removeThought(id) {
  if (!confirm("Hapus pikiran ini?")) return;
  api.saveThoughts(api.thoughts().filter((t) => !(t.id === id && t.author === me)));
  render(); toast("Sudah dihapus.");
}

/* ---------- Event ---------- */
function init() {
  seed();
  applyTheme(localStorage.getItem("ipk_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  const opts = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  $("#cCategory").innerHTML = opts;
  $("#fCategory").innerHTML = `<option value="">Semua kategori</option>` + opts;

  $$(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#togglePw").addEventListener("click", () => {
    const p = $("#password"); p.type = p.type === "password" ? "text" : "password";
  });
  $("#authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = $("#username").value.trim().toLowerCase(), p = $("#password").value;
    authMode === "login" ? login(u, p) : register(u, p);
  });
  $$("[data-demo]").forEach((b) => b.addEventListener("click", () => {
    const n = b.dataset.demo; login(n, n + "123");
  }));
  $("#logoutBtn").addEventListener("click", () => { api.saveSession(null); me = null; $("#authForm").reset(); showAuth(); });
  $("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  $("#cContent").addEventListener("focus", () => expandComposer(true));
  $("#cCancel").addEventListener("click", resetComposer);
  $("#composer").addEventListener("submit", saveThought);
  $("#moodPick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mood]"); if (!b) return;
    pickedMood = b.dataset.mood; drawMoods();
  });

  $$(".seg-btn").forEach((b) => b.addEventListener("click", () => {
    $$(".seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
    filter.scope = b.dataset.scope; render();
  }));
  $("#fCategory").addEventListener("change", (e) => { filter.cat = e.target.value; render(); });
  $("#fSearch").addEventListener("input", (e) => { filter.q = e.target.value; render(); });

  $("#list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    b.dataset.act === "edit" ? startEdit(b.dataset.id) : removeThought(b.dataset.id);
  });

  me = api.session();
  me && api.users().some((u) => u.username === me) ? showApp() : (setMode("login"), showAuth());
}

init();