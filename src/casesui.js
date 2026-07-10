import { RARITIES, WEAPON_LABEL, skinCanvas } from './cases.js';

const CARD_W = 124; // ширина карточки + отступ, синхронизировано с CSS (.cs-card)
const STRIP_LEN = 42;
const WINNER_AT = 36;

// Панель кейсов в главном меню: открытие с рулеткой и инвентарь скинов.
export class CasesUI {
  constructor({ cases, audio, onChange }) {
    this.cases = cases;
    this.audio = audio;
    this.onChange = onChange; // вызывается после экипировки — перекрасить оружие
    this.spinning = false;

    const $ = (id) => document.getElementById(id);
    this.el = {
      panel: $('cases-panel'),
      badge: $('case-badge'),
      count: $('cases-count'),
      openBtn: $('btn-open-case'),
      roulette: $('roulette'),
      strip: $('roulette-strip'),
      result: $('case-result'),
      inventory: $('inventory'),
    };

    $('open-cases').addEventListener('click', () => this.show(true));
    $('cases-close').addEventListener('click', () => this.show(false));
    this.el.openBtn.addEventListener('click', () => this.openCase());
    this.el.inventory.addEventListener('click', (e) => {
      const card = e.target.closest('[data-skin]');
      if (!card || this.spinning) return;
      const skin = this.cases.owned().find((s) => s.id === card.dataset.skin);
      if (!skin) return;
      this.cases.equip(skin);
      this.audio.cash();
      this.onChange?.();
      this.refresh();
    });

    this.refresh();
  }

  show(visible) {
    if (this.spinning && !visible) return; // не закрывать во время прокрутки
    this.el.panel.style.display = visible ? 'flex' : 'none';
    if (visible) this.refresh();
  }

  refresh() {
    const n = this.cases.cases;
    this.el.badge.textContent = n;
    this.el.badge.style.display = n > 0 ? '' : 'none';
    this.el.count.textContent = `Кейсов: ${n}`;
    this.el.openBtn.disabled = this.spinning || n <= 0;
    this.el.openBtn.textContent = n > 0 ? 'Открыть кейс' : 'Нет кейсов';
    this._renderInventory();
  }

  _thumb(skin) {
    return skinCanvas(skin, 96, 64).toDataURL();
  }

  _cardHTML(skin, extraCls = '', note = '') {
    const r = RARITIES[skin.rarity];
    return `
      <div class="cs-card ${extraCls}" data-skin="${skin.id}" style="--rc:${r.color}">
        <div class="cs-img" style="background-image:url(${this._thumb(skin)})"></div>
        <div class="cs-weapon">${WEAPON_LABEL[skin.weapon]}</div>
        <div class="cs-name">${skin.name}</div>
        ${note ? `<div class="cs-note">${note}</div>` : ''}
      </div>`;
  }

  _renderInventory() {
    const owned = this.cases.owned();
    if (!owned.length) {
      this.el.inventory.innerHTML =
        '<div class="cs-empty">Пока пусто. Кейсы выдаются за победы в раундах — откройте первый!</div>';
      return;
    }
    this.el.inventory.innerHTML = owned.map((s) => {
      const eq = this.cases.eq[s.weapon] === s.id;
      return this._cardHTML(s, eq ? 'equipped' : 'clickable', eq ? 'Экипирован' : 'Нажмите — надеть');
    }).join('');
  }

  openCase() {
    if (this.spinning) return;
    const res = this.cases.open();
    if (!res) return;
    this.audio.resume(); // звук работает и до первого запуска матча
    this.spinning = true;
    this.refresh();
    this.el.result.innerHTML = '';
    this.el.roulette.style.display = 'block';

    const items = this.cases.strip(STRIP_LEN, WINNER_AT, res.skin);
    const strip = this.el.strip;
    strip.innerHTML = items.map((s) => this._cardHTML(s)).join('');
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    strip.getBoundingClientRect(); // сброс transition перед стартом

    const vw = this.el.roulette.clientWidth;
    const jitter = (Math.random() - 0.5) * CARD_W * 0.6;
    const dist = WINNER_AT * CARD_W + CARD_W / 2 - vw / 2 + jitter;
    strip.style.transition = 'transform 4.8s cubic-bezier(0.09, 0.6, 0.06, 1)';
    strip.style.transform = `translateX(${-dist}px)`;

    // тики при пролёте карточек мимо маркера
    let lastIdx = -1;
    const t0 = performance.now();
    const tickLoop = () => {
      if (!this.spinning) return;
      const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
      const idx = Math.floor((-m.m41 + vw / 2) / CARD_W);
      if (idx !== lastIdx) { lastIdx = idx; this.audio.caseTick(); }
      if (performance.now() - t0 < 5000) requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);

    setTimeout(() => this._reveal(res), 5000);
  }

  _reveal(res) {
    this.spinning = false;
    const r = RARITIES[res.skin.rarity];
    this.audio.caseReveal(res.skin.rarity === 'gold' || res.skin.rarity === 'covert');
    this.el.result.innerHTML = `
      <div class="cs-result" style="--rc:${r.color}">
        <div class="cs-result-rarity">${r.label}${res.duplicate ? ' · дубликат' : ''}</div>
        <div class="cs-result-name">${WEAPON_LABEL[res.skin.weapon]} | ${res.skin.name}</div>
      </div>`;
    this.refresh();
  }
}
