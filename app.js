/* Fan-made arcade game inspired by a fictional universe vibe. No official assets. */

const STORAGE_KEY = "mysticFallsMini_v1";

// Owner-only Discord webhook (IMPORTANT: in a static website, any user can still view this in the page source.
// To keep it truly private, you need a small backend/proxy endpoint.)
const OWNER_DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1487066796790911037/uL3CctgCG9KRbBPjykLhGnFxawls-UxsjyZjHEXdaokfYspj8WIqk1hJ0CA1cFTP09V6";

// Send a message once when a player reaches any milestone.
const SCORE_MILESTONES = [200, 500, 1000, 2000, 5000];

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function safeText(s) {
  return String(s ?? "");
}

// --- Characters (lightweight perks) ---
const CHARACTERS = [
  {
    id: "elena",
    name: "Elena",
    archetype: "قلب قوي",
    tags: ["شجاعة", "تعاطف", "حدس"],
    vibe: "تحمي الناس حتى لو دفعت الثمن.",
    price: 0,
    ability: {
      name: "Gilbert Resolve",
      desc: "قلب إضافي في بداية الجولة."
    },
    affinity: { diplomacy: 2, stealth: 0, power: 0, lore: 1 }
  },
  {
    id: "stefan",
    name: "Stefan",
    archetype: "ضمير + سيطرة",
    tags: ["انضباط", "حماية", "هدوء"],
    vibe: "يمشي على خط رفيع بين القوة والضمير.",
    price: 0,
    ability: {
      name: "Control the Ripper",
      desc: "الـHunters أبطأ شوي طول الجولة."
    },
    affinity: { diplomacy: 1, stealth: 1, power: 1, lore: 1 }
  },
  {
    id: "damon",
    name: "Damon",
    archetype: "فوضى ذكية",
    tags: ["جرأة", "سخرية", "سرعة قرار"],
    vibe: "يختصر الطريق… حتى لو كان خطير.",
    price: 400,
    ability: {
      name: "Salvatore Dash",
      desc: "Dash أسرع (كولداون أقل)."
    },
    affinity: { diplomacy: 0, stealth: 1, power: 2, lore: 0 }
  },
  {
    id: "bonnie",
    name: "Bonnie",
    archetype: "سحر + تضحية",
    tags: ["حدس", "تركيز", "قوة داخلية"],
    vibe: "توازن بين القوة والمسؤولية.",
    price: 450,
    ability: {
      name: "Witchcraft",
      desc: "Magnet أقوى في البداية (يجذب الـOrbs أكثر)."
    },
    affinity: { diplomacy: 1, stealth: 0, power: 1, lore: 2 }
  },
  {
    id: "caroline",
    name: "Caroline",
    archetype: "نظام + سرعة",
    tags: ["تنظيم", "تفاصيل", "إصرار"],
    vibe: "لما تتوتر… تتحول لقائدة.",
    price: 0,
    ability: {
      name: "Vampire Precision",
      desc: "سرعة حركة أعلى شوي."
    },
    affinity: { diplomacy: 1, stealth: 1, power: 0, lore: 1 }
  },
  {
    id: "klaus",
    name: "Klaus",
    archetype: "هيبة",
    tags: ["نفوذ", "تهديد", "تكتيك"],
    vibe: "يحب اللعبة… ويكره الخسارة.",
    price: 500,
    ability: {
      name: "Hybrid Instinct",
      desc: "نقاط أعلى من الـOrbs بس الـHunters أشد."
    },
    affinity: { diplomacy: 0, stealth: 0, power: 2, lore: 1 }
  }
];

// Game tuning
const GAME = {
  baseGoal: 8,
  goalGrowth: 4,
  orbValue: 10,
  stageBonus: 80,
  hitPenalty: 25,
  maxLives: 3,
  winStage: 10
};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --- State (profiles) ---
function newId(prefix = "p") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const defaultProfile = () => ({
  id: newId("profile"),
  name: "",
  discordUser: "",
  bio: "",
  score: 0,
  level: 1,
  selectedCharacterId: null,
  unlocks: { notifiedMilestones: [], ownedCharacters: ["elena", "stefan", "caroline"] },
  progress: {
    bestStage: 1,
    upgrades: { speed: 0, dash: 0, magnet: 0, shield: 0 },
    inventory: { revive: 0, hunterSlow: 0 },
    flags: { highRoleToken: false }
  }
});

const defaultState = () => ({
  activeProfileId: null,
  profiles: [],
  settings: {
    reduceMotion: false,
    // owner-only webhook is not stored here
  }
});

let state = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = defaultState();
      const p = defaultProfile();
      state.profiles = [p];
      state.activeProfileId = p.id;
      return;
    }
    const s = JSON.parse(raw);
    state = { ...defaultState(), ...s, settings: { ...defaultState().settings, ...(s.settings || {}) } };

    // Clean up old webhook settings (if any)
    if (state.settings && "discordWebhook" in state.settings) delete state.settings.discordWebhook;
    if (state.settings && "discordNotify" in state.settings) delete state.settings.discordNotify;

    // Migration from older single-player format
    const looksOld = typeof s.score === "number" || typeof s.level === "number" || typeof s.playerName === "string";
    if (looksOld && (!Array.isArray(state.profiles) || state.profiles.length === 0)) {
      const p = defaultProfile();
      p.name = s.playerName || "";
      p.discordUser = "";
      p.score = Number(s.score || 0);
      p.level = Number(s.level || 1);
      p.selectedCharacterId = s.selectedCharacterId ?? null;
      p.unlocks = {
        notifiedMilestones: []
      };
      state.profiles = [p];
      state.activeProfileId = p.id;
    }

    if (!Array.isArray(state.profiles)) state.profiles = [];
    if (!state.activeProfileId && state.profiles[0]) state.activeProfileId = state.profiles[0].id;
    if (state.profiles.length === 0) {
      const p = defaultProfile();
      state.profiles = [p];
      state.activeProfileId = p.id;
    }

    // Ensure new fields exist for all profiles
    for (const p of state.profiles) {
      p.unlocks = p.unlocks || { notifiedMilestones: [], ownedCharacters: ["elena", "stefan", "caroline"] };
      if (!Array.isArray(p.unlocks.notifiedMilestones)) p.unlocks.notifiedMilestones = [];
      if (!Array.isArray(p.unlocks.ownedCharacters)) p.unlocks.ownedCharacters = ["elena", "stefan", "caroline"];
      for (const freeId of ["elena", "stefan", "caroline"]) {
        if (!p.unlocks.ownedCharacters.includes(freeId)) p.unlocks.ownedCharacters.push(freeId);
      }
      p.progress = p.progress || { bestStage: 1, upgrades: { speed: 0, dash: 0, magnet: 0, shield: 0 } };
      p.progress.upgrades = p.progress.upgrades || { speed: 0, dash: 0, magnet: 0, shield: 0 };
      for (const k of ["speed", "dash", "magnet", "shield"]) p.progress.upgrades[k] = Number(p.progress.upgrades[k] || 0);
      p.progress.bestStage = Math.max(1, Number(p.progress.bestStage || 1));
      p.progress.inventory = p.progress.inventory || { revive: 0, hunterSlow: 0 };
      p.progress.inventory.revive = Number(p.progress.inventory.revive || 0);
      p.progress.inventory.hunterSlow = Number(p.progress.inventory.hunterSlow || 0);
      p.progress.flags = p.progress.flags || { highRoleToken: false };
      p.progress.flags.highRoleToken = !!p.progress.flags.highRoleToken;
      p.bio = typeof p.bio === "string" ? p.bio : "";
    }
  } catch {
    state = defaultState();
    const p = defaultProfile();
    state.profiles = [p];
    state.activeProfileId = p.id;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getActiveProfile() {
  try {
    if (!state || typeof state !== "object") state = defaultState();
    if (!Array.isArray(state.profiles) || state.profiles.length === 0) {
      const p0 = defaultProfile();
      state.profiles = [p0];
      state.activeProfileId = p0.id;
      saveState();
      return p0;
    }
    const p = state.profiles.find((x) => x && x.id === state.activeProfileId) || state.profiles[0];
    if (!p) {
      const p0 = defaultProfile();
      state.profiles = [p0];
      state.activeProfileId = p0.id;
      saveState();
      return p0;
    }
    if (p.id !== state.activeProfileId) state.activeProfileId = p.id;
    return p;
  } catch {
    state = defaultState();
    const p0 = defaultProfile();
    state.profiles = [p0];
    state.activeProfileId = p0.id;
    try {
      saveState();
    } catch {
      // ignore
    }
    return p0;
  }
}

function xpForLevel(level) {
  // Simple curve: 0..n uses score thresholds. Keep it friendly.
  return 120 + (level - 1) * 90;
}

function recalcLevel() {
  let lvl = 1;
  const p = getActiveProfile();
  p.score = Number.isFinite(Number(p.score)) ? Number(p.score) : 0;
  let remaining = p.score;
  while (remaining >= xpForLevel(lvl) && lvl < 10) {
    remaining -= xpForLevel(lvl);
    lvl += 1;
  }
  p.level = lvl;
}

async function postToOwnerWebhook({ profileName, discordUser, milestone, score, level }) {
  const url = (OWNER_DISCORD_WEBHOOK_URL || "").trim();
  if (!url) return;
  const p = getActiveProfile();
  const content = [
    `**Mystic Falls**`,
    `وصل لاعب لحد نقاط!`,
    `اللاعب: **${profileName}**${discordUser ? ` (Discord: ${discordUser})` : ""}`,
    `الحد: **${milestone}**`,
    `المجموع: **${score}** | المستوى: **${level}**`
  ].join("\n");

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch {
    // ignore network failures; gameplay should not break
  }
}

async function postRunSummaryToOwnerWebhook({ profileName, discordUser, earned, stage }) {
  const url = (OWNER_DISCORD_WEBHOOK_URL || "").trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: [
          `**Mystic Falls**`,
          `ملخص جولة`,
          `اللاعب: **${profileName}**${discordUser ? ` (Discord: ${discordUser})` : ""}`,
          `النقاط المكتسبة: **${earned}**`,
          `وصل لمرحلة: **${stage}**`
        ].join("\n")
      })
    });
  } catch {
    // ignore
  }
}

async function postAuthToOwnerWebhook({ profileName, discordUser, bio }) {
  const url = (OWNER_DISCORD_WEBHOOK_URL || "").trim();
  if (!url) return;
  const content = [
    `**Mystic Falls**`,
    `تسجيل دخول جديد`,
    `الاسم: **${profileName}**`,
    `Discord: **${discordUser}**`,
    `البايو: **${bio}**`
  ].join("\n");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch {
    // ignore
  }
}

async function postPurchaseToOwnerWebhook({ profileName, discordUser, bio, itemName, price, note }) {
  const url = (OWNER_DISCORD_WEBHOOK_URL || "").trim();
  if (!url) return;
  const content = [
    `**Mystic Falls**`,
    `شراء من المتجر`,
    `الاسم: **${profileName}**`,
    `Discord: **${discordUser}**`,
    `البايو: **${bio}**`,
    `العنصر: **${itemName}**`,
    `السعر: **${price}**`,
    note ? `ملاحظة: **${note}**` : ""
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch {
    // ignore
  }
}

function checkMilestonesAndNotify() {
  const p = getActiveProfile();
  p.unlocks = p.unlocks || { loreSeen: [], notifiedMilestones: [] };
  p.unlocks.notifiedMilestones = Array.isArray(p.unlocks.notifiedMilestones) ? p.unlocks.notifiedMilestones : [];

  for (const m of SCORE_MILESTONES) {
    if (p.score >= m && !p.unlocks.notifiedMilestones.includes(m)) {
      p.unlocks.notifiedMilestones.push(m);
      saveState();
      void postToOwnerWebhook({
        profileName: p.name?.trim() ? p.name.trim() : "Player",
        discordUser: (p.discordUser || "").trim(),
        milestone: m,
        score: p.score,
        level: p.level
      });
    }
  }
}

function addScore(delta, reason = "") {
  const d = Math.round(delta);
  const p = getActiveProfile();
  p.score = Math.max(0, p.score + d);
  recalcLevel();
  saveState();
  renderHUD();
  if (reason) toast(`+${d} نقطة — ${reason}`);
  else toast(`+${d} نقطة`);
  if (d > 0) checkMilestonesAndNotify();
}

function spendScore(amount, reason = "شراء") {
  const p = getActiveProfile();
  if (p.score < amount) return false;
  p.score -= amount;
  recalcLevel();
  saveState();
  renderHUD();
  toast(`-${amount} نقطة — ${reason}`);
  return true;
}

// --- UI helpers ---
let toastT = null;
function toast(msg) {
  const id = "toast";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.right = "12px";
    el.style.bottom = "14px";
    el.style.zIndex = "50";
    el.style.maxWidth = "min(720px, calc(100vw - 24px))";
    el.style.margin = "0 auto";
    el.style.padding = "12px 14px";
    el.style.borderRadius = "16px";
    el.style.border = "1px solid rgba(255,255,255,0.14)";
    el.style.background = "rgba(10,12,22,0.88)";
    el.style.backdropFilter = "blur(10px)";
    el.style.color = "rgba(255,255,255,0.92)";
    el.style.boxShadow = "0 16px 38px rgba(0,0,0,0.35)";
    el.style.fontWeight = "800";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  if (toastT) window.clearTimeout(toastT);
  toastT = window.setTimeout(() => {
    el.style.opacity = "0";
  }, 2200);
}

// --- Admin (client-side only, not secure on static hosting) ---
const ADMIN_KEY =
  "6@73bqv%fvdw0fnw@f7#bi*6(8bwa#@1z26j6t2vyl=&#5t(zb";

function isAdminEnabled() {
  try {
    return sessionStorage.getItem("mf_admin") === "1";
  } catch {
    return false;
  }
}

function setAdminEnabled(v) {
  try {
    sessionStorage.setItem("mf_admin", v ? "1" : "0");
  } catch {
    // ignore
  }
}

function adminGrantPoints(amount) {
  const p = getActiveProfile();
  const n = Math.max(0, Math.floor(Number(amount || 0)));
  if (!Number.isFinite(n)) return false;
  p.score = Math.max(0, (p.score || 0) + n);
  recalcLevel();
  saveState();
  renderHUD();
  toast(`Admin: +${n} نقطة`);
  return true;
}

function adminSkipStage() {
  if (!run || run.ended) {
    toast("ابدأ الجولة أولاً");
    return;
  }
  toast("Admin: Skip Stage");
  nextStage();
}

function openAdminPanel() {
  if (!isAdminEnabled()) {
    const body = `
      <div style="display:grid;gap:10px;line-height:1.75">
        <div style="color:rgba(255,255,255,0.86)">
          أدخل المفتاح لتفعيل قائمة الأدمن (للجلسة الحالية فقط).
        </div>
        <input class="input" id="adminKeyInput" placeholder="Admin key" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </div>
    `;
    $("overlayTitle").textContent = "Admin";
    $("overlayBody").innerHTML = body;
    const actions = $("overlayActions");
    actions.innerHTML = "";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn--primary";
    ok.textContent = "تفعيل";
    ok.onclick = () => {
      const k = document.getElementById("adminKeyInput")?.value ?? "";
      if (String(k) === ADMIN_KEY) {
        setAdminEnabled(true);
        toast("تم تفعيل الأدمن");
        openAdminPanel();
      } else {
        toast("مفتاح غير صحيح");
      }
    };
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn--ghost";
    cancel.textContent = "إلغاء";
    cancel.onclick = () => overlayHide();
    actions.appendChild(ok);
    actions.appendChild(cancel);
    $("gameWrap").classList.add("has-overlay");
    $("overlay").hidden = false;
    return;
  }

  const body = `
    <div style="display:grid;gap:12px;line-height:1.75">
      <div style="color:rgba(255,255,255,0.84)">
        قائمة الأدمن مفعّلة (جلسة فقط).
      </div>
      <div class="q">
        <div class="q__title">إضافة نقاط</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input class="input" id="adminPointsInput" inputmode="numeric" placeholder="مثال: 999" style="max-width:220px" />
          <button class="btn btn--primary" id="adminPointsBtn" type="button">إضافة</button>
        </div>
      </div>
      <div class="q">
        <div class="q__title">Skip Stage</div>
        <div style="color:rgba(255,255,255,0.78)">يشتغل فقط أثناء الجولة.</div>
        <button class="btn btn--primary" id="adminSkipBtn" type="button">سكيب</button>
      </div>
    </div>
  `;
  $("overlayTitle").textContent = "Admin Panel";
  $("overlayBody").innerHTML = body;
  const actions = $("overlayActions");
  actions.innerHTML = "";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn--ghost";
  close.textContent = "إغلاق";
  close.onclick = () => overlayHide();

  const disable = document.createElement("button");
  disable.type = "button";
  disable.className = "btn btn--ghost";
  disable.textContent = "تعطيل";
  disable.onclick = () => {
    setAdminEnabled(false);
    toast("تم تعطيل الأدمن");
    overlayHide();
  };

  actions.appendChild(close);
  actions.appendChild(disable);
  $("gameWrap").classList.add("has-overlay");
  $("overlay").hidden = false;

  document.getElementById("adminPointsBtn")?.addEventListener("click", () => {
    const v = document.getElementById("adminPointsInput")?.value;
    adminGrantPoints(v);
  });
  document.getElementById("adminSkipBtn")?.addEventListener("click", () => adminSkipStage());
}

function renderHUD() {
  const p = getActiveProfile();
  $("hudProfile").textContent = p.name?.trim() ? p.name.trim() : "—";
  $("hudScore").textContent = String(p.score);
  $("hudLevel").textContent = String(p.level);

  const c = getSelectedCharacter();
  $("selectedCharacterChip").textContent = c ? `الشخصية: ${c.name} (${c.archetype})` : "ما اخترت أحد";
}

function getSelectedCharacter() {
  const p = getActiveProfile();
  return CHARACTERS.find((c) => c.id === p.selectedCharacterId) || null;
}

function isCharacterOwned(p, charId) {
  p.unlocks = p.unlocks || { notifiedMilestones: [], ownedCharacters: ["elena", "stefan", "caroline"] };
  if (!Array.isArray(p.unlocks.ownedCharacters)) p.unlocks.ownedCharacters = ["elena", "stefan", "caroline"];
  return p.unlocks.ownedCharacters.includes(charId);
}

async function purchaseCharacter(c) {
  const p = getActiveProfile();
  if (isCharacterOwned(p, c.id)) return true;
  const price = Number(c.price || 0);
  if (price <= 0) {
    p.unlocks.ownedCharacters.push(c.id);
    saveState();
    return true;
  }
  if (!spendScore(price, `شراء شخصية: ${c.name}`)) {
    toast("نقاطك ما تكفي");
    return false;
  }
  p.unlocks.ownedCharacters.push(c.id);
  saveState();
  toast(`تم شراء: ${c.name}`);
  void postPurchaseToOwnerWebhook({
    profileName: p.name?.trim() ? p.name.trim() : "—",
    discordUser: (p.discordUser || "").trim() || "—",
    bio: (p.bio || "").trim() || "—",
    itemName: `Character: ${c.name}`,
    price
  });
  return true;
}

function renderCharacters() {
  const box = $("characters");
  box.innerHTML = "";
  const p = getActiveProfile();
  const selected = p.selectedCharacterId;

  for (const c of CHARACTERS) {
    const owned = isCharacterOwned(p, c.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `char${c.id === selected ? " is-selected" : ""}${owned ? "" : " is-locked"}`;
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", `اختيار ${c.name}`);
    btn.addEventListener("click", () => {
      if (!owned) {
        overlayShow(
          "شخصية مقفلة",
          `${c.name} — ${c.archetype}\n\nالقدرة: ${c.ability?.name || "—"}\n${c.ability?.desc || ""}\n\nالسعر: ${c.price || 0} نقطة`,
          [
            {
              label: "شراء",
              primary: true,
              onClick: async () => {
                const ok = await purchaseCharacter(c);
                if (!ok) return;
                p.selectedCharacterId = c.id;
                saveState();
                overlayHide();
                renderCharacters();
                renderHUD();
              }
            },
            { label: "إلغاء", onClick: () => overlayHide() }
          ]
        );
        return;
      }
      p.selectedCharacterId = c.id;
      saveState();
      renderCharacters();
      renderHUD();
      toast(`تم اختيار: ${c.name}`);
    });

    const tagHtml = c.tags.map((t) => `<span class="tag">${t}</span>`).join("");
    const power = clamp(40 + (c.affinity.power + c.affinity.lore) * 18, 35, 95);

    btn.innerHTML = `
      <div class="char__row">
        <div>
          <div class="char__name">${safeText(c.name)}</div>
          <div class="char__tags">${tagHtml}</div>
        </div>
        <div class="char__power">
          <div>هيبة الليلة</div>
          <div class="bar" aria-hidden="true"><i style="width:${power}%"></i></div>
        </div>
      </div>
      <div class="char__bio">${safeText(c.vibe)}</div>
      <div class="char__bio" style="opacity:.88">
        القدرة: <strong>${safeText(c.ability?.name || "")}</strong> — ${safeText(c.ability?.desc || "")}
        ${owned ? "" : `<br/><strong>مقفلة</strong> — السعر: ${Number(c.price || 0)} نقطة`}
      </div>
    `;
    box.appendChild(btn);
  }
}

// --- Arcade game: Mystic Hunt (canvas) ---
let run = null;

function isTouchLike() {
  return matchMedia?.("(hover: none) and (pointer: coarse)")?.matches ?? false;
}

function overlayShow(title, body, actions = []) {
  $("overlayTitle").textContent = title;
  $("overlayBody").textContent = body;
  const box = $("overlayActions");
  box.innerHTML = "";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.primary ? "btn btn--primary" : "btn btn--ghost";
    b.textContent = a.label;
    b.addEventListener("click", a.onClick);
    box.appendChild(b);
  }
  $("gameWrap").classList.add("has-overlay");
  $("overlay").hidden = false;
}

function overlayHide() {
  $("gameWrap").classList.remove("has-overlay");
  $("overlay").hidden = true;
}

function joyInit() {
  const joy = $("joy");
  const knob = $("joyKnob");
  let pid = null;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function updateFromPointer(e) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = rect.width * 0.33;
    const mag = Math.hypot(dx, dy);
    const nx = mag > 0 ? dx / mag : 0;
    const ny = mag > 0 ? dy / mag : 0;
    const d = Math.min(max, mag);
    const kx = nx * d;
    const ky = ny * d;
    setKnob(kx, ky);
    if (run) {
      run.input.joyX = clamp(kx / max, -1, 1);
      run.input.joyY = clamp(ky / max, -1, 1);
    }
  }

  joy.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    joy.setPointerCapture(pid);
    updateFromPointer(e);
  });
  joy.addEventListener("pointermove", (e) => {
    if (pid !== e.pointerId) return;
    updateFromPointer(e);
  });
  joy.addEventListener("pointerup", (e) => {
    if (pid !== e.pointerId) return;
    pid = null;
    setKnob(0, 0);
    if (run) {
      run.input.joyX = 0;
      run.input.joyY = 0;
    }
  });
  joy.addEventListener("pointercancel", () => {
    pid = null;
    setKnob(0, 0);
    if (run) {
      run.input.joyX = 0;
      run.input.joyY = 0;
    }
  });
}

function ensureProgress(p) {
  p.progress = p.progress || { bestStage: 1, upgrades: { speed: 0, dash: 0, magnet: 0, shield: 0 } };
  p.progress.upgrades = p.progress.upgrades || { speed: 0, dash: 0, magnet: 0, shield: 0 };
  for (const k of ["speed", "dash", "magnet", "shield"]) p.progress.upgrades[k] = Number(p.progress.upgrades[k] || 0);
  p.progress.bestStage = Math.max(1, Number(p.progress.bestStage || 1));
  p.progress.inventory = p.progress.inventory || { revive: 0, hunterSlow: 0 };
  p.progress.inventory.revive = Number(p.progress.inventory.revive || 0);
  p.progress.inventory.hunterSlow = Number(p.progress.inventory.hunterSlow || 0);
  p.progress.flags = p.progress.flags || { highRoleToken: false };
  p.progress.flags.highRoleToken = !!p.progress.flags.highRoleToken;
}

function runResetUI() {
  $("goalHud").textContent = "0";
  $("gotHud").textContent = "0";
  $("livesHud").textContent = String(GAME.maxLives);
  $("stageChip").textContent = "مرحلة: 1";
  $("runChip").textContent = "0 نقطة في الجولة";
}

function spawnOrbs(count, w, h) {
  const orbs = [];
  for (let i = 0; i < count; i++) {
    orbs.push({ x: 40 + Math.random() * (w - 80), y: 40 + Math.random() * (h - 80), r: 7 + Math.random() * 3 });
  }
  return orbs;
}

function spawnHunters(count, w, h) {
  const hs = [];
  for (let i = 0; i < count; i++) {
    hs.push({ x: Math.random() < 0.5 ? 30 : w - 30, y: 30 + Math.random() * (h - 60), r: 12 });
  }
  return hs;
}

function updateRunHud() {
  if (!run) return;
  $("goalHud").textContent = String(run.goal);
  $("gotHud").textContent = String(run.got);
  $("livesHud").textContent = String(run.lives);
  $("stageChip").textContent = `مرحلة: ${run.stage}`;
  $("runChip").textContent = `${run.scoreThisRun} نقطة في الجولة`;
}

function clampPos(p) {
  p.x = clamp(p.x, p.r + 6, run.w - p.r - 6);
  p.y = clamp(p.y, p.r + 6, run.h - p.r - 6);
}

function pickUpgradeChoices() {
  const u = run.upgrades;
  const all = [
    { title: "سرعة +", body: "حركتك أسرع دائمًا.", can: () => u.speed < 6, apply: () => (u.speed += 1) },
    { title: "Dash أقوى", body: "اندفاع أسرع وكولداون أقل.", can: () => u.dash < 6, apply: () => (u.dash += 1) },
    { title: "Magnet", body: "يجذب الـOrbs القريبة لك.", can: () => u.magnet < 6, apply: () => (u.magnet += 1) },
    { title: "Shield", body: "يمنع ضرر مرة واحدة كل مرحلة.", can: () => u.shield < 4, apply: () => (u.shield += 1) }
  ].filter((x) => x.can());
  return shuffle(all).slice(0, 3);
}

function nextStage() {
  run.stage += 1;
  run.goal = GAME.baseGoal + (run.stage - 1) * GAME.goalGrowth;
  run.got = 0;
  run.orbs = spawnOrbs(run.goal, run.w, run.h);
  const hunterCount = 1 + Math.floor((run.stage - 1) / 2);
  run.hunters = spawnHunters(hunterCount, run.w, run.h);
  run._shieldUsed = false;

  run.scoreThisRun += GAME.stageBonus + run.stage * 10;
  updateRunHud();

  const p = getActiveProfile();
  ensureProgress(p);
  p.progress.bestStage = Math.max(p.progress.bestStage, run.stage);
  saveState();

  const picks = pickUpgradeChoices();
  overlayShow(
    `مرحلة ${run.stage - 1} اكتملت`,
    `اختر ترقية قبل ما تبدأ المرحلة ${run.stage}.\n(أفضل مرحلة لك: ${p.progress.bestStage})`,
    picks.map((x) => ({
      label: `${x.title} — ${x.body}`,
      primary: true,
      onClick: () => {
        x.apply();
        p.progress.upgrades = { ...run.upgrades };
        saveState();
        overlayHide();
      }
    }))
  );
}

function endRun() {
  if (!run || run.ended) return;
  run.ended = true;
  const earned = Math.max(0, run.scoreThisRun);
  addScore(earned, "Mystic Hunt");
  const p = getActiveProfile();
  void postRunSummaryToOwnerWebhook({
    profileName: p.name?.trim() ? p.name.trim() : "Player",
    discordUser: (p.discordUser || "").trim(),
    earned,
    stage: run.stage
  });
  overlayShow(
    "انتهت الجولة",
    `كسبت: ${earned} نقطة\nوصلت إلى مرحلة: ${run.stage}\n\nاضغط “ابدأ الجولة” للعب مرة ثانية.`,
    [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
  );
}

function startRun() {
  if (!enforceProfileSetup()) return;
  const p = getActiveProfile();
  ensureProgress(p);

  const canvas = $("gameCanvas");
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(320, Math.floor(rect.width));
  const H = Math.max(320, Math.floor(rect.height));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const u = { ...p.progress.upgrades };
  const char = getSelectedCharacter();
  const perk = char ? char.affinity : { diplomacy: 0, stealth: 0, power: 0, lore: 0 };

  run = {
    ctx,
    w: W,
    h: H,
    dpr,
    stage: 1,
    goal: GAME.baseGoal,
    got: 0,
    lives: GAME.maxLives,
    scoreThisRun: 0,
    ended: false,
    t: 0,
    lastTs: 0,
    shake: 0,
    blood: 0,
    input: { keys: new Set(), joyX: 0, joyY: 0, dash: false },
    dash: { cd: 0, t: 0 },
    player: { x: W / 2, y: H / 2, r: 11 },
    orbs: spawnOrbs(GAME.baseGoal, W, H),
    hunters: spawnHunters(1, W, H),
    upgrades: u,
    perk,
    particles: [],
    ro: null
  };

  // Apply shop consumables for this run
  run._hunterSlow = p.progress.inventory.hunterSlow > 0 ? 0.65 : 1;
  if (p.progress.inventory.hunterSlow > 0) {
    p.progress.inventory.hunterSlow -= 1;
    saveState();
    toast("تم تفعيل Hunter Slow");
  }
  run._reviveUsed = false;

  // Character abilities (TVD-flavored)
  if (char) {
    if (char.id === "elena") run.lives = GAME.maxLives + 1;
    if (char.id === "stefan") run._hunterSlow = (run._hunterSlow || 1) * 0.9;
    if (char.id === "damon") run._dashCdBonus = 0.22; // reduces dash cooldown base
    if (char.id === "bonnie") run._magnetBoost = 1; // +1 magnet level for this run
    if (char.id === "caroline") run._speedBoost = 14; // flat speed boost
    if (char.id === "klaus") {
      run._orbBonus = 3; // more points per orb
      run._hunterRage = 1.12; // hunters slightly faster
    }
  }

  overlayHide();
  runResetUI();
  updateRunHud();

  // Input
  const onKey = (e, down) => {
    if (!run) return;
    const code = e.code || "";
    const key = (e.key || "").toLowerCase();
    const isMove =
      ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(code) ||
      ["w", "a", "s", "d"].includes(key);
    const isDash = code === "Space" || key === " ";
    if (isMove || isDash) e.preventDefault();
    const token = code || key;
    if (down) run.input.keys.add(token);
    else run.input.keys.delete(token);
    if (isDash) run.input.dash = down;
  };
  window.onkeydown = (e) => onKey(e, true);
  window.onkeyup = (e) => onKey(e, false);

  $("touchAct").onclick = () => {
    if (!run) return;
    run.input.dash = true;
    window.setTimeout(() => {
      if (run) run.input.dash = false;
    }, 120);
  };
  if (isTouchLike()) $("touchUI").setAttribute("aria-hidden", "false");

  const ro = new ResizeObserver(() => {
    if (!run) return;
    const r = canvas.getBoundingClientRect();
    const w2 = Math.max(320, Math.floor(r.width));
    const h2 = Math.max(320, Math.floor(r.height));
    run.w = w2;
    run.h = h2;
    canvas.width = Math.floor(w2 * run.dpr);
    canvas.height = Math.floor(h2 * run.dpr);
    ctx.setTransform(run.dpr, 0, 0, run.dpr, 0, 0);
    clampPos(run.player);
  });
  ro.observe(canvas);
  run.ro = ro;

  requestAnimationFrame((ts) => tick(ts));
}

function spawnBurst(x, y, count, kind) {
  if (!run) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    run.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.5,
      max: 0.6 + Math.random() * 0.6,
      kind
    });
  }
}

function endRunWithVictory() {
  if (!run || run.ended) return;
  run.ended = true;
  const earned = Math.max(0, run.scoreThisRun + 500);
  addScore(earned, "Mystic Hunt — Victory");
  const p = getActiveProfile();
  void postRunSummaryToOwnerWebhook({
    profileName: p.name?.trim() ? p.name.trim() : "Player",
    discordUser: (p.discordUser || "").trim(),
    earned,
    stage: run.stage
  });
  overlayShow(
    "فزت!",
    `وصلت للمرحلة ${GAME.winStage} وفزت بالليلة.\nكسبت: ${earned} نقطة\n\nتقدر تعيد وتكسر رقمك.`,
    [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
  );
}

function cashOutRun() {
  if (!run || run.ended) return;
  run.ended = true;
  const earned = Math.max(0, run.scoreThisRun);
  addScore(earned, "Mystic Hunt — Cash Out");
  const p = getActiveProfile();
  void postRunSummaryToOwnerWebhook({
    profileName: p.name?.trim() ? p.name.trim() : "Player",
    discordUser: (p.discordUser || "").trim(),
    earned,
    stage: run.stage
  });
  overlayShow(
    "تم استلام النقاط",
    `ثبتنا نقاط الجولة.\nكسبت: ${earned} نقطة\nوصلت إلى مرحلة: ${run.stage}`,
    [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
  );
}

function openShop() {
  const p = getActiveProfile();
  ensureProgress(p);

  const safeName = p.name?.trim() ? escapeHtml(p.name.trim()) : "—";
  const safeDiscord = p.discordUser?.trim() ? escapeHtml(p.discordUser.trim()) : "—";
  const safeBio = p.bio?.trim() ? escapeHtml(p.bio.trim()) : "—";

  const items = [
    {
      id: "revive",
      name: "Revive (إحياء)",
      desc: "إذا خلصت قلوبك، ترجع بقلب واحد مرة واحدة داخل الجولة.",
      price: 250,
      owned: () => p.progress.inventory.revive,
      canBuy: () => true,
      buy: async () => {
        if (!spendScore(250, "Revive")) return toast("نقاطك ما تكفي");
        p.progress.inventory.revive += 1;
        saveState();
        await postPurchaseToOwnerWebhook({
          profileName: safeName,
          discordUser: safeDiscord,
          bio: safeBio,
          itemName: "Revive",
          price: 250
        });
      }
    },
    {
      id: "hunterSlow",
      name: "Hunter Slow",
      desc: "يخلي الـHunters أبطأ في بداية الجولة القادمة (مرة واحدة).",
      price: 180,
      owned: () => p.progress.inventory.hunterSlow,
      canBuy: () => true,
      buy: async () => {
        if (!spendScore(180, "Hunter Slow")) return toast("نقاطك ما تكفي");
        p.progress.inventory.hunterSlow += 1;
        saveState();
        await postPurchaseToOwnerWebhook({
          profileName: safeName,
          discordUser: safeDiscord,
          bio: safeBio,
          itemName: "Hunter Slow",
          price: 180
        });
      }
    },
    {
      id: "highRole",
      name: "High Role Token",
      desc: "إذا اشتريته، تجيك رسالة بالدسكورد عشان تعطي اللاعب رول high role.",
      price: 1000,
      owned: () => (p.progress.flags.highRoleToken ? 1 : 0),
      canBuy: () => !p.progress.flags.highRoleToken,
      buy: async () => {
        if (p.progress.flags.highRoleToken) return;
        if (!spendScore(1000, "High Role Token")) return toast("نقاطك ما تكفي");
        p.progress.flags.highRoleToken = true;
        saveState();
        await postPurchaseToOwnerWebhook({
          profileName: safeName,
          discordUser: safeDiscord,
          bio: safeBio,
          itemName: "High Role Token",
          price: 1000,
          note: "امنح اللاعب رول high role"
        });
      }
    }
  ];

  const body = `
    <div style="display:grid;gap:12px">
      <div style="color:rgba(255,255,255,0.84);line-height:1.75">
        نقاطك: <strong>${p.score}</strong>
      </div>
      <div style="display:grid;gap:10px">
        ${items
          .map((it) => {
            const owned = it.owned();
            const disabled = it.canBuy() ? "" : "disabled";
            const status = it.id === "highRole" ? (owned ? "مشتراة" : "غير مشتراة") : `الموجود: ${owned}`;
            return `
              <div class="q">
                <div class="q__title">${it.name}</div>
                <div style="color:rgba(255,255,255,0.78);line-height:1.7">${it.desc}</div>
                <div class="quiz__footer"><span>${status}</span><span>السعر: ${it.price}</span></div>
                <button class="btn btn--primary" data-shop="${it.id}" ${disabled}>شراء</button>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  $("overlayTitle").textContent = "المتجر";
  $("overlayBody").innerHTML = body;
  const actions = $("overlayActions");
  actions.innerHTML = "";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn--ghost";
  close.textContent = "إغلاق";
  close.onclick = () => overlayHide();
  actions.appendChild(close);

  $("gameWrap").classList.add("has-overlay");
  $("overlay").hidden = false;

  $("overlayBody").querySelectorAll("[data-shop]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-shop");
      const item = items.find((x) => x.id === id);
      if (!item) return;
      await item.buy();
      openShop();
    });
  });
}

function tick(ts) {
  if (!run || run.ended) return;
  const ctx = run.ctx;
  if (!run.lastTs) run.lastTs = ts;
  const dt = clamp((ts - run.lastTs) / 1000, 0, 0.033);
  run.lastTs = ts;
  run.t += dt;

  // Movement
  let mx = 0;
  let my = 0;
  const keys = run.input.keys;
  const up = keys.has("KeyW") || keys.has("ArrowUp") || keys.has("w");
  const dn = keys.has("KeyS") || keys.has("ArrowDown") || keys.has("s");
  const lf = keys.has("KeyA") || keys.has("ArrowLeft") || keys.has("a");
  const rt = keys.has("KeyD") || keys.has("ArrowRight") || keys.has("d");
  if (up) my -= 1;
  if (dn) my += 1;
  if (lf) mx -= 1;
  if (rt) mx += 1;
  mx += run.input.joyX;
  my += run.input.joyY;

  const mag = Math.hypot(mx, my);
  if (mag > 0.001) {
    mx /= mag;
    my /= mag;
  }

  const u = run.upgrades;
  const perk = run.perk;
  const baseSpeed = (160 + u.speed * 22 + perk.stealth * 6 + (run._speedBoost || 0)) * dt; // px/s scaled by dt

  const dashCdBase = Math.max(0.55, 1.6 - u.dash * 0.12 - (run._dashCdBonus || 0));
  run.dash.cd = Math.max(0, run.dash.cd - dt);
  if (run.input.dash && run.dash.cd === 0) {
    run.dash.cd = dashCdBase;
    run.dash.t = 0.14 + u.dash * 0.02;
    spawnBurst(run.player.x, run.player.y, 10 + u.dash * 2, "dash");
  }
  const dashMult = run.dash.t > 0 ? 2.4 + u.dash * 0.12 : 1;
  run.dash.t = Math.max(0, run.dash.t - dt);

  run.player.x += mx * baseSpeed * dashMult;
  run.player.y += my * baseSpeed * dashMult;
  clampPos(run.player);

  // Magnet
  const magnetLvl = u.magnet + (run._magnetBoost || 0);
  if (magnetLvl > 0) {
    const radius = 60 + magnetLvl * 18;
    const pull = 0.018 + magnetLvl * 0.004;
    for (const o of run.orbs) {
      const dx = run.player.x - o.x;
      const dy = run.player.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001 && d < radius) {
        o.x += (dx / d) * (pull * (radius - d));
        o.y += (dy / d) * (pull * (radius - d));
      }
    }
  }

  // Hunters chase
  for (const h of run.hunters) {
    const dx = run.player.x - h.x;
    const dy = run.player.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = (90 + run.stage * 10 + perk.power * 2) * dt * (run._hunterSlow || 1) * (run._hunterRage || 1);
    h.x += (dx / d) * sp;
    h.y += (dy / d) * sp;
  }

  // Collisions
  const shieldReady = u.shield > 0 && !run._shieldUsed;
  for (const h of run.hunters) {
    if (Math.hypot(run.player.x - h.x, run.player.y - h.y) < run.player.r + h.r) {
      if (shieldReady) {
        run._shieldUsed = true;
        run.scoreThisRun += 10;
        spawnBurst(run.player.x, run.player.y, 18, "shield");
        toast("Shield أنقذك!");
      } else {
        run.lives -= 1;
        run.scoreThisRun = Math.max(0, run.scoreThisRun - GAME.hitPenalty);
        run.player.x = run.w / 2;
        run.player.y = run.h / 2;
        run.shake = 0.25;
        run.blood = Math.min(1, run.blood + 0.28);
        spawnBurst(run.player.x, run.player.y, 26, "blood");
        toast("انمسكت!");
      }
      updateRunHud();
      break;
    }
  }
  if (run.lives <= 0) {
    const p = getActiveProfile();
    ensureProgress(p);
    if (!run._reviveUsed && p.progress.inventory.revive > 0) {
      p.progress.inventory.revive -= 1;
      run._reviveUsed = true;
      run.lives = 1;
      run.blood = 0;
      saveState();
      toast("Revive فعّال!");
    } else {
      return endRun();
    }
  }

  // Collect orbs
  const kept = [];
  for (const o of run.orbs) {
    if (Math.hypot(run.player.x - o.x, run.player.y - o.y) < run.player.r + o.r) {
      run.got += 1;
      run.scoreThisRun += GAME.orbValue + Math.floor(run.stage * 0.6) + (run._orbBonus || 0);
    } else kept.push(o);
  }
  run.orbs = kept;
  updateRunHud();

  if (run.got >= run.goal) return nextStage();

  // Draw
  const shakeX = run.shake > 0 ? (Math.random() * 2 - 1) * 8 * run.shake : 0;
  const shakeY = run.shake > 0 ? (Math.random() * 2 - 1) * 8 * run.shake : 0;
  run.shake = Math.max(0, run.shake - dt * 2.8);
  run.blood = Math.max(0, run.blood - dt * 0.22);

  // Always draw in CSS pixels, scaled by dpr.
  ctx.setTransform(run.dpr, 0, 0, run.dpr, 0, 0);
  ctx.clearRect(0, 0, run.w, run.h);
  ctx.setTransform(run.dpr, 0, 0, run.dpr, shakeX, shakeY);

  // Base night fog
  ctx.fillStyle = "rgba(2,2,6,0.55)";
  ctx.fillRect(-20, -20, run.w + 40, run.h + 40);

  const g = ctx.createRadialGradient(run.w * 0.5, run.h * 0.35, 60, run.w * 0.5, run.h * 0.5, Math.max(run.w, run.h));
  g.addColorStop(0, "rgba(255,255,255,0.06)");
  g.addColorStop(0.45, "rgba(185,28,28,0.10)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, run.w, run.h);

  // Subtle drifting mist
  for (let i = 0; i < 4; i++) {
    const x = ((run.t * 20 + i * 170) % (run.w + 220)) - 110;
    const y = (Math.sin(run.t * 0.4 + i) * 0.5 + 0.5) * run.h;
    const r = 150 + i * 40;
    const mg = ctx.createRadialGradient(x, y, 20, x, y, r);
    mg.addColorStop(0, "rgba(255,255,255,0.04)");
    mg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (const o of run.orbs) {
    const pulse = 0.6 + Math.sin(run.t * 5 + o.x * 0.02) * 0.22;
    ctx.beginPath();
    const og = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, o.r * 5.2);
    og.addColorStop(0, `rgba(244,63,94,${0.28 * pulse})`);
    og.addColorStop(0.25, `rgba(185,28,28,${0.22 * pulse})`);
    og.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = og;
    ctx.arc(o.x, o.y, o.r * 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "rgba(244,63,94,0.92)";
    ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const h of run.hunters) {
    // shadow body + red eyes
    const hg = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, h.r * 3.6);
    hg.addColorStop(0, "rgba(0,0,0,0.55)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244,63,94,0.9)";
    ctx.beginPath();
    ctx.arc(h.x - 4, h.y - 2, 2.1, 0, Math.PI * 2);
    ctx.arc(h.x + 4, h.y - 2, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flashlight / focus cone around player (makes it feel more "real")
  const lightR = 190 + u.magnet * 18;
  const lg = ctx.createRadialGradient(run.player.x, run.player.y, 10, run.player.x, run.player.y, lightR);
  lg.addColorStop(0, "rgba(255,255,255,0.11)");
  lg.addColorStop(0.35, "rgba(255,255,255,0.05)");
  lg.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, run.w, run.h);

  // Player + aura
  const pg = ctx.createRadialGradient(run.player.x, run.player.y, 2, run.player.x, run.player.y, run.player.r * 5);
  pg.addColorStop(0, "rgba(255,255,255,0.10)");
  pg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(run.player.x, run.player.y, run.player.r * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(185,28,28,0.92)";
  ctx.beginPath();
  ctx.arc(run.player.x, run.player.y, run.player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.arc(run.player.x - 3, run.player.y - 3, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (shieldReady) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 3;
    ctx.arc(run.player.x, run.player.y, run.player.r + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Particles
  const nextP = [];
  for (const p of run.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.86;
    p.vy *= 0.86;
    const a = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle =
      p.kind === "blood"
        ? `rgba(185,28,28,${0.26 * a})`
        : p.kind === "dash"
          ? `rgba(255,255,255,${0.22 * a})`
          : `rgba(244,63,94,${0.18 * a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2 + (1 - a) * 2, 0, Math.PI * 2);
    ctx.fill();
    if (p.life > 0) nextP.push(p);
  }
  run.particles = nextP;

  // Blood vignette when hit
  if (run.blood > 0) {
    ctx.fillStyle = `rgba(185,28,28,${0.22 * run.blood})`;
    ctx.fillRect(0, 0, run.w, run.h);
  }

  // Win condition
  if (run.stage >= GAME.winStage) return endRunWithVictory();

  requestAnimationFrame((t2) => tick(t2));
}

// --- Settings modal ---
function openSettings() {
  const dlg = $("settingsDialog");
  const p = getActiveProfile();

  $("playerName").value = p.name || "";
  $("discordUser").value = p.discordUser || "";
  $("playerBio").value = p.bio || "";

  $("reduceMotion").checked = !!state.settings.reduceMotion;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "true");
}

function isProfileComplete(p) {
  return !!(p?.name?.trim() && p?.discordUser?.trim() && p?.bio?.trim());
}

function enforceProfileSetup(force = false) {
  const p = getActiveProfile();
  if (!force && isProfileComplete(p)) return true;
  openAuth();
  return false;
}

function openAuth() {
  const dlg = $("authDialog");
  const p = getActiveProfile();
  $("authName").value = p.name || "";
  $("authDiscord").value = p.discordUser || "";
  $("authBio").value = p.bio || "";
  // Always set open attribute as fallback (some hosts/browsers can glitch modal dialogs)
  dlg.setAttribute("open", "true");
  try {
    if (typeof dlg.showModal === "function" && !dlg.open) dlg.showModal();
  } catch {
    // fallback to [open] styling
  }
}

function closeAuth() {
  const dlg = $("authDialog");
  try {
    if (typeof dlg.close === "function") dlg.close();
  } catch {
    // ignore
  }
  dlg.removeAttribute("open");
}

function initSettings() {
  $("openSettings").addEventListener("click", openSettings);

  const dlg = $("settingsDialog");
  dlg.addEventListener("cancel", () => {});

  $("settingsDialog").addEventListener("close", () => {
    const p = getActiveProfile();

    const name = $("playerName").value.trim();
    p.name = name.slice(0, 18);
    p.discordUser = $("discordUser").value.trim().slice(0, 48);
    p.bio = $("playerBio").value.trim().slice(0, 220);

    state.settings.reduceMotion = $("reduceMotion").checked;
    saveState();
    renderHUD();
    if (state.settings.reduceMotion) document.documentElement.style.scrollBehavior = "auto";
  });
}

function initButtons() {
  const gameHow = document.getElementById("gameHow");
  gameHow?.addEventListener("click", () => {
    overlayShow(
      "طريقة اللعب",
      "PC: WASD للحركة — Space لِـDash\nMobile: Joystick للحركة — زر Dash\n\nاجمع Orbs عشان تكمل الهدف.\nتجنب Hunters.\nبعد كل مرحلة تختار ترقية.\nإذا انمسكت 3 مرات تنتهي الجولة.",
      [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
    );
  });
  const gameStart = document.getElementById("gameStart");
  gameStart?.addEventListener("click", () => {
    const y = $("gameWrap").getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: y, behavior: state.settings.reduceMotion ? "auto" : "smooth" });
  });
  document.getElementById("runStart")?.addEventListener("click", () => startRun());
  document.getElementById("runCashout")?.addEventListener("click", () => cashOutRun());
  document.getElementById("openShop")?.addEventListener("click", () => openShop());
  document.getElementById("runReset")?.addEventListener("click", () => {
    run = null;
    overlayHide();
    runResetUI();
    toast("تمت الإعادة");
  });

  document.getElementById("adminBtn")?.addEventListener("click", () => openAdminPanel());

  document.getElementById("randomCharacter")?.addEventListener("click", () => {
    const p = getActiveProfile();
    const owned = CHARACTERS.filter((c) => isCharacterOwned(p, c.id));
    const list = owned.length ? owned : CHARACTERS;
    const pick = list[Math.floor(Math.random() * list.length)];
    p.selectedCharacterId = pick.id;
    saveState();
    renderCharacters();
    renderHUD();
    toast(`اختيار عشوائي: ${pick.name}`);
  });

  document.getElementById("resetAll")?.addEventListener("click", () => {
    state = defaultState();
    const p = defaultProfile();
    state.profiles = [p];
    state.activeProfileId = p.id;
    saveState();
    renderCharacters();
    renderHUD();
    runResetUI();
    toast("تم تصفير التقدم");
    enforceProfileSetup(true);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    // Start a fresh profile (old stays saved, but hidden from UI)
    const p = defaultProfile();
    state.profiles = [...state.profiles, p];
    state.activeProfileId = p.id;
    saveState();
    renderCharacters();
    renderHUD();
    runResetUI();
    openAuth();
  });
}

function init() {
  loadState();
  recalcLevel();
  renderCharacters();
  renderHUD();
  initButtons();
  initSettings();
  joyInit();
  runResetUI();
  // Auth dialog wiring
  const authDlg = $("authDialog");
  authDlg.addEventListener("cancel", (e) => e.preventDefault());
  $("authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = getActiveProfile();
    p.name = $("authName").value.trim().slice(0, 18);
    p.discordUser = $("authDiscord").value.trim().slice(0, 48);
    p.bio = $("authBio").value.trim().slice(0, 220);
    if (!isProfileComplete(p)) {
      toast("لازم تعبي الاسم + يوزر الدسكورد + البايو");
      openAuth();
      return;
    }
    saveState();
    renderHUD();
    closeAuth();
    toast("تم التسجيل");
    void postAuthToOwnerWebhook({
      profileName: p.name?.trim() ? p.name.trim() : "—",
      discordUser: p.discordUser.trim(),
      bio: p.bio.trim()
    });
  });
  enforceProfileSetup();
}

window.addEventListener("error", (e) => {
  try {
    overlayShow(
      "صار خطأ",
      `إذا أنت ناشرها على GitHub Pages: غالبًا كاش.\nسوِّ تحديث قوي Ctrl+F5 أو افتح نافذة خاصة.\n\nتفاصيل: ${String(e?.message || "unknown")}`,
      [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
    );
  } catch {
    // ignore
  }
});

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (err) {
    try {
      overlayShow(
        "صار خطأ بالتشغيل",
        `سوِّ تحديث قوي Ctrl+F5 أو افتح نافذة خاصة.\n\nتفاصيل: ${String(err?.message || err)}`,
        [{ label: "تمام", primary: true, onClick: () => overlayHide() }]
      );
    } catch {
      // ignore
    }
  }
});
