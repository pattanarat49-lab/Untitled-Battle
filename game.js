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

// Skills are read from their Riftborn description: what they say they do decides what they do here.
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
  if (skill.kind === "onepunch") return { ...base, power: 220, pp: 1, acc: 100, effect: null };
  if (skill.kind === "deathnote") return { ...base, power: 160, pp: 1, acc: 75, effect: null };
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

/** A hero's four moves: its basic attack, its two Riftborn skills, then fillers. */
function movesOf(hero) {
  const moves = [{ name: TYPES[hero.attack].basic, desc: "การโจมตีพื้นฐาน", power: 40, pp: 30, acc: 100, effect: null }];
  hero.skills.forEach((s, i) => moves.push(classify(s, i)));
  for (const f of FILLERS) {
    if (moves.length >= 4) break;
    if (!moves.some((m) => m.effect === f.effect && (f.effect || m.power === f.power))) moves.push({ ...f });
  }
  return moves.map((m) => ({ ...m, maxPp: m.pp }));
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

let mode = "cpu";

async function titleScreen() {
  show("title");
  const box = $("modeMenu");
  const labels = [...box.children].map((b) => b.innerHTML);
  const i = await menu(box, labels.map((label) => ({ label })), { cols: 1, back: false });
  mode = i === 1 ? "pvp" : "cpu";
  const p1 = await selectTeam(1);
  if (!p1) return titleScreen();
  let p2;
  if (mode === "pvp") {
    p2 = await selectTeam(2);
    if (!p2) return titleScreen();
  } else {
    p2 = shuffle(HEROES.map((h) => h.id).filter((id) => !p1.includes(id))).slice(0, TEAM_SIZE);
  }
  startBattle(p1, p2);
}

// ---------- Team select ----------

function heroInfoHtml(id) {
  const h = BY_ID[id];
  const m = makeMon(id);
  const t = TYPES[h.attack];
  const moves = m.moves.map((mv) => `<b>${mv.name}</b>${mv.power ? ` (${mv.power})` : ""} ${mv.desc}`).join("<br>");
  return `<b style="font-size:16px">${h.name}</b> · ${h.role} · <span style="color:${t.color};filter:brightness(1.6)">${t.name}</span> · HP ${m.maxHp}<br>${moves}`;
}

function selectTeam(player) {
  return new Promise((resolve) => {
    show("select");
    const picked = [];
    const grid = $("grid");
    const search = $("search");
    search.value = "";
    $("selectTitle").innerHTML = `<span class="p${player}">PLAYER ${player}</span>: เลือกทีม ${TEAM_SIZE} ตัว`;
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
let view = 0; // the side shown at the bottom (with HP numbers)
let lastTeams = null;

function makeSide(n, ids, ctrl) {
  return {
    n,
    label: ctrl === "cpu" ? "CPU" : `PLAYER ${n + 1}`,
    color: n === 0 ? "var(--p1)" : "var(--p2)",
    ctrl,
    team: ids.map(makeMon),
    active: 0,
    bag: { potion: 2, ether: 1, revive: 1 },
  };
}
const active = (s) => s.team[s.active];
const alive = (s) => s.team.filter((m) => m.hp > 0);
/** "Captain Steel" for your own hero, "Captain Steel ของ CPU" for the other side's. */
const who = (side) => (mode === "cpu" && side.n === 1 ? `${active(side).hero.name} ของ CPU` : active(side).hero.name);

function hpColor(frac) {
  return frac > 0.5 ? "var(--hp-green)" : frac > 0.2 ? "var(--hp-yellow)" : "var(--hp-red)";
}

/** Draws both info boxes and sprites. `bottom` is the side shown nearest the player. */
function render() {
  const pairs = [
    [sides[view], "me"],
    [sides[1 - view], "foe"],
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
  if (mode === "pvp") {
    $("turnTag").textContent = `${sides[view].label}'S TURN`;
    $("turnTag").style.background = sides[view].color;
  } else $("turnTag").textContent = "";
}

function setView(n) {
  if (view === n) return;
  view = n;
  for (const k of ["me", "foe"]) $(`${k}Sprite`).classList.remove("faint");
  render();
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

/** Centre of a sprite on the stage, for effects. */
function spot(k) {
  return k === "me" ? { x: 240, y: 300 } : { x: 704, y: 140 };
}
const keyOf = (side) => (side.n === view ? "me" : "foe");

async function burstAt(k, color) {
  const { x, y } = spot(k);
  const b = document.createElement("div");
  b.className = "burst";
  b.style.left = `${x}px`;
  b.style.top = `${y}px`;
  b.style.background = `radial-gradient(circle, #fff 0 15%, ${color} 35%, transparent 70%)`;
  $("fx").appendChild(b);
  setTimeout(() => b.remove(), 600);
}

async function attackAnim(side, move, foeSide) {
  const k = keyOf(side);
  const fk = keyOf(foeSide);
  const sprite = $(`${k}Sprite`);
  const color = FX_COLORS[active(side).type];
  sprite.classList.add(`lunge-${k}`);
  await sleep(180);
  sprite.classList.remove(`lunge-${k}`);
  if (active(side).type !== "punch" && active(side).type !== "sword") {
    // Ranged heroes throw a shot across the field.
    const from = spot(k);
    const to = spot(fk);
    const orb = document.createElement("div");
    orb.className = "orb";
    orb.style.background = `radial-gradient(circle, #fff 0 25%, ${color} 55%, transparent 75%)`;
    orb.style.left = `${from.x}px`;
    orb.style.top = `${from.y}px`;
    $("fx").appendChild(orb);
    await sleep(20);
    orb.style.left = `${to.x}px`;
    orb.style.top = `${to.y}px`;
    await sleep(360);
    orb.remove();
  }
  burstAt(fk, move.power >= 80 ? EFFECT_COLORS.burn : color);
}

async function hitAnim(side) {
  const k = keyOf(side);
  const s = $(`${k}Sprite`);
  s.classList.remove("hit");
  void s.offsetWidth;
  s.classList.add("hit");
  $("battle").querySelector(".field").classList.add("shake");
  await sleep(400);
  $("battle").querySelector(".field").classList.remove("shake");
  await sleep(300);
  s.classList.remove("hit");
}

function healAnim(side) {
  const { x, y } = spot(keyOf(side));
  const r = document.createElement("div");
  r.className = "heal-ring";
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  $("fx").appendChild(r);
  setTimeout(() => r.remove(), 800);
}

// ---------- Battle flow ----------

function startBattle(t1, t2) {
  lastTeams = [t1, t2];
  sides = [makeSide(0, t1, "human"), makeSide(1, t2, mode === "pvp" ? "human" : "cpu")];
  view = 0;
  show("battle");
  $("cmdbox").innerHTML = "";
  render();
  battle();
}

async function battle() {
  const [a, b] = sides;
  await say(mode === "cpu" ? `CPU ท้าสู้!\nCPU ส่ง ${active(b).hero.name} ออกมา!` : `PLAYER 2 ส่ง ${active(b).hero.name} ออกมา!`, 1100);
  await say(`ไปเลย ${active(a).hero.name}!`, 700);
  // The faster hero moves first; then the two sides simply take turns.
  let cur = active(a).speed === active(b).speed ? (Math.random() < 0.5 ? 0 : 1) : active(a).speed > active(b).speed ? 0 : 1;
  if (cur === 1) await say(`${who(b)} เร็วกว่า ได้เริ่มก่อน!`, 700);
  for (;;) {
    if (mode === "pvp") setView(cur);
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
    await say(mode === "cpu" ? `${side.label} หนีออกจากการต่อสู้!` : `${side.label} ยอมแพ้!`);
    return { winner: foe, text: "run" };
  }
  if (action.kind === "move") await useMove(side, action.move);
  if (action.kind === "item") await useItem(side, action.item, action.target);
  if (action.kind === "switch") await switchTo(side, action.index);
  const me = active(side);
  if (me.hp > 0 && me.burn > 0) {
    me.burn--;
    me.hp = Math.max(0, me.hp - Math.ceil(me.maxHp / 12));
    burstAt(keyOf(side), EFFECT_COLORS.burn);
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
    healAnim(side);
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.5));
    m.burn = 0;
    render();
    return say(m.hp > before ? `${who(side)} ฟื้นพลังชีวิต!` : `แต่ HP เต็มอยู่แล้ว!`);
  }
  if (move.effect === "buff") {
    burstAt(keyOf(side), EFFECT_COLORS.buff);
    if (m.buff >= 2) return say(`พลังโจมตีของ ${who(side)} สูงสุดแล้ว!`);
    m.buff++;
    render();
    return say(`พลังโจมตีของ ${who(side)} เพิ่มขึ้น!`);
  }
  if (move.effect === "guard") {
    burstAt(keyOf(side), EFFECT_COLORS.guard);
    m.guard = true;
    render();
    return say(`${who(side)} ตั้งการ์ดป้องกัน!`);
  }
  if (Math.random() * 100 >= move.acc) {
    await sleep(200);
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
      render();
      await say(`${who(foe)} ถูกสตัน!`, 700);
    } else if (move.effect === "burn" && !f.burn) {
      f.burn = 3;
      render();
      await say(`${who(foe)} ติดไฟ!`, 700);
    }
  }
}

async function useItem(side, item, target) {
  side.bag[item]--;
  if (item === "potion") {
    const m = active(side);
    m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.5));
    healAnim(side);
    render();
    return say(`${side.label} ใช้ POTION!\n${who(side)} ฟื้น HP!`);
  }
  if (item === "ether") {
    for (const mv of active(side).moves) mv.pp = mv.maxPp;
    healAnim(side);
    return say(`${side.label} ใช้ ETHER!\nPP ของ ${who(side)} เต็มแล้ว!`);
  }
  if (item === "revive") {
    const m = side.team[target];
    m.hp = Math.round(m.maxHp / 2);
    m.burn = 0;
    m.stun = false;
    render();
    return say(`${side.label} ใช้ REVIVE!\n${m.hero.name} กลับมาสู้ได้อีกครั้ง!`);
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
      if (mode === "pvp") setView(side.n);
      $("msg").textContent = `${side.label}: จะส่งใครออกไป?`;
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
  await say(mode === "cpu" ? (winner.n === 0 ? "คุณชนะ! 🎉" : "คุณแพ้... ลองใหม่อีกครั้ง!") : `${winner.label} ชนะ! 🎉`, 600);
  $("msg").textContent = "จะทำอะไรต่อ?";
  const i = await menu($("cmdbox"), [{ label: "เล่นอีกครั้ง" }, { label: "เลือกทีมใหม่" }, { label: "หน้าแรก" }], { cols: 1, cls: "list", back: false });
  if (i === 0) {
    const t2 = mode === "cpu" ? shuffle(HEROES.map((h) => h.id).filter((id) => !lastTeams[0].includes(id))).slice(0, TEAM_SIZE) : lastTeams[1];
    return startBattle(lastTeams[0], t2);
  }
  if (i === 1) {
    const p1 = await selectTeam(1);
    if (!p1) return titleScreen();
    let p2 = shuffle(HEROES.map((h) => h.id).filter((id) => !p1.includes(id))).slice(0, TEAM_SIZE);
    if (mode === "pvp") {
      p2 = await selectTeam(2);
      if (!p2) return titleScreen();
    }
    return startBattle(p1, p2);
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
      $("msg").textContent = mode === "cpu" ? "หนีจากการต่อสู้จริงๆ เหรอ?" : "ยอมแพ้จริงๆ เหรอ?";
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
    onFocus: () => ($("msg").textContent = mv.desc || mv.name),
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
  const items = [
    { item: "potion", label: "POTION", desc: "ฟื้น HP 50%", ok: m.hp < m.maxHp },
    { item: "ether", label: "ETHER", desc: "ฟื้น PP ทุกสกิล", ok: m.moves.some((mv) => mv.pp < mv.maxPp) },
    { item: "revive", label: "REVIVE", desc: "ชุบชีวิตเพื่อนร่วมทีม 50%", ok: fainted.length > 0 },
  ];
  $("msg").textContent = "ใช้ไอเทมไหน?";
  const i = await menu(
    $("cmdbox"),
    items.map((it) => ({ label: `${it.label} ×${side.bag[it.item]}<small>${it.desc}</small>`, disabled: !side.bag[it.item] || !it.ok })),
    { cols: 1, cls: "list wide" },
  );
  if (i < 0) return null;
  const it = items[i];
  if (it.item !== "revive") return { kind: "item", item: it.item };
  $("msg").textContent = "ชุบชีวิตใคร?";
  const j = await menu($("cmdbox"), fainted.map(([x]) => ({ label: x.hero.name })), { cols: 1, cls: "list" });
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
  const i = await menu($("cmdbox"), opts, { cols: 1, cls: "list wide", back: canBack, start: Math.max(0, start) });
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
