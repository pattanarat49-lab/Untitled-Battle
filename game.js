// Untitled Battle: a turn-based, Pokemon-style battle game using the heroes of Riftborn.
// Two sides take turns: on your turn pick FIGHT (cast a skill), BAG (use an item), TEAM (switch hero) or RUN.

"use strict";

// ---------- Data ----------

const HEROES = window.RIFTBORN_HEROES;
const BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));
const TEAM_SIZE = 3;

/** Each hero's type comes from its basic attack in Riftborn. */
const TYPES = {
  punch: { name: "FIST", color: "#c0503a", basic: "PUNCH" },
  sword: { name: "BLADE", color: "#6f6fa8", basic: "SLASH" },
  magic: { name: "ARCANE", color: "#9a48c8", basic: "MAGIC ORB" },
  lightning: { name: "VOLT", color: "#d8a414", basic: "LIGHTNING" },
  rifle: { name: "SHOT", color: "#4a7a5a", basic: "SNIPE" },
};
/** Attacker type -> defender types it hits for double damage (and they hit it back for half). */
const BEATS = {
  punch: ["rifle", "lightning"], // closes the gap on shooters
  sword: ["punch"], // outreaches fists
  magic: ["sword"], // blasts swordsmen from afar
  lightning: ["sword", "rifle"], // metal conducts
  rifle: ["magic"], // snipes casters
};
function typeMult(atk, def) {
  if (BEATS[atk]?.includes(def)) return 2;
  if (BEATS[def]?.includes(atk)) return 0.5;
  return 1;
}

const FX_COLORS = { punch: "#ff8a4a", sword: "#d8e0ff", magic: "#d080ff", lightning: "#ffe14a", rifle: "#9affc0" };
const EFFECT_COLORS = { burn: "#ff6a2a", stun: "#f2c200", buff: "#e0503a", guard: "#4a8ae0" };
const EFFECT_LABEL = { burn: "BRN", stun: "STN", buff: "ATK", guard: "GRD" };

// A skill's Riftborn description decides which kind of move it becomes here (heal, buff, guard, stun, burn or plain attack).
const RX = {
  heal: /\bheal|restor|regenerat|\bcure|first aid|medical|rebirth|undying/,
  buff: /faster|stronger|rage|empower|\bfocus|boost|power up|awaken|potential|form\b|mode\b|surge|giant/,
  guard: /shield|barrier|\bblock|reflect|parry|guard|harden|shell|armou?r|cloak|vanish|invisible|phase/,
  stun: /stun|freez|frozen|time stop|petrif|paraly|snare|\broot|trap|jail|prison|kneel|order|frozen/,
  burn: /burn|flame|fire|blaze|magma|lava|meteor|ember/,
};

function classify(skill, slot) {
  const text = `${skill.name} ${skill.desc}`.toLowerCase();
  const base = { name: skill.name, desc: skill.desc, acc: slot === 0 ? 95 : 90 };
  if (skill.kind === "onepunch") return { ...base, power: 220, pp: 1, acc: 100, effect: null, special: "Ends any fight in one punch. Usable once per battle." };
  if (skill.kind === "deathnote") return { ...base, power: 160, pp: 1, acc: 75, effect: null, special: "Writes the foe\'s name in the notebook. Huge damage but may miss. Usable once." };
  if (RX.heal.test(text)) return { ...base, power: 0, pp: 3, acc: 100, effect: "heal" };
  if (RX.buff.test(text)) return { ...base, power: 0, pp: 4, acc: 100, effect: "buff" };
  if (RX.guard.test(text)) return { ...base, power: 0, pp: 5, acc: 100, effect: "guard" };
  const power = slot === 0 ? 65 : 85;
  if (RX.stun.test(text)) return { ...base, power: power - 15, pp: slot === 0 ? 8 : 5, effect: "stun" };
  if (RX.burn.test(text)) return { ...base, power: power - 10, pp: slot === 0 ? 8 : 5, effect: "burn" };
  return { ...base, power, pp: slot === 0 ? 10 : 6, effect: null };
}

const FILLERS = [
  { name: "BRACE", desc: "ตั้งการ์ด: ลดความเสียหายครั้งถัดไปครึ่งหนึ่ง", power: 0, pp: 8, acc: 100, effect: "guard" },
  { name: "RIFT STRIKE", desc: "พลังรอยแยกมิติ โจมตีตรงๆ", power: 60, pp: 10, acc: 95, effect: null },
  { name: "FOCUS", desc: "รวมสมาธิ: พลังโจมตีเพิ่มขึ้น", power: 0, pp: 4, acc: 100, effect: "buff" },
];

const VERB = {
  punch: "Slams the foe with a fist",
  sword: "Cuts the foe with a blade",
  magic: "Hurls a magic orb at the foe",
  lightning: "Calls lightning down on the foe",
  rifle: "Fires a beam at the foe",
};

/** What a move does in this game (Riftborn's own text describes its real-time version). */
function describe(mv, type) {
  if (mv.effect === "heal") return "Restores 50% of the user's HP and puts out burns.";
  if (mv.effect === "buff") return "Powers up: attack +25%. Stacks twice; lost when switched out.";
  if (mv.effect === "guard") return "Guards: the foe's next hit deals only half damage.";
  const head = mv.special ?? (mv.basic ? `${VERB[type]}. A basic move with plenty of PP.` : `${VERB[type]} with full force.`);
  const tail = mv.effect === "stun" ? " 35% chance to stun: the foe skips its next turn." : mv.effect === "burn" ? " 35% chance to burn: the foe loses HP each turn for 3 turns." : "";
  return `${head}${tail} Power ${mv.power}, accuracy ${mv.acc}%.`;
}

/** A hero's four moves: its basic attack, its two Riftborn skills, then fillers. */
function movesOf(hero) {
  const moves = [{ name: TYPES[hero.attack].basic, power: 40, pp: 30, acc: 100, effect: null, basic: true }];
  hero.skills.forEach((s, i) => moves.push(classify(s, i)));
  for (const f of FILLERS) {
    if (moves.length >= 4) break;
    if (!moves.some((m) => m.effect === f.effect && (f.effect || m.power === f.power))) moves.push({ ...f });
  }
  return moves.map((m) => ({ ...m, desc: describe(m, hero.attack), maxPp: m.pp }));
}

// Tough heroes in Riftborn get more HP here but hit softer, so every hero stays in the fight.
function makeMon(id) {
  const hero = BY_ID[id];
  const maxHp = Math.round(60 + (hero.hp / 3) * 0.7);
  const atk = Math.min(1.25, Math.max(0.55, Math.pow(134 / maxHp, 0.8))) * (1 + (hero.stars - 3) * 0.04);
  return {
    hero,
    type: hero.attack,
    maxHp,
    hp: maxHp,
    atk,
    level: 40 + Math.min(6, hero.stars) * 2,
    speed: hero.speed,
    moves: movesOf(hero),
    buff: 0,
    burn: 0,
    stun: false,
    stunImmune: false,
    guard: false,
  };
}

// ---------- Shop items and the saved wallet ----------

const ITEMS = {
  potion: { name: "POTION", price: 100, desc: "ฟื้น HP 50% ให้ตัวที่กำลังสู้" },
  superpotion: { name: "SUPER POTION", price: 250, desc: "ฟื้น HP จนเต็มให้ตัวที่กำลังสู้" },
  ether: { name: "ETHER", price: 200, desc: "ฟื้น PP ทุกท่าของตัวที่กำลังสู้" },
  xattack: { name: "X ATTACK", price: 150, desc: "เพิ่มพลังโจมตี 25% ให้ตัวที่กำลังสู้" },
  revive: { name: "REVIVE", price: 400, desc: "ชุบชีวิตเพื่อนร่วมทีมที่หมดแรง กลับมาพร้อม HP 50%" },
};
const SAVE_KEY = "untitled-battle-save";
const START_COINS = 500;

/** Coins and the bag, kept in this browser between games (starts with an empty bag). */
const save = (() => {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {}
  data = data && typeof data.coins === "number" ? data : { coins: START_COINS, bag: {} };
  for (const id in ITEMS) data.bag[id] = data.bag[id] | 0;
  return data;
})();
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}
const coinText = () => `${save.coins.toLocaleString()} เหรียญ`;

// ---------- Small helpers ----------

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const imgOf = (id) => `assets/heroes/${id}.png`;

function fit() {
  const s = Math.min(innerWidth / 960, innerHeight / 600);
  $("stage").style.transform = `scale(${s})`;
}
addEventListener("resize", fit);
fit();

function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== screen);
}

// ---------- Input: one active menu at a time ----------

/** The current keyboard handler (a menu, a message waiting to be skipped, the select grid). */
let keyHandler = null;
addEventListener("keydown", (e) => {
  if (document.activeElement === $("search") && !["Enter", "Escape", "ArrowDown"].includes(e.key)) return;
  const key = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", z: "ok", Z: "ok", " ": "ok", x: "back", X: "back", Escape: "back", Backspace: "back" }[e.key];
  if (!key || !keyHandler) return;
  if (key === "back" && e.key === "Backspace" && document.activeElement === $("search")) return;
  e.preventDefault();
  keyHandler(key);
});

/**
 * Shows buttons in `box` laid out in `cols` columns and resolves with the picked index (or -1 for back).
 * Options: { label (html), disabled }.
 */
function menu(box, options, { cols = 2, cls = "", back = true, start = 0 } = {}) {
  return new Promise((resolve) => {
    box.className = box.id === "cmdbox" ? `cmdbox ${cls}` : box.className;
    box.innerHTML = "";
    let sel = Math.min(start, options.length - 1);
    const buttons = options.map((o, i) => {
      const b = document.createElement("button");
      b.innerHTML = o.label;
      b.disabled = !!o.disabled;
      if (o.cls) b.className = o.cls;
      b.onmouseenter = () => mark(i);
      b.onclick = () => done(i);
      box.appendChild(b);
      return b;
    });
    function mark(i) {
      sel = i;
      buttons.forEach((b, j) => b.classList.toggle("sel", j === i));
      options[i].onFocus?.();
    }
    function done(i) {
      if (i >= 0 && options[i].disabled) return;
      keyHandler = null;
      if (box.id === "cmdbox") box.innerHTML = "";
      resolve(i);
    }
    mark(sel);
    keyHandler = (k) => {
      const n = options.length;
      if (k === "ok") return done(sel);
      if (k === "back") return back && done(-1);
      const step = { left: -1, right: 1, up: -cols, down: cols }[k];
      const next = sel + step;
      if (next >= 0 && next < n && (cols > 1 || k === "up" || k === "down")) mark(next);
    };
  });
}

// ---------- Title ----------

async function titleScreen(start = 0) {
  show("title");
  $("titleCoins").textContent = coinText();
  const box = $("modeMenu");
  const labels = [...box.children].map((b) => b.innerHTML);
  const i = await menu(box, labels.map((label) => ({ label })), { cols: 1, back: false, start });
  if (i === 1) {
    await shopScreen();
    return titleScreen(1);
  }
  const team = await selectTeam();
  if (!team) return titleScreen();
  startBattle(team, cpuTeam(team));
}

/** A random CPU team with none of your heroes in it. */
const cpuTeam = (yours) => shuffle(HEROES.map((h) => h.id).filter((id) => !yours.includes(id))).slice(0, TEAM_SIZE);

// ---------- Shop ----------

async function shopScreen() {
  show("shop");
  const ids = Object.keys(ITEMS);
  let at = 0;
  for (;;) {
    $("shopCoins").textContent = coinText();
    const opts = ids.map((id) => {
      const it = ITEMS[id];
      return {
        label: `<span><b>${it.name}</b>${it.desc}</span><span class="price">${it.price} เหรียญ</span><span class="own">มีอยู่ ${save.bag[id]}</span>`,
        disabled: save.coins < it.price,
      };
    });
    opts.push({ label: "ออกจากร้าน", cls: "back" });
    const i = await menu($("shopList"), opts, { cols: 1, start: at });
    if (i < 0 || i === ids.length) return;
    at = i;
    const it = ITEMS[ids[i]];
    save.coins -= it.price;
    save.bag[ids[i]]++;
    persist();
    $("shopMsg").textContent = `ซื้อ ${it.name} แล้ว! ใช้ได้ในเมนู BAG ระหว่างสู้กับ CPU`;
  }
}

// ---------- Team select ----------

function heroInfoHtml(id) {
  const h = BY_ID[id];
  const m = makeMon(id);
  const t = TYPES[h.attack];
  const moves = m.moves.map((mv) => `<b>${mv.name}</b> ${mv.desc}`).join("<br>");
  return `<b style="font-size:16px">${h.name}</b> · ${h.role} · <span style="color:${t.color};filter:brightness(1.6)">${t.name}</span> · HP ${m.maxHp}<br>${moves}`;
}

function selectTeam() {
  return new Promise((resolve) => {
    show("select");
    const picked = [];
    const grid = $("grid");
    const search = $("search");
    search.value = "";
    $("selectTitle").innerHTML = `<span class="p1">YOUR TEAM</span>: เลือกฮีโร่ ${TEAM_SIZE} ตัว`;
    $("heroInfo").textContent = "ชี้ที่ฮีโร่เพื่อดูสกิล · คลิกเพื่อเลือก";
    let visible = HEROES;
    let sel = 0;

    function renderPicked() {
      $("picked").innerHTML = "";
      for (let i = 0; i < TEAM_SIZE; i++) {
        const id = picked[i];
        const d = document.createElement("div");
        d.className = "slot" + (id ? " full" : "");
        d.innerHTML = id ? `<img src="${imgOf(id)}" alt=""><span>${BY_ID[id].name}</span>` : `<span style="opacity:.5">ช่องที่ ${i + 1}</span>`;
        if (id) d.onclick = () => toggle(id);
        $("picked").appendChild(d);
      }
      $("confirmBtn").disabled = picked.length !== TEAM_SIZE;
      for (const b of grid.children) b.classList.toggle("taken", picked.includes(b.dataset.id));
    }
    function renderGrid() {
      const q = search.value.trim().toLowerCase();
      visible = HEROES.filter((h) => !q || h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q));
      grid.innerHTML = "";
      visible.forEach((h, i) => {
        const b = document.createElement("button");
        b.dataset.id = h.id;
        b.innerHTML = `<img src="${imgOf(h.id)}" alt="" loading="lazy"><span>${h.name}</span>`;
        b.onmouseenter = () => mark(i, false);
        b.onclick = () => toggle(h.id);
        grid.appendChild(b);
      });
      sel = 0;
      renderPicked();
    }
    function mark(i, scroll = true) {
      sel = i;
      [...grid.children].forEach((b, j) => b.classList.toggle("sel", j === i));
      const b = grid.children[i];
      if (!b) return;
      if (scroll) b.scrollIntoView({ block: "nearest" });
      $("heroInfo").innerHTML = heroInfoHtml(b.dataset.id);
    }
    function toggle(id) {
      const at = picked.indexOf(id);
      if (at >= 0) picked.splice(at, 1);
      else if (picked.length < TEAM_SIZE) picked.push(id);
      renderPicked();
    }
    function finish(result) {
      keyHandler = null;
      search.oninput = $("randomBtn").onclick = $("backBtn").onclick = $("confirmBtn").onclick = null;
      resolve(result);
    }
    search.oninput = renderGrid;
    $("randomBtn").onclick = () => {
      picked.length = 0;
      picked.push(...shuffle(HEROES.map((h) => h.id)).slice(0, TEAM_SIZE));
      renderPicked();
    };
    $("backBtn").onclick = () => finish(null);
    $("confirmBtn").onclick = () => picked.length === TEAM_SIZE && finish([...picked]);
    keyHandler = (k) => {
      if (document.activeElement === search) search.blur();
      const cols = Math.max(1, Math.round(grid.clientWidth / (grid.children[0]?.offsetWidth + 6 || 90)));
      const step = { left: -1, right: 1, up: -cols, down: cols }[k];
      if (step) {
        const next = sel + step;
        if (next >= 0 && next < visible.length) mark(next);
      } else if (k === "ok") {
        if (picked.length === TEAM_SIZE) finish([...picked]);
        else if (visible[sel]) toggle(visible[sel].id);
      } else if (k === "back") {
        if (picked.length) {
          picked.pop();
          renderPicked();
        } else finish(null);
      }
    };
    renderGrid();
    mark(0, false);
  });
}

// ---------- Battle state ----------

let sides = [];
let lastTeams = null;

function makeSide(n, ids, ctrl) {
  return {
    n,
    label: ctrl === "cpu" ? "CPU" : "คุณ",
    ctrl,
    team: ids.map(makeMon),
    active: 0,
    // You bring your saved bag; the CPU fights without items.
    bag: n === 0 ? save.bag : {},
  };
}
const active = (s) => s.team[s.active];
const alive = (s) => s.team.filter((m) => m.hp > 0);
/** "Captain Steel" for your own hero, "Captain Steel ของ CPU" for the other side's. */
const who = (side) => (side.n === 1 ? `${active(side).hero.name} ของ CPU` : active(side).hero.name);

function hpColor(frac) {
  return frac > 0.5 ? "var(--hp-green)" : frac > 0.2 ? "var(--hp-yellow)" : "var(--hp-red)";
}

/** Draws both info boxes and sprites: yours at the bottom left, the CPU's at the top right. */
function render() {
  const pairs = [
    [sides[0], "me"],
    [sides[1], "foe"],
  ];
  for (const [side, k] of pairs) {
    const m = active(side);
    $(`${k}Name`).textContent = m.hero.name.toUpperCase();
    $(`${k}Lv`).textContent = `Lv${m.level}`;
    const t = TYPES[m.type];
    $(`${k}Type`).textContent = t.name;
    $(`${k}Type`).style.background = t.color;
    const tags = [];
    if (m.burn) tags.push("burn");
    if (m.stun) tags.push("stun");
    if (m.guard) tags.push("guard");
    for (let i = 0; i < m.buff; i++) tags.push("buff");
    $(`${k}Status`).innerHTML = tags.map((s) => `<span style="background:${EFFECT_COLORS[s]}">${EFFECT_LABEL[s]}${s === "buff" ? "▲" : ""}</span>`).join("");
    const frac = m.hp / m.maxHp;
    $(`${k}Hp`).style.width = `${frac * 100}%`;
    $(`${k}Hp`).style.backgroundColor = hpColor(frac);
    if (k === "me") $("meHpNum").textContent = `${Math.ceil(m.hp)}/${m.maxHp}`;
    $(`${k}Balls`).innerHTML = side.team.map((x) => `<i class="${x.hp > 0 ? "" : "out"}"></i>`).join("");
    const img = $(`${k}Sprite`);
    const src = imgOf(m.hero.id);
    if (!img.src.endsWith(src)) img.src = src;
    img.classList.toggle("faint", m.hp <= 0);
  }
}

// ---------- Messages & effects ----------

let skipMsg = null;
$("msg").parentElement.addEventListener("click", () => skipMsg?.());
$("fx").parentElement.addEventListener("click", () => skipMsg?.());

/** Types out a battle message, then waits a moment (a click or Z skips ahead). */
async function say(text, hold = 900) {
  const p = $("msg");
  p.textContent = "";
  let fast = false;
  skipMsg = () => (fast = true);
  keyHandler = (k) => k === "ok" && (fast = true);
  for (const ch of text) {
    p.textContent += ch;
    if (!fast) await sleep(22);
  }
  fast = false;
  const t0 = performance.now();
  while (!fast && performance.now() - t0 < hold) await sleep(30);
  skipMsg = keyHandler = null;
}

/** Centre of a sprite on the field, for effects. */
function spot(k) {
  return k === "me" ? { x: 285, y: 300 } : { x: 720, y: 136 };
}
const keyOf = (side) => (side.n === 0 ? "me" : "foe");

// ---------- Effects: a small particle engine drawn on the field canvas ----------

const FX = {
  ctx: $("fx").getContext("2d"),
  items: [], // { t: age in s, life, draw(ctx, k 0..1, dt) }
  last: 0,
  running: false,
  add(life, draw) {
    this.items.push({ t: 0, life, draw });
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((now) => this.frame(now));
    }
  },
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, 960, 420);
    c.globalCompositeOperation = "lighter";
    this.items = this.items.filter((it) => {
      it.t += dt;
      if (it.t >= it.life) return false;
      c.save();
      it.draw(c, it.t / it.life, dt);
      c.restore();
      return true;
    });
    if (this.items.length) requestAnimationFrame((n) => this.frame(n));
    else {
      c.clearRect(0, 0, 960, 420);
      this.running = false;
    }
  },
};
const fxWait = (ms) => sleep(REDUCED ? Math.min(ms, 120) : ms);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

function glow(c, color, blur) {
  c.shadowColor = color;
  c.shadowBlur = blur;
}

/** Bits flying out from a point. */
function sparks(p, color, n = 16, speed = 260, life = 0.5, size = 4, grav = 300) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * rand(0.4, 1);
    let x = p.x;
    let y = p.y;
    let vx = Math.cos(a) * v;
    let vy = Math.sin(a) * v;
    const s = size * rand(0.6, 1.3);
    FX.add(life * rand(0.6, 1), (c, k, dt) => {
      vy += grav * dt;
      x += vx * dt;
      y += vy * dt;
      c.globalAlpha = 1 - k;
      glow(c, color, 10);
      c.fillStyle = k < 0.25 ? "#fff" : color;
      c.fillRect(x - s / 2, y - s / 2, s, s);
    });
  }
}

function ring(p, color, r1 = 90, life = 0.45, width = 8) {
  FX.add(life, (c, k) => {
    c.globalAlpha = 1 - k;
    glow(c, color, 16);
    c.strokeStyle = color;
    c.lineWidth = width * (1 - k) + 1;
    c.beginPath();
    c.arc(p.x, p.y, 10 + r1 * Math.sqrt(k), 0, Math.PI * 2);
    c.stroke();
  });
}

function core(p, color, r = 60, life = 0.3) {
  FX.add(life, (c, k) => {
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * (0.5 + k));
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = 1 - k;
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, r * (0.5 + k), 0, Math.PI * 2);
    c.fill();
  });
}

function impact(p, color, big) {
  core(p, color, big ? 110 : 60);
  ring(p, color, big ? 150 : 80, 0.45, big ? 12 : 7);
  sparks(p, color, big ? 30 : 14, big ? 380 : 240);
}

/** A sword cut across the target: a bright arc drawn in, then fading. */
function slash(p, color, angle, len = 190, width = 16) {
  FX.add(0.42, (c, k) => {
    const draw = Math.min(1, k / 0.35);
    c.translate(p.x, p.y);
    c.rotate(angle);
    c.globalAlpha = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
    glow(c, color, 18);
    c.fillStyle = "#fff";
    c.strokeStyle = color;
    c.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps * draw; i++) {
      const u = i / steps;
      const x = (u - 0.5) * len;
      const y = -Math.sin(u * Math.PI) * len * 0.22;
      const w = Math.sin(u * Math.PI) * width;
      if (i === 0) c.moveTo(x, y - w / 2);
      else c.lineTo(x, y - w / 2);
    }
    for (let i = Math.floor(steps * draw); i >= 0; i--) {
      const u = i / steps;
      c.lineTo((u - 0.5) * len, -Math.sin(u * Math.PI) * len * 0.22 + (Math.sin(u * Math.PI) * width) / 2);
    }
    c.closePath();
    c.fill();
    c.lineWidth = 3;
    c.stroke();
  });
}

/** A glowing shot that flies from one hero to the other, leaving a trail. Resolves on arrival. */
function projectile(from, to, color, size = 16, time = 0.42) {
  return new Promise((done) => {
    let ended = false;
    FX.add(time, (c, k) => {
      const e = k * k * (3 - 2 * k);
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e - Math.sin(k * Math.PI) * 50;
      if (Math.random() < 0.9) sparks({ x, y }, color, 1, 40, 0.35, size * 0.5, 0);
      const g = c.createRadialGradient(x, y, 0, x, y, size * 2);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, size * 2, 0, Math.PI * 2);
      c.fill();
      if (k > 0.94 && !ended) {
        ended = true;
        done();
      }
    });
    setTimeout(() => !ended && ((ended = true), done()), time * 1000 + 80);
  });
}

/** Lightning from the sky onto the target, flickering. */
function bolt(p, color, width = 6) {
  const pts = [];
  let x = p.x + rand(-60, 60);
  for (let y = -20; y < p.y; y += 26) {
    pts.push([x, y]);
    x += rand(-28, 28) + (p.x - x) * 0.18;
  }
  pts.push([p.x, p.y]);
  FX.add(0.45, (c, k) => {
    if (Math.floor(k * 9) % 2) return;
    c.globalAlpha = 1 - k * 0.6;
    glow(c, color, 24);
    for (const [w, col] of [[width * 2.2, color], [width * 0.7, "#fff"]]) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineJoin = "round";
      c.beginPath();
      pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
      c.stroke();
    }
  });
}

/** A straight beam from caster to target. */
function beam(from, to, color, width = 14) {
  FX.add(0.5, (c, k) => {
    const grow = Math.min(1, k / 0.25);
    const x = from.x + (to.x - from.x) * grow;
    const y = from.y + (to.y - from.y) * grow;
    c.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    glow(c, color, 26);
    c.lineCap = "round";
    for (const [w, col] of [[width * (1 - k * 0.5), color], [width * 0.35, "#fff"]]) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.lineTo(x, y);
      c.stroke();
    }
  });
}

/** Flames licking up from the target. */
function flames(p, n = 26) {
  for (let i = 0; i < n; i++) {
    const x0 = p.x + rand(-55, 55);
    let y = p.y + rand(10, 70);
    const vy = -rand(80, 180);
    const s = rand(8, 18);
    const delay = rand(0, 0.35);
    FX.add(0.8 + delay, (c, k, dt) => {
      const t = k * (0.8 + delay) - delay;
      if (t < 0) return;
      y += vy * dt;
      const f = t / 0.8;
      c.globalAlpha = 1 - f;
      glow(c, "#ff5a00", 14);
      c.fillStyle = f < 0.3 ? "#fff3a0" : f < 0.6 ? "#ff9a2a" : "#e03a10";
      c.beginPath();
      c.arc(x0 + Math.sin(t * 20 + x0) * 6, y, s * (1 - f * 0.6), 0, Math.PI * 2);
      c.fill();
    });
  }
}

/** Little stars circling the target's head (stunned). */
function dizzy(p) {
  const head = { x: p.x, y: p.y - 80 };
  FX.add(1.2, (c, k) => {
    c.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
    glow(c, "#ffe14a", 10);
    c.fillStyle = "#ffe14a";
    for (let i = 0; i < 4; i++) {
      const a = k * Math.PI * 4 + (i * Math.PI) / 2;
      const x = head.x + Math.cos(a) * 46;
      const y = head.y + Math.sin(a) * 12;
      c.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 4 : 10;
        const b = (j * Math.PI) / 5 - Math.PI / 2;
        c.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
      }
      c.fill();
    }
  });
  sparks(p, "#ffe14a", 12, 200, 0.5, 4, 0);
}

/** Green crosses floating up (healing). */
function healFx(p) {
  ring(p, "#7cffb0", 110, 0.7, 6);
  for (let i = 0; i < 16; i++) {
    const x = p.x + rand(-70, 70);
    let y = p.y + rand(0, 80);
    const delay = rand(0, 0.5);
    FX.add(1 + delay, (c, k, dt) => {
      const t = k * (1 + delay) - delay;
      if (t < 0) return;
      y -= 70 * dt;
      c.globalAlpha = 1 - t;
      glow(c, "#4dff8a", 12);
      c.fillStyle = "#b8ffd0";
      c.fillRect(x - 3, y - 10, 6, 20);
      c.fillRect(x - 10, y - 3, 20, 6);
    });
  }
}

/** Energy rising around the hero (attack up). */
function auraFx(p, color) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const x = p.x + Math.cos(a) * rand(50, 85);
    let y = p.y + 90 + rand(-10, 10);
    const delay = rand(0, 0.6);
    const s = rand(3, 7);
    FX.add(0.9 + delay, (c, k, dt) => {
      const t = k * (0.9 + delay) - delay;
      if (t < 0) return;
      y -= 260 * dt;
      c.globalAlpha = 1 - t / 0.9;
      glow(c, color, 12);
      c.fillStyle = color;
      c.fillRect(x - s / 2, y - s * 2, s, s * 4);
    });
  }
  core(p, color, 120, 0.6);
}

/** A hexagon shield that snaps up in front of the hero. */
function shieldFx(p, color, facing) {
  const cx = p.x + facing * 70;
  FX.add(0.9, (c, k) => {
    const s = k < 0.2 ? k / 0.2 : 1;
    c.globalAlpha = k < 0.7 ? 0.9 : (1 - k) / 0.3;
    glow(c, color, 20);
    c.strokeStyle = color;
    c.fillStyle = "rgba(90,160,255,0.18)";
    c.lineWidth = 5;
    c.translate(cx, p.y);
    c.scale(0.45 * s, 1 * s);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      c.lineTo(Math.cos(a) * 110, Math.sin(a) * 110);
    }
    c.closePath();
    c.fill();
    c.stroke();
  });
  sparks({ x: cx, y: p.y }, color, 10, 160, 0.5, 4, 0);
}

/** Specks rushing in to the caster before a skill. */
function chargeFx(p, color, time = 0.5) {
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(90, 160);
    FX.add(time, (c, k) => {
      const d = r * (1 - k);
      c.globalAlpha = k;
      glow(c, color, 10);
      c.fillStyle = color;
      c.fillRect(p.x + Math.cos(a) * d - 2, p.y + Math.sin(a) * d - 2, 4, 4);
    });
  }
}

function flash(color) {
  if (REDUCED) return;
  const f = $("flash");
  f.style.background = color;
  f.classList.remove("on");
  void f.offsetWidth;
  f.classList.add("on");
}

function banner(text, color) {
  const b = $("banner");
  b.textContent = text;
  b.style.background = `linear-gradient(90deg, transparent, ${color} 25%, ${color} 75%, transparent)`;
  b.classList.remove("on");
  void b.offsetWidth;
  b.classList.add("on");
}

/** The cast: name banner, glow and charge-up, shown for skills (not basic attacks). */
async function castFx(side, move, color) {
  if (move.basic) return;
  const s = $(`${keyOf(side)}Sprite`);
  s.style.setProperty("--glow", color);
  s.classList.add("cast");
  banner(move.name, color);
  chargeFx(spot(keyOf(side)), color);
  await fxWait(550);
  s.classList.remove("cast");
}

async function lunge(side, cls = "lunge") {
  const s = $(`${keyOf(side)}Sprite`);
  s.classList.add(cls);
  await fxWait(170);
  s.classList.remove(cls);
}

function moveColor(type, move) {
  if (move.effect === "burn") return "#ff6a2a";
  if (move.effect === "stun") return "#ffd23a";
  return FX_COLORS[type];
}

/** The attack itself, by hero type: fists punch, blades cut, mages throw orbs, Volt calls lightning, snipers fire beams. */
async function attackAnim(side, move, foeSide) {
  const m = active(side);
  const from = spot(keyOf(side));
  const to = spot(keyOf(foeSide));
  const color = moveColor(m.type, move);
  const big = !move.basic;
  await castFx(side, move, color);
  if (m.type === "punch") {
    await lunge(side);
    impact(to, color, big);
    if (big) {
      for (let i = 1; i <= 2; i++) setTimeout(() => impact({ x: to.x + rand(-40, 40), y: to.y + rand(-40, 30) }, color, false), i * 110);
    }
  } else if (m.type === "sword") {
    await lunge(side);
    const dir = keyOf(side) === "me" ? 1 : -1;
    slash(to, color, -0.5 * dir, big ? 240 : 180, big ? 22 : 15);
    if (big) {
      setTimeout(() => slash(to, color, 0.6 * dir, 240, 22), 110);
      setTimeout(() => slash(to, "#ffffff", 0, 260, 12), 220);
    }
    sparks(to, color, big ? 22 : 10, 260);
  } else if (m.type === "magic") {
    await lunge(side, "recoil");
    await projectile(from, to, color, big ? 26 : 15);
    impact(to, color, big);
  } else if (m.type === "lightning") {
    await lunge(side, "recoil");
    bolt(to, color, big ? 9 : 5);
    if (big) setTimeout(() => bolt({ x: to.x + 40, y: to.y }, color, 6), 120);
    impact(to, color, big);
  } else {
    await lunge(side, "recoil");
    beam(from, to, color, big ? 22 : 10);
    await fxWait(130);
    impact(to, color, big);
  }
  if (big) flash(color);
  if (move.effect === "burn") flames(to, big ? 26 : 12);
  if (move.effect === "stun") sparks(to, "#ffd23a", 14, 220, 0.5, 4, 0);
  await fxWait(big ? 250 : 120);
}

/** Moves that don't attack: heal, power up, guard. */
async function supportAnim(side, move) {
  const p = spot(keyOf(side));
  const color = { heal: "#7cffb0", buff: "#ff5a3a", guard: "#5aa8ff" }[move.effect];
  if (!move.item) await castFx(side, move, color);
  if (move.effect === "heal") healFx(p);
  if (move.effect === "buff") auraFx(p, color);
  if (move.effect === "guard") shieldFx(p, color, keyOf(side) === "me" ? 1 : -1);
  await fxWait(500);
}

async function hitAnim(side) {
  const k = keyOf(side);
  const s = $(`${k}Sprite`);
  s.classList.remove("hit");
  void s.offsetWidth;
  s.classList.add("hit");
  const field = $("battle").querySelector(".field");
  if (!REDUCED) field.classList.add("shake");
  await sleep(400);
  field.classList.remove("shake");
  await sleep(250);
  s.classList.remove("hit");
}

// ---------- Battle flow ----------

function startBattle(t1, t2) {
  lastTeams = [t1, t2];
  sides = [makeSide(0, t1, "human"), makeSide(1, t2, "cpu")];
  show("battle");
  $("cmdbox").innerHTML = "";
  render();
  battle();
}

async function battle() {
  const [a, b] = sides;
  await say(`CPU ท้าสู้!\nCPU ส่ง ${active(b).hero.name} ออกมา!`, 1100);
  await say(`ไปเลย ${active(a).hero.name}!`, 700);
  // The faster hero moves first; then the two sides simply take turns.
  let cur = active(a).speed === active(b).speed ? (Math.random() < 0.5 ? 0 : 1) : active(a).speed > active(b).speed ? 0 : 1;
  if (cur === 1) await say(`${who(b)} เร็วกว่า ได้เริ่มก่อน!`, 700);
  for (;;) {
    const result = await takeTurn(sides[cur]);
    if (result) return gameOver(result.winner, result.text);
    const over = await checkFaints(cur);
    if (over) return gameOver(over);
    cur = 1 - cur;
  }
}

async function takeTurn(side) {
  const m = active(side);
  const foe = sides[1 - side.n];
  m.guard = false;
  render();
  if (m.stun) {
    m.stun = false;
    m.stunImmune = true;
    render();
    await say(`${who(side)} ถูกสตันอยู่ ขยับไม่ได้!`);
    return null;
  }
  m.stunImmune = false;
  const action = side.ctrl === "human" ? await humanAction(side) : await cpuAction(side);
  if (action.kind === "run") {
    await say(`${side.label}หนีออกจากการต่อสู้!`);
    return { winner: foe, text: "run" };
  }
  if (action.kind === "move") await useMove(side, action.move);
  if (action.kind === "item") await useItem(side, action.item, action.target);
  if (action.kind === "switch") await switchTo(side, action.index);
  const me = active(side);
  if (me.hp > 0 && me.burn > 0) {
    me.burn--;
    me.hp = Math.max(0, me.hp - Math.ceil(me.maxHp / 12));
    flames(spot(keyOf(side)), 14);
    render();
    await say(`${who(side)} โดนไฟเผา!`, 700);
  }
  return null;
}

async function useMove(side, move) {
  const foe = sides[1 - side.n];
  const m = active(side);
  const f = active(foe);
  move.pp--;
  await say(`${who(side)} ใช้ ${move.name}!`, 500);
  if (move.effect === "heal") {
    await supportAnim(side, move);
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.5));
    m.burn = 0;
    render();
    return say(m.hp > before ? `${who(side)} ฟื้นพลังชีวิต!` : `แต่ HP เต็มอยู่แล้ว!`);
  }
  if (move.effect === "buff") {
    await supportAnim(side, move);
    if (m.buff >= 2) return say(`พลังโจมตีของ ${who(side)} สูงสุดแล้ว!`);
    m.buff++;
    render();
    return say(`พลังโจมตีของ ${who(side)} เพิ่มขึ้น!`);
  }
  if (move.effect === "guard") {
    await supportAnim(side, move);
    m.guard = true;
    render();
    return say(`${who(side)} ตั้งการ์ดป้องกัน!`);
  }
  if (Math.random() * 100 >= move.acc) {
    await castFx(side, move, moveColor(m.type, move));
    await lunge(side);
    return say(`แต่การโจมตีพลาด!`);
  }
  await attackAnim(side, move, foe);
  const eff = typeMult(m.type, f.type);
  const crit = Math.random() < 1 / 12;
  let dmg = move.power * m.atk * 0.42 * eff * (1 + m.buff * 0.25) * rand(0.85, 1) * (crit ? 1.5 : 1);
  const guarded = f.guard;
  if (guarded) {
    dmg *= 0.5;
    f.guard = false;
  }
  dmg = Math.max(1, Math.round(dmg));
  f.hp = Math.max(0, f.hp - dmg);
  render();
  await hitAnim(foe);
  if (crit) await say("คริติคอล!", 600);
  if (eff > 1) await say("ได้ผลดีมาก!", 600);
  if (eff < 1) await say("ได้ผลไม่ค่อยดี...", 600);
  if (guarded) await say(`${who(foe)} ป้องกันไว้ได้ครึ่งหนึ่ง!`, 600);
  if (f.hp > 0 && move.effect && Math.random() < 0.35) {
    if (move.effect === "stun" && !f.stun && !f.stunImmune) {
      f.stun = true;
      dizzy(spot(keyOf(foe)));
      render();
      await say(`${who(foe)} ถูกสตัน!`, 700);
    } else if (move.effect === "burn" && !f.burn) {
      f.burn = 3;
      flames(spot(keyOf(foe)), 18);
      render();
      await say(`${who(foe)} ติดไฟ!`, 700);
    }
  }
}

async function useItem(side, item, target) {
  side.bag[item]--;
  if (side.bag === save.bag) persist();
  const m = active(side);
  const p = spot(keyOf(side));
  const used = `${side.label} ใช้ ${ITEMS[item].name}!`;
  if (item === "potion" || item === "superpotion") {
    m.hp = Math.min(m.maxHp, m.hp + (item === "potion" ? Math.round(m.maxHp * 0.5) : m.maxHp));
    healFx(p);
    render();
    return say(`${used}\n${who(side)} ฟื้น HP!`);
  }
  if (item === "ether") {
    for (const mv of m.moves) mv.pp = mv.maxPp;
    healFx(p);
    return say(`${used}\nPP ของ ${who(side)} เต็มแล้ว!`);
  }
  if (item === "xattack") {
    m.buff = Math.min(2, m.buff + 1);
    auraFx(p, "#ff5a3a");
    render();
    return say(`${used}\nพลังโจมตีของ ${who(side)} เพิ่มขึ้น!`);
  }
  if (item === "revive") {
    const x = side.team[target];
    x.hp = Math.round(x.maxHp / 2);
    x.burn = 0;
    x.stun = false;
    render();
    return say(`${used}\n${x.hero.name} กลับมาสู้ได้อีกครั้ง!`);
  }
}

async function switchTo(side, index) {
  const old = active(side);
  old.buff = 0;
  old.guard = false;
  await say(`${old.hero.name} กลับมาก่อน!`, 600);
  side.active = index;
  render();
  const s = $(`${keyOf(side)}Sprite`);
  s.classList.remove("enter");
  void s.offsetWidth;
  s.classList.add("enter");
  await say(`ไปเลย ${active(side).hero.name}!`, 700);
}

/** After a turn: anyone at 0 HP faints and its side sends in the next hero. Returns the winner if a side is out. */
async function checkFaints(cur) {
  for (const side of [sides[1 - cur], sides[cur]]) {
    const m = active(side);
    if (m.hp > 0) continue;
    render();
    await say(`${who(side)} หมดแรง!`, 900);
    if (!alive(side).length) return sides[1 - side.n];
    let index;
    if (side.ctrl === "cpu") index = cpuReplacement(side);
    else {
      $("msg").textContent = "จะส่งใครออกไป?";
      index = await teamMenu(side, false);
    }
    side.active = index;
    render();
    const s = $(`${keyOf(side)}Sprite`);
    s.classList.remove("enter");
    void s.offsetWidth;
    s.classList.add("enter");
    await say(side.ctrl === "cpu" ? `CPU ส่ง ${active(side).hero.name} ออกมา!` : `ไปเลย ${active(side).hero.name}!`, 800);
  }
  return null;
}

async function gameOver(winner, why) {
  const loser = sides[1 - winner.n];
  if (why !== "run") await say(`${loser.label} ไม่มีฮีโร่เหลือแล้ว!`, 900);
  await say(winner.n === 0 ? "คุณชนะ! 🎉" : "คุณแพ้... ลองใหม่อีกครั้ง!", 600);
  {
    // Coins to spend in the shop: more for a win, more still for each hero left standing.
    const prize = winner.n === 0 ? 300 + 100 * alive(winner).length : why === "run" ? 0 : 100;
    if (prize) {
      save.coins += prize;
      persist();
      await say(`ได้รับ ${prize} เหรียญ! (รวม ${coinText()})`, 1000);
    }
  }
  $("msg").textContent = "จะทำอะไรต่อ?";
  const i = await menu($("cmdbox"), [{ label: "เล่นอีกครั้ง" }, { label: "เลือกทีมใหม่" }, { label: "หน้าแรก" }], { cols: 2, cls: "list", back: false });
  if (i === 0) {
    return startBattle(lastTeams[0], cpuTeam(lastTeams[0]));
  }
  if (i === 1) {
    const team = await selectTeam();
    if (!team) return titleScreen();
    return startBattle(team, cpuTeam(team));
  }
  titleScreen();
}

// ---------- Human turn: FIGHT / BAG / TEAM / RUN ----------

async function humanAction(side) {
  let last = 0;
  for (;;) {
    $("msg").textContent = `จะให้ ${active(side).hero.name}\nทำอะไรดี?`;
    const i = await menu($("cmdbox"), ["FIGHT", "BAG", "TEAM", "RUN"].map((label) => ({ label })), { back: false, start: last });
    last = i;
    if (i === 0) {
      const move = await fightMenu(side);
      if (move) return { kind: "move", move };
    } else if (i === 1) {
      const a = await bagMenu(side);
      if (a) return a;
    } else if (i === 2) {
      const index = await teamMenu(side, true);
      if (index >= 0) return { kind: "switch", index };
    } else {
      $("msg").textContent = "หนีจากการต่อสู้จริงๆ เหรอ?";
      const yes = await menu($("cmdbox"), [{ label: "ใช่" }, { label: "ไม่" }], { start: 1 });
      if (yes === 0) return { kind: "run" };
    }
  }
}

async function fightMenu(side) {
  const m = active(side);
  const foe = active(sides[1 - side.n]);
  const effTxt = (mv) => {
    if (!mv.power) return { heal: "ฟื้น HP", buff: "เพิ่มพลัง", guard: "ป้องกัน" }[mv.effect];
    const e = typeMult(m.type, foe.type);
    const extra = mv.effect === "stun" ? " · สตัน" : mv.effect === "burn" ? " · ติดไฟ" : "";
    return `พลัง ${mv.power}${extra}${e > 1 ? " · ได้ผลดี!" : e < 1 ? " · ได้ผลน้อย" : ""}`;
  };
  const opts = m.moves.map((mv) => ({
    label: `${mv.name}<small>PP ${mv.pp}/${mv.maxPp} · ${effTxt(mv)}</small>`,
    disabled: mv.pp <= 0,
    onFocus: () => ($("msg").innerHTML = `<span class="desc">${mv.desc}</span>`),
  }));
  if (m.moves.every((mv) => mv.pp <= 0)) {
    // Out of PP: struggle with a weak basic hit, like the classic games.
    await say(`${m.hero.name} ไม่มี PP เหลือแล้ว!`, 600);
    return { name: "STRUGGLE", power: 30, pp: 1, maxPp: 1, acc: 100, effect: null };
  }
  const i = await menu($("cmdbox"), opts, { cls: "moves" });
  return i >= 0 ? m.moves[i] : null;
}

async function bagMenu(side) {
  const m = active(side);
  const fainted = side.team.map((x, i) => [x, i]).filter(([x]) => x.hp <= 0);
  const ids = Object.keys(ITEMS).filter((id) => side.bag[id] > 0);
  if (!ids.length) {
    await say("กระเป๋าว่างเปล่า!\nซื้อไอเทมได้ที่ SHOP ในหน้าแรก", 1300);
    return null;
  }
  const usable = {
    potion: m.hp < m.maxHp,
    superpotion: m.hp < m.maxHp,
    ether: m.moves.some((mv) => mv.pp < mv.maxPp),
    xattack: m.buff < 2,
    revive: fainted.length > 0,
  };
  $("msg").textContent = "ใช้ไอเทมไหน?";
  const i = await menu(
    $("cmdbox"),
    ids.map((id) => ({ label: `${ITEMS[id].name} ×${side.bag[id]}<small>${ITEMS[id].desc}</small>`, disabled: !usable[id] })),
    { cols: 2, cls: "list wide" },
  );
  if (i < 0) return null;
  if (ids[i] !== "revive") return { kind: "item", item: ids[i] };
  $("msg").textContent = "ชุบชีวิตใคร?";
  const j = await menu($("cmdbox"), fainted.map(([x]) => ({ label: x.hero.name })), { cols: 2, cls: "list" });
  return j >= 0 ? { kind: "item", item: "revive", target: fainted[j][1] } : null;
}

/** Pick a team member. `canBack` is false when a fainted hero must be replaced. Returns the index or -1. */
async function teamMenu(side, canBack) {
  if (canBack) $("msg").textContent = "สลับไปใช้ใคร?";
  const opts = side.team.map((x, i) => ({
    label: `${x.hero.name}<small>${TYPES[x.type].name} · HP ${Math.ceil(x.hp)}/${x.maxHp}${i === side.active ? " · กำลังสู้" : ""}</small>`,
    disabled: x.hp <= 0 || i === side.active,
  }));
  const start = opts.findIndex((o) => !o.disabled);
  const i = await menu($("cmdbox"), opts, { cols: 2, cls: "list wide", back: canBack, start: Math.max(0, start) });
  return i;
}

// ---------- CPU ----------

async function cpuAction(side) {
  await say(`${who(side)} กำลังคิด...`, 300);
  const m = active(side);
  const foeSide = sides[1 - side.n];
  const f = active(foeSide);
  const frac = m.hp / m.maxHp;
  if (frac < 0.3 && side.bag.potion && Math.random() < 0.6) return { kind: "item", item: "potion" };
  const fainted = side.team.findIndex((x) => x.hp <= 0);
  if (fainted >= 0 && side.bag.revive && Math.random() < 0.4) return { kind: "item", item: "revive", target: fainted };
  // Swap out of a bad type matchup now and then.
  if (typeMult(f.type, m.type) > 1 && Math.random() < 0.35) {
    const better = side.team.findIndex((x, i) => i !== side.active && x.hp > 0 && typeMult(f.type, x.type) <= 1);
    if (better >= 0) return { kind: "switch", index: better };
  }
  const eff = typeMult(m.type, f.type);
  let best = null;
  let bestScore = -1;
  for (const mv of m.moves) {
    if (mv.pp <= 0) continue;
    let score;
    if (mv.effect === "heal") score = frac < 0.5 ? 130 : 0;
    else if (mv.effect === "buff") score = m.buff < 2 && frac > 0.6 ? 60 : 0;
    else if (mv.effect === "guard") score = m.guard ? 0 : 22;
    else {
      const expected = mv.power * m.atk * 0.42 * eff * (1 + m.buff * 0.25) * 0.92;
      score = mv.power * eff * (mv.acc / 100) + (expected >= f.hp ? 120 : 0);
      if (mv.effect && !f.stun && !f.burn) score += 12;
    }
    score += rand(0, 25);
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  if (!best) return { kind: "move", move: { name: "STRUGGLE", power: 30, pp: 1, maxPp: 1, acc: 100, effect: null } };
  return { kind: "move", move: best };
}

function cpuReplacement(side) {
  const f = active(sides[1 - side.n]);
  const options = side.team.map((x, i) => [x, i]).filter(([x]) => x.hp > 0);
  options.sort((a, b) => typeMult(b[0].type, f.type) - typeMult(a[0].type, f.type) || b[0].hp - a[0].hp);
  return options[0][1];
}

titleScreen();
