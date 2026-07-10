// Управление DOM-оверлеем: прицел, HP/броня, деньги, таймер, киллфид,
// баннеры, прогресс установки/разминирования, меню закупки, табло.
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'),
      hp: $('hp'),
      hpBox: $('hp-box'),
      armor: $('armor'),
      money: $('money'),
      ammo: $('ammo'),
      reserve: $('reserve'),
      wname: $('wname'),
      weaponList: $('weapon-list'),
      killfeed: $('killfeed'),
      hitmarker: $('hitmarker'),
      vignette: $('damage-vignette'),
      scope: $('scope'),
      timer: $('timer'),
      scoreMy: $('score-my'),
      scoreEnemy: $('score-enemy'),
      roundNum: $('round-num'),
      sideMy: $('side-my'),
      sideEnemy: $('side-enemy'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      progress: $('progress'),
      progressLabel: $('progress-label'),
      progressFill: $('progress-fill'),
      hint: $('bomb-hint'),
      buy: $('buy-menu'),
      buyMoney: $('buy-money'),
      buyItems: $('buy-items'),
      scoreboard: $('scoreboard'),
      death: $('death-screen'),
      deathText: $('death-text'),
      speed: $('speed'),
      gameover: $('gameover'),
      gameoverTitle: $('gameover-title'),
      gameoverScore: $('gameover-score'),
      gameoverSub: $('gameover-sub'),
    };
    this._hitT = null;
    this._dmgT = null;
    this._bannerT = null;
    this._timerText = '';
    this._hintText = null;
  }

  setHP(hp) {
    this.el.hp.textContent = Math.ceil(hp);
    this.el.hpBox.classList.toggle('low', hp <= 30);
  }

  setArmor(a) {
    this.el.armor.textContent = Math.ceil(a);
  }

  setMoney(m) {
    this.el.money.textContent = `$${m}`;
  }

  setAmmo(cur, res) {
    this.el.ammo.textContent = cur;
    this.el.reserve.textContent = res;
  }

  setWeapon(name) {
    this.el.wname.textContent = name;
  }

  // список слотов оружия: некупленное скрыто
  setWeapons(rows) {
    this.el.weaponList.innerHTML = rows
      .filter((r) => r.owned)
      .map((r) => `<div class="${r.active ? 'active' : ''}">${r.slot} · ${r.name}</div>`)
      .join('');
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
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 5000);
  }

  // таймер: раунд — белый, бомба — красный, подготовка — приглушённый
  setTimer(seconds, mode) {
    const s = Math.max(0, Math.ceil(seconds));
    const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (text !== this._timerText) {
      this._timerText = text;
      this.el.timer.textContent = text;
    }
    this.el.timer.classList.toggle('bomb', mode === 'bomb');
    this.el.timer.classList.toggle('freeze', mode === 'freeze');
  }

  setRoundScore(my, enemy, roundNum, mySide) {
    this.el.scoreMy.textContent = my;
    this.el.scoreEnemy.textContent = enemy;
    this.el.roundNum.textContent = `Раунд ${roundNum}`;
    this.el.sideMy.textContent = mySide === 'T' ? 'T (вы)' : 'CT (вы)';
    this.el.sideEnemy.textContent = mySide === 'T' ? 'CT' : 'T';
  }

  // крупное объявление по центру экрана
  banner(title, sub = '', dur = 2.5, tone = '') {
    const el = this.el.banner;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    el.className = tone; // '', 'win' или 'lose'
    el.style.display = 'block';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { el.style.display = 'none'; }, dur * 1000);
  }

  progress(label, frac) {
    this.el.progress.style.display = 'block';
    this.el.progressLabel.textContent = label;
    this.el.progressFill.style.width = `${Math.min(frac * 100, 100)}%`;
  }

  hideProgress() {
    this.el.progress.style.display = 'none';
  }

  bombHint(text) {
    if (text === this._hintText) return;
    this._hintText = text;
    this.el.hint.style.display = text ? 'block' : 'none';
    if (text) this.el.hint.textContent = text;
  }

  // меню закупки (управление клавишами)
  buyMenu(visible, money, items) {
    this.el.buy.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    this.el.buyMoney.textContent = `$${money}`;
    this.el.buyItems.innerHTML = items.map((it) => {
      const cls = it.owned ? 'owned' : (it.affordable ? '' : 'poor');
      const note = it.owned ? 'куплено' : `$${it.price}`;
      return `<div class="buy-item ${cls}"><span class="bkey">${it.hotkey}</span> ${it.label}<span class="bprice">${note}</span></div>`;
    }).join('');
  }

  setSpeed(v) {
    this.el.speed.textContent = `${(v * 41).toFixed(0)} u/s`;
    this.el.speed.classList.toggle('fast', v > 6.6);
  }

  // табло (Tab): две команды
  scoreboard(visible, data) {
    const sb = this.el.scoreboard;
    sb.style.display = visible ? 'block' : 'none';
    if (!visible || !data) return;
    const table = (label, rows, cls) => `
      <h3 class="${cls}">${label}</h3>
      <table><tr><th>Игрок</th><th>У</th><th>С</th><th>$</th></tr>${
        rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.money != null ? '$' + r.money : '—'}</td></tr>`).join('')
      }</table>`;
    sb.innerHTML = table(data.myLabel, data.my, 'my') + table(data.enemyLabel, data.enemy, 'enemy');
  }

  death(visible, text) {
    this.el.death.style.display = visible ? 'block' : 'none';
    if (text) this.el.deathText.textContent = text;
  }

  // экран окончания матча
  gameOver(visible, won, scoreText, sub = '') {
    this.el.gameover.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    this.el.gameoverTitle.textContent = won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    this.el.gameoverTitle.className = won ? 'win' : 'lose';
    this.el.gameoverScore.textContent = scoreText;
    this.el.gameoverSub.textContent = sub;
    this.el.gameoverSub.style.display = sub ? '' : 'none';
  }
}
