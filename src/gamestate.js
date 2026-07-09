import * as THREE from 'three';
import { clamp, randInt } from './utils.js';

// Правила матча
export const RULES = {
  winScore: 13,    // раундов до победы в матче
  halfRounds: 12,  // после стольких раундов — смена сторон
  freezeTime: 3,   // подготовка перед раундом, сек
  buyTime: 10,     // окно закупки после подготовки, сек
  roundTime: 115,  // длительность раунда, сек
  bombTime: 40,    // таймер бомбы после установки, сек
  plantTime: 3.2,  // время установки (удерживать E)
  defuseTime: 6,   // время разминирования (удерживать E)
  endPause: 4,     // пауза между раундами
};

// Экономика
export const ECON = {
  start: 800,          // стартовые деньги половины
  kill: 300,           // за фраг
  knifeKill: 1500,     // за фраг ножом
  win: 3250,           // команде за победу в раунде
  winBomb: 3500,       // T за победу взрывом
  lossBase: 1400,      // базовая компенсация за поражение
  lossStep: 500,       // прибавка за серию поражений
  lossMax: 3400,       // потолок компенсации
  plant: 300,          // установившему бомбу
  plantLossTeam: 800,  // T за установку даже при поражении
  defuse: 300,         // разминировавшему
  cap: 16000,          // максимум денег
};

// Прайс закупки (клавиши 1..3 в меню закупки)
export const PRICES = [
  { key: 'ak', label: 'AK-47', price: 2700, hotkey: 1 },
  { key: 'awp', label: 'AWP', price: 4750, hotkey: 2 },
  { key: 'armor', label: 'Броня (кевлар)', price: 650, hotkey: 3 },
];

const TEAM_LABEL = { T: 'Террористы', CT: 'Спецназ' };

// Оркестратор матча: фазы раунда, бомба, экономика, счёт, победа.
export class GameState {
  constructor({ player, bots, weapons, hud, audio, effects, scene, sites, spawns }) {
    this.player = player;
    this.bots = bots;
    this.weapons = weapons;
    this.hud = hud;
    this.audio = audio;
    this.effects = effects;
    this.scene = scene;
    this.sites = sites;
    this.spawns = spawns;
    this.rules = RULES;

    this.phase = 'idle'; // idle | freeze | live | planted | end | gameover
    this.buyOpen = false;
    this._buildBombMesh();
  }

  _buildBombMesh() {
    // модель бомбы: тёмный корпус + мигающая красная лампочка
    this.bombMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.26),
      new THREE.MeshLambertMaterial({ color: 0x23261f }),
    );
    body.position.y = 0.07;
    this.bombLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    this.bombLamp.position.set(0.1, 0.15, 0);
    this.bombMesh.add(body, this.bombLamp);
    this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
  }

  // --- матч ---
  startMatch(difficulty) {
    this.playerSide = 'T';
    this.player.team = 'T';
    this.score = { my: 0, enemy: 0 };
    this.roundNum = 0;
    this.money = ECON.start;
    this.lossStreak = 0;
    this.swapped = false;
    this.playerKills = 0;
    this.playerDeaths = 0;
    this.bots.setDifficulty(difficulty);
    this.bots.buildTeams(this.playerSide);
    this.weapons.resetLoadout();
    this.player.armor = 0;
    this.hud.setMoney(this.money);
    this.startRound();
  }

  startRound() {
    this.roundNum++;
    this.phase = 'freeze';
    this.phaseT = RULES.freezeTime;
    this.roundT = RULES.roundTime;
    this.bombT = RULES.bombTime;
    this.plantP = 0;
    this.defuseP = 0;
    this.beepT = 0;
    this.buyOpen = false;

    // бомба: сайт раунда и носитель — случайный из T (может быть игрок)
    this.bombState = 'carried';
    this.bombPos = new THREE.Vector3();
    this.bombMesh.visible = false;
    this.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    const ts = this.bots.entitiesOf('T');
    this.carrier = ts[randInt(0, ts.length - 1)];
    this.planter = null;

    // расстановка
    const sp = this.spawns[this.playerSide];
    this.player.spawn(sp.player);
    this.weapons.roundRefill();
    this.bots.roundStart();

    // HUD
    this.hud.death(false);
    this.hud.setHP(this.player.hp);
    this.hud.setArmor(this.player.armor);
    this.hud.setRoundScore(this.score.my, this.score.enemy, this.roundNum, this.playerSide);
    this.hud.banner(`Раунд ${this.roundNum}`, `Вы — ${TEAM_LABEL[this.playerSide].toLowerCase()} · закупка на B`, 2.5);
    this.hud.hideProgress();
    this._syncBuyMenu();
  }

  // --- закупка ---
  canBuy() {
    if (!this.player.alive) return false;
    if (this.phase === 'freeze') return true;
    return this.phase === 'live' && (RULES.roundTime - this.roundT) < RULES.buyTime;
  }

  toggleBuy() {
    if (this.buyOpen) { this.buyOpen = false; }
    else if (this.canBuy()) { this.buyOpen = true; }
    else { this.hud.banner('Время закупки вышло', '', 1.2); }
    this._syncBuyMenu();
  }

  buyKey(n) {
    const item = PRICES.find((p) => p.hotkey === n);
    if (!item || !this.buyOpen) return;
    if (item.key === 'armor') {
      if (this.player.armor >= 100 || this.money < item.price) return;
      this.player.armor = 100;
      this.hud.setArmor(100);
    } else {
      if (this.weapons.owned[item.key] || this.money < item.price) return;
      this.weapons.buy(item.key);
    }
    this.money -= item.price;
    this.hud.setMoney(this.money);
    this.audio.cash();
    this._syncBuyMenu();
  }

  _syncBuyMenu() {
    const items = PRICES.map((p) => ({
      ...p,
      owned: p.key === 'armor' ? this.player.armor >= 100 : !!this.weapons.owned[p.key],
      affordable: this.money >= p.price,
    }));
    this.hud.buyMenu(this.buyOpen && this.canBuy(), this.money, items);
  }

  addMoney(v) {
    this.money = clamp(this.money + v, 0, ECON.cap);
    this.hud.setMoney(this.money);
  }

  // --- бомба ---
  inSite(p) {
    for (const k of Object.keys(this.sites)) {
      const s = this.sites[k];
      if (Math.abs(p.x - s.cx) <= s.hw && Math.abs(p.z - s.cz) <= s.hd) return k;
    }
    return null;
  }

  plantBomb(planter) {
    if (this.phase !== 'live') return;
    this.phase = 'planted';
    this.bombState = 'planted';
    this.bombT = RULES.bombTime;
    this.bombPos.set(planter.pos.x, 0.02, planter.pos.z);
    this.bombMesh.position.copy(this.bombPos);
    this.bombMesh.visible = true;
    this.planter = planter;
    this.carrier = null;
    if (planter === this.player) this.addMoney(ECON.plant);
    this.audio.planted();
    const site = this.inSite(this.bombPos) || this.targetSite;
    this.hud.banner('Бомба установлена!', `Точка ${site} · 40 секунд до взрыва`, 2.5);
    this.hud.killfeed(`<b>${planter === this.player ? 'Вы' : planter.name}</b> установил бомбу (${site})`);
  }

  bombDefused(defuser) {
    if (this.phase !== 'planted') return;
    this.bombMesh.visible = false;
    this.audio.defused();
    if (defuser === this.player) this.addMoney(ECON.defuse);
    this.hud.killfeed(`<b>${defuser === this.player ? 'Вы' : defuser.name}</b> обезвредил бомбу`);
    this.endRound('CT', 'defuse');
  }

  _explode() {
    this.bombMesh.visible = false;
    this.effects.explosion(this.bombPos);
    this.audio.explosion();
    // урон по всем в радиусе (бомба не различает команды)
    const R = 20, MAX = 240;
    for (const b of this.bots.bots) {
      if (!b.alive) continue;
      const d = b.pos.distanceTo(this.bombPos);
      if (d < R) b.takeDamage(MAX * (1 - d / R), false, null);
    }
    if (this.player.alive) {
      const d = this.player.pos.distanceTo(this.bombPos);
      if (d < R) this.hurtPlayer(MAX * (1 - d / R), null, 'Взрыв бомбы');
    }
    this.endRound('T', 'bomb');
  }

  // выпадение бомбы при смерти носителя
  onEntityDeath(entity) {
    if (this.carrier === entity && this.bombState === 'carried') {
      this.bombState = 'dropped';
      this.bombPos.set(entity.pos.x, 0.02, entity.pos.z);
      this.bombMesh.position.copy(this.bombPos);
      this.bombMesh.visible = true;
      this.carrier = null;
      if (this.playerSide === 'T') this.hud.killfeed('Бомба брошена на земле');
    }
  }

  _tryPickup() {
    if (this.bombState !== 'dropped') return;
    for (const e of this.bots.entitiesOf('T')) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.bombPos.x, dz = e.pos.z - this.bombPos.z;
      if (dx * dx + dz * dz < 1.3 * 1.3) {
        this.carrier = e;
        this.bombState = 'carried';
        this.bombMesh.visible = false;
        if (e === this.player) this.hud.killfeed('<b>Вы</b> подобрали бомбу');
        return;
      }
    }
  }

  // --- урон и фраги ---
  hurtPlayer(dmg, attackerBot, sourceName) {
    const p = this.player;
    if (!p.alive) return;
    const died = p.damage(dmg);
    this.hud.setHP(p.hp);
    this.hud.setArmor(p.armor);
    this.hud.damageFlash();
    this.audio.hurt();
    if (died) {
      this.playerDeaths++;
      if (attackerBot) attackerBot.kills++;
      const killer = attackerBot ? attackerBot.name : (sourceName || '');
      this.hud.killfeed(`<b>${killer}</b> убил вас`);
      this.hud.death(true, 'Наблюдайте за раундом');
      this.hud.bombHint(null);
      this.hud.hideProgress();
      this.onEntityDeath(p);
    }
  }

  // фраг игрока (из WeaponSystem)
  onPlayerKill(bot, weapon, headshot) {
    this.playerKills++;
    this.addMoney(weapon.key === 'knife' ? ECON.knifeKill : ECON.kill);
    this.hud.killfeed(`Вы <b>убили ${bot.name}</b> (${weapon.name}${headshot ? ', в голову' : ''})`);
  }

  // фраг бота по боту
  onBotKilled(attacker, victim, headshot) {
    this.hud.killfeed(`${attacker.name} убил <b>${victim.name}</b>${headshot ? ' (в голову)' : ''}`);
  }

  // --- завершение раунда ---
  endRound(winner, reason) {
    if (this.phase === 'end' || this.phase === 'gameover') return;
    const bombWasPlanted = this.bombState === 'planted';
    this.phase = 'end';
    this.phaseT = RULES.endPause;
    this.buyOpen = false;
    this._syncBuyMenu();
    this.hud.hideProgress();

    const myWin = winner === this.playerSide;
    if (myWin) this.score.my++; else this.score.enemy++;

    // экономика игрока
    let inc = 0;
    if (myWin) {
      this.lossStreak = 0;
      inc += (winner === 'T' && reason === 'bomb') ? ECON.winBomb : ECON.win;
    } else {
      inc += Math.min(ECON.lossBase + this.lossStreak * ECON.lossStep, ECON.lossMax);
      this.lossStreak++;
      // T поставили бомбу, но проиграли — бонус за установку
      if (this.playerSide === 'T' && bombWasPlanted && reason === 'defuse') inc += ECON.plantLossTeam;
    }
    // погибший теряет купленное оружие и броню
    if (!this.player.alive) {
      this.weapons.stripBought();
      this.player.armor = 0;
    }
    this.addMoney(inc);

    const reasonText = {
      elim: 'команда противника уничтожена',
      time: 'время раунда вышло',
      bomb: 'бомба взорвалась',
      defuse: 'бомба обезврежена',
    }[reason] || '';
    this.hud.banner(
      `${TEAM_LABEL[winner]} побеждают`,
      `${reasonText} · +$${inc}`,
      RULES.endPause - 0.5,
      myWin ? 'win' : 'lose',
    );
    this.hud.setRoundScore(this.score.my, this.score.enemy, this.roundNum, this.playerSide);
    this.audio.sting(myWin);
  }

  _afterRound() {
    // конец матча?
    if (this.score.my >= RULES.winScore || this.score.enemy >= RULES.winScore) {
      this.phase = 'gameover';
      const won = this.score.my > this.score.enemy;
      this.hud.gameOver(true, won, `${this.score.my} : ${this.score.enemy}`);
      this.audio.sting(won);
      document.exitPointerLock?.(); // курсор для кнопки «В главное меню»
      return;
    }
    // смена сторон после первой половины
    if (this.roundNum === RULES.halfRounds && !this.swapped) {
      this.swapped = true;
      this.playerSide = this.playerSide === 'T' ? 'CT' : 'T';
      this.player.team = this.playerSide;
      this.money = ECON.start;
      this.lossStreak = 0;
      this.weapons.resetLoadout();
      this.player.armor = 0;
      this.bots.buildTeams(this.playerSide);
      this.hud.setMoney(this.money);
      this.hud.banner('Смена сторон', `Теперь вы — ${TEAM_LABEL[this.playerSide].toLowerCase()}`, 3);
    }
    this.startRound();
  }

  // --- установка/разминирование игроком (удержание E) ---
  _playerPlant(dt, useHeld) {
    const p = this.player;
    if (this.playerSide !== 'T' || this.carrier !== p || !p.alive) return;
    const site = this.inSite(p.pos);
    this.hud.bombHint(site
      ? 'Удерживайте E — установка бомбы'
      : `У вас бомба — доставьте её на точку ${this.targetSite}`);
    if (site && useHeld && p.onGround && p.horizSpeed < 1.5) {
      this.plantP += dt;
      this.hud.progress('Установка бомбы…', this.plantP / RULES.plantTime);
      if (this.plantP >= RULES.plantTime) {
        this.hud.hideProgress();
        this.hud.bombHint(null);
        this.plantBomb(p);
      }
    } else if (this.plantP > 0) {
      this.plantP = 0;
      this.hud.hideProgress();
    }
  }

  _playerDefuse(dt, useHeld) {
    const p = this.player;
    if (this.playerSide !== 'CT' || !p.alive) return;
    const near = p.pos.distanceTo(this.bombPos) < 1.9;
    this.hud.bombHint(near ? 'Удерживайте E — разминирование' : null);
    if (near && useHeld && p.onGround) {
      this.defuseP += dt;
      this.hud.progress('Разминирование…', this.defuseP / RULES.defuseTime);
      if (this.defuseP >= RULES.defuseTime) {
        this.hud.hideProgress();
        this.hud.bombHint(null);
        this.bombDefused(p);
      }
    } else if (this.defuseP > 0) {
      this.defuseP = 0;
      this.hud.hideProgress();
    }
  }

  _checkElims() {
    const tAlive = this.bots.aliveOf('T');
    const ctAlive = this.bots.aliveOf('CT');
    if (this.phase === 'live') {
      if (tAlive === 0) this.endRound('CT', 'elim');
      else if (ctAlive === 0) this.endRound('T', 'elim');
    } else if (this.phase === 'planted') {
      // после установки T побеждают, если некому разминировать;
      // гибель всех T раунд не заканчивает — бомба решает
      if (ctAlive === 0) this.endRound('T', 'elim');
    }
  }

  // движение заблокировано? (подготовка перед раундом)
  get movementLocked() { return this.phase === 'freeze'; }
  // стрельба разрешена только в активных фазах
  get combatAllowed() { return this.phase === 'live' || this.phase === 'planted'; }

  update(dt, input) {
    const useHeld = input.keys.has('use');
    switch (this.phase) {
      case 'freeze': {
        this.phaseT -= dt;
        this.hud.setTimer(this.roundT, 'freeze');
        if (this.phaseT <= 0) this.phase = 'live';
        break;
      }
      case 'live': {
        this.roundT -= dt;
        this.hud.setTimer(this.roundT, 'round');
        this._tryPickup();
        this._playerPlant(dt, useHeld);
        this._checkElims();
        if (this.phase === 'live' && this.roundT <= 0) this.endRound('CT', 'time');
        break;
      }
      case 'planted': {
        this.bombT -= dt;
        this.hud.setTimer(this.bombT, 'bomb');
        // ускоряющийся писк и мигание лампочки
        this.beepT -= dt;
        if (this.beepT <= 0) {
          this.beepT = 0.12 + (this.bombT / RULES.bombTime) * 0.9;
          this.audio.beep();
        }
        this.bombLamp.visible = this.beepT > (0.06 + (this.bombT / RULES.bombTime) * 0.45);
        this._playerDefuse(dt, useHeld);
        this._checkElims();
        if (this.phase === 'planted' && this.bombT <= 0) this._explode();
        break;
      }
      case 'end': {
        this.phaseT -= dt;
        if (this.phaseT <= 0) this._afterRound();
        break;
      }
    }
    // окно закупки закрылось — прячем меню
    if (this.buyOpen && !this.canBuy()) {
      this.buyOpen = false;
      this._syncBuyMenu();
    }
    if (!this.player.alive || this.carrier !== this.player) {
      if (this.phase === 'live' && this.playerSide === 'T') this.hud.bombHint(null);
    }
    if (this.phase === 'end' || this.phase === 'gameover') this.hud.bombHint(null);
  }

  // строки для табло (Tab)
  scoreboardData() {
    const mySide = this.playerSide;
    const enemySide = mySide === 'T' ? 'CT' : 'T';
    const row = (b) => ({ name: b.name, kills: b.kills, deaths: b.deaths });
    const my = [
      { name: 'Вы', kills: this.playerKills, deaths: this.playerDeaths, me: true, money: this.money },
      ...this.bots.bots.filter((b) => b.team === mySide).map(row),
    ].sort((a, b) => b.kills - a.kills);
    const enemy = this.bots.bots.filter((b) => b.team === enemySide).map(row)
      .sort((a, b) => b.kills - a.kills);
    return {
      myLabel: `${TEAM_LABEL[mySide]} (вы) — ${this.score.my}`,
      enemyLabel: `${TEAM_LABEL[enemySide]} — ${this.score.enemy}`,
      my, enemy,
    };
  }
}
