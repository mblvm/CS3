// Управление DOM-оверлеем: прицел, HP, патроны, киллфид, таблица счёта.
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'),
      hp: $('hp'),
      hpBox: $('hp-box'),
      ammo: $('ammo'),
      reserve: $('reserve'),
      wname: $('wname'),
      weaponList: $('weapon-list'),
      killfeed: $('killfeed'),
      hitmarker: $('hitmarker'),
      vignette: $('damage-vignette'),
      scope: $('scope'),
      score: $('score'),
      scoreboard: $('scoreboard'),
      death: $('death-screen'),
      deathText: $('death-text'),
      speed: $('speed'),
    };
    this._hitT = null;
    this._dmgT = null;
  }

  setHP(hp) {
    this.el.hp.textContent = Math.ceil(hp);
    this.el.hpBox.classList.toggle('low', hp <= 30);
  }

  setAmmo(cur, res) {
    this.el.ammo.textContent = cur;
    this.el.reserve.textContent = res;
  }

  setWeapon(name, slot) {
    this.el.wname.textContent = name;
    [...this.el.weaponList.children].forEach((c, i) => {
      c.classList.toggle('active', i + 1 === slot);
    });
  }

  crosshair(spread, visible) {
    this.el.crosshair.style.display = visible ? '' : 'none';
    const gap = 4 + spread * 900;
    this.el.crosshair.style.setProperty('--gap', `${Math.min(gap, 60)}px`);
  }

  scope(on) {
    this.el.scope.style.display = on ? 'block' : 'none';
  }

  hitmarker(head) {
    const el = this.el.hitmarker;
    el.style.display = 'block';
    el.classList.toggle('head', head);
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => { el.style.display = 'none'; }, 90);
  }

  damageFlash() {
    const el = this.el.vignette;
    el.style.opacity = '1';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { el.style.opacity = '0'; }, 180);
  }

  killfeed(html) {
    const div = document.createElement('div');
    div.className = 'kf-entry';
    div.innerHTML = html;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 4500);
  }

  setScore(kills, deaths) {
    this.el.score.textContent = `У: ${kills}  С: ${deaths}`;
  }

  setSpeed(v) {
    this.el.speed.textContent = `${(v * 41).toFixed(0)} u/s`;
    this.el.speed.classList.toggle('fast', v > 6.6);
  }

  scoreboard(visible, rows) {
    const sb = this.el.scoreboard;
    sb.style.display = visible ? 'block' : 'none';
    if (!visible || !rows) return;
    sb.innerHTML = `<h3>Счёт</h3><table><tr><th>Игрок</th><th>Убийства</th><th>Смерти</th></tr>${
      rows.map(r => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('')
    }</table>`;
  }

  death(visible, text) {
    this.el.death.style.display = visible ? 'block' : 'none';
    if (text) this.el.deathText.textContent = text;
  }
}
