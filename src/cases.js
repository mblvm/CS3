import * as THREE from 'three';

// Система кейсов: редкости, скины, инвентарь с сохранением в localStorage
// и генерация процедурных текстур скинов (для вьюмоделей и карточек меню).

export const RARITIES = {
  milspec:    { key: 'milspec',    label: 'Армейское качество', color: '#4b69ff', weight: 60 },
  restricted: { key: 'restricted', label: 'Запрещённое',        color: '#8847ff', weight: 23 },
  classified: { key: 'classified', label: 'Засекреченное',      color: '#d32ce6', weight: 11 },
  covert:     { key: 'covert',     label: 'Тайное',             color: '#eb4b4b', weight: 5 },
  gold:       { key: 'gold',       label: 'Особый предмет',     color: '#ffd24a', weight: 1 },
};

export const WEAPON_LABEL = { knife: 'Нож', usp: 'USP-S', ak: 'AK-47', awp: 'AWP' };

// body/accent — основные цвета модели, pattern + pat1/pat2 — рисунок текстуры
export const SKINS = [
  // AK-47
  { id: 'ak_blue',    weapon: 'ak', name: 'Синий глянец',    rarity: 'milspec',    body: '#2b4d86', accent: '#1d2733', pattern: 'solid',   pat1: '#3d6cb8', pat2: '#16233a' },
  { id: 'ak_recon',   weapon: 'ak', name: 'Пустынный рекон', rarity: 'milspec',    body: '#a8926a', accent: '#4a4034', pattern: 'camo',    pat1: '#7d6b4a', pat2: '#c7b285' },
  { id: 'ak_redline', weapon: 'ak', name: 'Красная линия',   rarity: 'restricted', body: '#2a2c30', accent: '#1c1d20', pattern: 'stripes', pat1: '#c33b2f', pat2: '#3a3d42' },
  { id: 'ak_vulcan',  weapon: 'ak', name: 'Вулкан',          rarity: 'classified', body: '#e8e5dc', accent: '#22262c', pattern: 'stripes', pat1: '#2f7fd3', pat2: '#23262b' },
  { id: 'ak_asiimov', weapon: 'ak', name: 'Азимов',          rarity: 'covert',     body: '#efe9e2', accent: '#2b2724', pattern: 'stripes', pat1: '#ff7a1a', pat2: '#332f2c' },
  { id: 'ak_serpent', weapon: 'ak', name: 'Огненный змей',   rarity: 'covert',     body: '#3f5d3a', accent: '#2c2318', pattern: 'camo',    pat1: '#d9a441', pat2: '#28401f' },
  // AWP
  { id: 'awp_camo',   weapon: 'awp', name: 'Полевой камуфляж', rarity: 'milspec',    body: '#5a6b4a', accent: '#333930', pattern: 'camo',    pat1: '#3e4a35', pat2: '#7a8a63' },
  { id: 'awp_hive',   weapon: 'awp', name: 'Электрический улей', rarity: 'restricted', body: '#c8a72e', accent: '#26241c', pattern: 'hex',   pat1: '#2a2418', pat2: '#ffe27a' },
  { id: 'awp_grifon', weapon: 'awp', name: 'Грифон',          rarity: 'classified', body: '#b9c7d4', accent: '#2c3540', pattern: 'web',     pat1: '#5a7d9e', pat2: '#e6eef4' },
  { id: 'awp_asiimov', weapon: 'awp', name: 'Азимов',         rarity: 'covert',     body: '#2b2724', accent: '#efe9e2', pattern: 'stripes', pat1: '#ff7a1a', pat2: '#efe9e2' },
  { id: 'awp_dlore',  weapon: 'awp', name: 'Драконье предание', rarity: 'covert',   body: '#b39554', accent: '#4a3a20', pattern: 'camo',    pat1: '#6e5a2e', pat2: '#e0c887' },
  // USP-S
  { id: 'usp_ice',    weapon: 'usp', name: 'Ледник',          rarity: 'milspec',    body: '#9fc4e0', accent: '#2c3743', pattern: 'fade',    pat1: '#dceefc', pat2: '#5a86ab' },
  { id: 'usp_guardian', weapon: 'usp', name: 'Стражник',      rarity: 'restricted', body: '#3d4b5e', accent: '#20262e', pattern: 'stripes', pat1: '#7da4c8', pat2: '#2a3440' },
  { id: 'usp_neonoir', weapon: 'usp', name: 'Неонуар',        rarity: 'classified', body: '#232a3d', accent: '#191d29', pattern: 'web',     pat1: '#d34fa0', pat2: '#4a5fd0' },
  { id: 'usp_killconf', weapon: 'usp', name: 'Подтверждённое убийство', rarity: 'covert', body: '#d8d2c8', accent: '#26221f', pattern: 'stripes', pat1: '#c8342a', pat2: '#2b2f38' },
  // Ножи — только «особый предмет»
  { id: 'knife_fade',  weapon: 'knife', name: 'Градиент',          rarity: 'gold', body: '#f0c030', accent: '#1d1d22', pattern: 'fade', pat1: '#e050a0', pat2: '#7040d0' },
  { id: 'knife_web',   weapon: 'knife', name: 'Кровавая паутина',  rarity: 'gold', body: '#7a1a16', accent: '#241414', pattern: 'web',  pat1: '#2b0b0a', pat2: '#c04038' },
  { id: 'knife_gamma', weapon: 'knife', name: 'Гамма-волны',       rarity: 'gold', body: '#18d078', accent: '#101418', pattern: 'fade', pat1: '#0a6a48', pat2: '#7af0c0' },
  { id: 'knife_marble', weapon: 'knife', name: 'Мраморный градиент', rarity: 'gold', body: '#e8e8ee', accent: '#17171c', pattern: 'camo', pat1: '#d03050', pat2: '#3050d0' },
];

// --- процедурная текстура скина ---
export function skinCanvas(skin, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = skin.body;
  g.fillRect(0, 0, w, h);

  switch (skin.pattern) {
    case 'stripes': {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(-0.5);
      for (let i = -8; i < 8; i++) {
        g.fillStyle = i % 2 ? skin.pat1 : skin.pat2;
        g.globalAlpha = i % 2 ? 0.9 : 0.45;
        g.fillRect(-w, i * (h / 7), w * 2, h / 14);
      }
      g.restore();
      break;
    }
    case 'camo': {
      for (let i = 0; i < 46; i++) {
        g.fillStyle = i % 2 ? skin.pat1 : skin.pat2;
        g.globalAlpha = 0.55 + Math.random() * 0.35;
        g.beginPath();
        g.ellipse(
          Math.random() * w, Math.random() * h,
          8 + Math.random() * w * 0.14, 5 + Math.random() * h * 0.09,
          Math.random() * Math.PI, 0, Math.PI * 2,
        );
        g.fill();
      }
      break;
    }
    case 'fade': {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, skin.body);
      gr.addColorStop(0.55, skin.pat1);
      gr.addColorStop(1, skin.pat2);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      break;
    }
    case 'web': {
      g.strokeStyle = skin.pat1;
      g.globalAlpha = 0.8;
      g.lineWidth = 2;
      const cx = w * 0.3, cy = h * 0.3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h);
        g.stroke();
      }
      for (let r = 20; r < w * 1.2; r += 26) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 0.25;
      g.strokeStyle = skin.pat2;
      for (let r = 33; r < w * 1.2; r += 26) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case 'hex': {
      g.strokeStyle = skin.pat1;
      g.lineWidth = 3;
      g.globalAlpha = 0.75;
      const s = 18;
      for (let y = 0; y < h + s; y += s * 1.5) {
        for (let x = 0; x < w + s; x += s * Math.sqrt(3)) {
          const ox = (Math.round(y / (s * 1.5)) % 2) * s * Math.sqrt(3) * 0.5;
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            const px = x + ox + Math.cos(a) * s, py = y + Math.sin(a) * s;
            k ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.stroke();
        }
      }
      g.globalAlpha = 0.2;
      g.fillStyle = skin.pat2;
      g.fillRect(0, 0, w, h);
      break;
    }
    default: { // solid — лёгкие блики
      for (let i = 0; i < 40; i++) {
        g.fillStyle = i % 2 ? skin.pat1 : skin.pat2;
        g.globalAlpha = Math.random() * 0.12;
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 20, 2 + Math.random() * 20);
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}

const _texCache = new Map();
export function skinTexture(skin) {
  if (!_texCache.has(skin.id)) {
    const t = new THREE.CanvasTexture(skinCanvas(skin));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    _texCache.set(skin.id, t);
  }
  return _texCache.get(skin.id);
}

// --- инвентарь ---
const LS_KEY = 'cs3_cases_v1';

export class CaseSystem {
  constructor() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* повреждённые данные */ }
    if (!d || typeof d !== 'object') d = { cases: 2, inv: [], eq: {} }; // 2 стартовых кейса
    this.cases = d.cases | 0;
    this.inv = new Set(Array.isArray(d.inv) ? d.inv : []);
    this.eq = d.eq && typeof d.eq === 'object' ? d.eq : {};
    this._save();
  }

  _save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        cases: this.cases, inv: [...this.inv], eq: this.eq,
      }));
    } catch { /* приватный режим — играем без сохранения */ }
  }

  award(n = 1) {
    this.cases += n;
    this._save();
  }

  // редкость по весам, затем случайный скин этой редкости
  rollSkin() {
    const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * total;
    let rarity = 'milspec';
    for (const r of Object.values(RARITIES)) {
      roll -= r.weight;
      if (roll <= 0) { rarity = r.key; break; }
    }
    const pool = SKINS.filter((s) => s.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  open() {
    if (this.cases <= 0) return null;
    this.cases--;
    const skin = this.rollSkin();
    const duplicate = this.inv.has(skin.id);
    this.inv.add(skin.id);
    this._save();
    return { skin, duplicate };
  }

  // повторный клик по экипированному скину снимает его
  equip(skin) {
    if (!this.inv.has(skin.id)) return;
    if (this.eq[skin.weapon] === skin.id) delete this.eq[skin.weapon];
    else this.eq[skin.weapon] = skin.id;
    this._save();
  }

  equippedSkin(weaponKey) {
    const id = this.eq[weaponKey];
    if (!id) return null;
    return SKINS.find((s) => s.id === id && this.inv.has(id)) || null;
  }

  owned() {
    return SKINS.filter((s) => this.inv.has(s.id));
  }

  // лента для рулетки: len случайных скинов, победитель на позиции winnerIndex
  strip(len, winnerIndex, winner) {
    const arr = [];
    for (let i = 0; i < len; i++) arr.push(this.rollSkin());
    arr[winnerIndex] = winner;
    return arr;
  }
}
