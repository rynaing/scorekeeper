/* ============================================================
   SCOREKEEPER — couch scoreboard for card & board games
   Stack: GitHub Pages + Supabase (REST + Realtime)
   ============================================================ */

const SUPABASE_URL = "https://ukrxoqsvyvlyeblubjeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_hXr3XBpmRYSDiJNiOzt6yw_DttyIY6y";
const SITE_URL = "https://rynaing.github.io/scorekeeper/";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const BUILD = "1790256659"; // deploy.sh replaces this with a timestamp

const CODE_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O — readable on a TV

let table = null;      // { id, code }
let players = [];      // [{ id, name, score }]
let selectedId = null;
let isHost = false;
let step = parseInt(localStorage.getItem("sk_step") || "1", 10) || 1;
let channel = null;

function show(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(viewId).classList.remove("hidden");
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function randCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)];
  return s;
}

function joinUrl(code) {
  return SITE_URL + "?table=" + code;
}

function renderQr(code) {
  const box = $("qrBox");
  box.innerHTML = "";
  const url = joinUrl(code);
  try {
    if (typeof qrcode !== "undefined") {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createImgTag(5, 8);
      const img = box.querySelector("img");
      if (img) img.alt = "QR code to join table " + code;
      return;
    }
  } catch (e) { /* fall through to hosted QR */ }
  const img = document.createElement("img");
  img.alt = "QR code to join table " + code;
  img.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(url);
  box.appendChild(img);
}

async function createTable() {
  for (let i = 0; i < 5; i++) {
    const code = randCode();
    const { data, error } = await sb.from("sk_tables").insert({ code }).select().single();
    if (!error && data) {
      enterTable(data, true);
      return;
    }
    if (!error || error.code !== "23505") {
      showHomeErr("Couldn't create a table — check your connection and try again.");
      return;
    }
  }
  showHomeErr("Couldn't create a table — try again.");
}

function showHomeErr(msg) {
  const e = $("homeErr");
  e.textContent = msg;
  e.classList.remove("hidden");
}

async function lookupTable(code) {
  const { data, error } = await sb.from("sk_tables").select("id, code").eq("code", code).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function goJoin(code) {
  const t = await lookupTable(code);
  if (!t) {
    showHomeErr("No table with that code — check the TV screen.");
    return;
  }
  table = t;
  isHost = false;
  $("joinCodeLabel").textContent = code;
  $("playerNameInput").value = localStorage.getItem("sk_name") || "";
  $("joinErr").classList.add("hidden");
  show("view-join");
  setTimeout(() => $("playerNameInput").focus(), 50);
}

async function joinAsPlayer() {
  const name = $("playerNameInput").value.trim().slice(0, 20);
  if (!name) {
    const e = $("joinErr");
    e.textContent = "Enter your name first.";
    e.classList.remove("hidden");
    return;
  }
  const { data, error } = await sb.from("sk_players").insert({ table_id: table.id, name }).select().single();
  if (error || !data) {
    const e = $("joinErr");
    e.textContent = "Couldn't join — try again.";
    e.classList.remove("hidden");
    return;
  }
  localStorage.setItem("sk_name", name);
  enterTable(table, false);
}

async function addPlayer() {
  const input = $("addNameInput");
  const name = input.value.trim().slice(0, 20);
  if (!name || !table) return;
  const { error } = await sb.from("sk_players").insert({ table_id: table.id, name });
  if (error) toast("Couldn't add player — try again.");
  else { input.value = ""; fetchPlayers(); }
}

function enterTable(t, host) {
  table = t;
  isHost = host;
  if (host) {
    try { localStorage.setItem("sk_host_" + t.code, "1"); } catch (e) {}
  } else {
    try { isHost = localStorage.getItem("sk_host_" + t.code) === "1"; } catch (e) {}
  }
  selectedId = null;
  $("tableBadge").textContent = t.code;
  $("tableBadge").classList.remove("hidden");
  $("leaveBtn").classList.remove("hidden");
  $("codeBig").textContent = t.code;
  $("hostControls").classList.toggle("hidden", !isHost);
  renderQr(t.code);
  show("view-table");
  subscribe();
  fetchPlayers();
}

async function fetchPlayers() {
  if (!table) return;
  const { data, error } = await sb.from("sk_players").select("id, name, score").eq("table_id", table.id);
  if (error) { toast("Couldn't load players."); return; }
  players = data || [];
  if (selectedId && !players.some((p) => p.id === selectedId)) selectedId = null;
  renderBoard();
}

function renderBoard() {
  const board = $("board");
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (!sorted.length) {
    board.innerHTML = '<p class="empty">No players yet — add some below, or scan the QR to join.</p>';
  } else {
    board.innerHTML = sorted.map((p, i) => `
      <button class="player-row${p.id === selectedId ? " selected" : ""}" data-id="${p.id}">
        <span class="rank">${i + 1}</span>
        <span class="pname">${esc(p.name)}</span>
        <span class="pscore">${p.score}</span>
      </button>`).join("");
    board.querySelectorAll(".player-row").forEach((row) => {
      row.addEventListener("click", () => {
        selectedId = selectedId === row.dataset.id ? null : row.dataset.id;
        renderBoard();
      });
    });
  }
  renderScorePanel();
}

function renderScorePanel() {
  const panel = $("scorePanel");
  const p = players.find((x) => x.id === selectedId);
  panel.classList.toggle("hidden", !p);
  if (p) $("selName").textContent = p.name;
  document.querySelectorAll("#stepRow .chip").forEach((c) => {
    c.classList.toggle("active", parseInt(c.dataset.step, 10) === step);
  });
}

async function bump(delta) {
  const p = players.find((x) => x.id === selectedId);
  if (!p || !table) return;
  const { error } = await sb.from("sk_players").update({ score: p.score + delta }).eq("id", p.id);
  if (error) toast("Couldn't update score.");
  else fetchPlayers(); // realtime will also refresh; this keeps it snappy
}

async function resetScores() {
  if (!table || !isHost) return;
  if (!confirm("Reset everyone's score to 0?")) return;
  const { error } = await sb.from("sk_players").update({ score: 0 }).eq("table_id", table.id);
  if (error) toast("Couldn't reset scores.");
  else fetchPlayers();
}

async function newTable() {
  if (!table || !isHost) return;
  if (!confirm("Start a brand-new table? Everyone will need to rejoin.")) return;
  const oldId = table.id;
  leaveTable(true);
  await sb.from("sk_tables").delete().eq("id", oldId);
  createTable();
}

function subscribe() {
  unsubscribe();
  if (!table) return;
  channel = sb.channel("sk_" + table.id)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "sk_players", filter: "table_id=eq." + table.id },
      () => fetchPlayers())
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "sk_tables", filter: "id=eq." + table.id },
      () => tableClosed())
    .subscribe();
}

function unsubscribe() {
  if (channel) { sb.removeChannel(channel); channel = null; }
}

function tableClosed() {
  if (!table) return;
  const code = table.code;
  leaveTable(true);
  toast("Table " + code + " was closed.");
}

function leaveTable(silent) {
  unsubscribe();
  table = null;
  players = [];
  selectedId = null;
  isHost = false;
  $("tableBadge").classList.add("hidden");
  $("leaveBtn").classList.add("hidden");
  $("joinCodeInput").value = "";
  $("homeErr").classList.add("hidden");
  if (!silent) show("view-home");
  else show("view-home");
}

// Stale-tab nudge: a tab opened before a deploy keeps running old code.
let updateBannerShown = false;
async function checkForUpdate() {
  if (updateBannerShown || !/^\d+$/.test(String(BUILD))) return;
  try {
    const html = await (await fetch("index.html?v=" + Date.now(), { cache: "no-store" })).text();
    const m = html.match(/app\.js\?v=(\d+)/);
    if (m && m[1] !== String(BUILD)) {
      updateBannerShown = true;
      toast("A new version is available — reload to update.");
    }
  } catch (e) {}
}

function bind() {
  $("newTableBtn").addEventListener("click", createTable);
  $("newTableBtn2").addEventListener("click", newTable);
  $("joinGoBtn").addEventListener("click", () => {
    const code = $("joinCodeInput").value.trim().toUpperCase();
    if (code.length !== 4) { showHomeErr("Enter the 4-letter code from the TV."); return; }
    goJoin(code);
  });
  $("joinCodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("joinGoBtn").click(); });
  $("joinTableBtn").addEventListener("click", joinAsPlayer);
  $("playerNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") joinAsPlayer(); });
  $("addPlayerBtn").addEventListener("click", addPlayer);
  $("addNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addPlayer(); });
  $("plusBtn").addEventListener("click", () => bump(step));
  $("minusBtn").addEventListener("click", () => bump(-step));
  document.querySelectorAll("#stepRow .chip").forEach((c) => {
    c.addEventListener("click", () => {
      step = parseInt(c.dataset.step, 10);
      try { localStorage.setItem("sk_step", String(step)); } catch (e) {}
      renderScorePanel();
    });
  });
  $("resetBtn").addEventListener("click", resetScores);
  $("leaveBtn").addEventListener("click", () => leaveTable(false));
  setInterval(checkForUpdate, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });

  // Deep link from QR: ?table=CODE
  const params = new URLSearchParams(location.search);
  const code = (params.get("table") || "").trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(code)) {
    history.replaceState(null, "", location.pathname);
    goJoin(code);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
else bind();
