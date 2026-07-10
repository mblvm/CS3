import * as THREE from 'three';
import { clamp, gauss, damp, raycastWorld, rayAABB, raySphere } from './utils.js';
import { skinTexture } from './cases.js';

const D2R = Math.PI / 180;

// Паттерн отдачи AK: сначала подъём вверх, затем зигзаг вправо-влево.
function akPattern() {
  const p = [];
  for (let i = 0; i < 30; i++) {
    let pitch, yaw;
    if (i === 0) { pitch = 0.55; yaw = 0; }
    else if (i < 10) { pitch = 1.9 - i * 0.09; yaw = Math.sin(i * 0.9) * 0.28; }
    else if (i < 16) { pitch = 0.5; yaw = 1.0; }
    else if (i < 23) { pitch = 0.45; yaw = -1.2; }
    else { pitch = 0.45; yaw = 1.05; }
    p.push([pitch * D2R, yaw * D2R]);
  }
  return p;
}

export const WEAPONS = {
  knife: {
    key: 'knife', name: 'Нож', slot: 1, melee: true,
    damage: 45, hsMult: 1, rate: 0.5, range: 2.4, moveMult: 1.08,
  },
  usp: {
    key: 'usp', name: 'USP-S', slot: 2,
    damage: 32, hsMult: 4, rate: 0.17, mag: 12, reserve: 24, reload: 2.1,
    spread: 0.005, moveSpread: 0.03, bloom: 0.004, recoil: [1.5, 0.35],
    auto: false, moveMult: 1.0, loud: false, sound: 'usp',
  },
  ak: {
    key: 'ak', name: 'AK-47', slot: 3,
    damage: 34, hsMult: 4, rate: 0.1, mag: 30, reserve: 90, reload: 2.45,
    spread: 0.0045, moveSpread: 0.07, bloom: 0.0026, pattern: akPattern(),
    auto: true, moveMult: 0.88, loud: true, sound: 'ak',
  },
  awp: {
    key: 'awp', name: 'AWP', slot: 4,
    damage: 112, hsMult: 4, rate: 1.5, mag: 5, reserve: 15, reload: 3.6,
    spread: 0.075, scopedSpread: 0.0009, moveSpread: 0.1, bloom: 0, recoil: [4.5, 0.7],
    auto: false, scope: true, moveMult: 0.75, loud: true, sound: 'awp',
  },
};

export class WeaponSystem {
  constructor({ camera, scene, player, bots, colliders, effects, audio, hud, onKill, onLoudShot }) {
    this.camera = camera;
    this.player = player;
    this.bots = bots;
    this.colliders = colliders;
    this.effects = effects;
    this.audio = audio;
    this.hud = hud;
    this.onKill = onKill;
    this.onLoudShot = onLoudShot;

    this.state = {};
    for (const k of ['usp', 'ak', 'awp']) {
      this.state[k] = { ammo: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    }
    // нож и пистолет всегда при себе, остальное покупается
    this.owned = { knife: true, usp: true, ak: false, awp: false };
    this.currentKey = 'usp';
    this.reloadT = 0;
    this.switchT = 0.4;
    this.fireT = 0;
    this.shotIndex = 0;
    this.lastFire = -10;
    this.bloom = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.scoped = false;

    this._buildViewModels();
    this._kick = 0;
    this._time = 0;
    this._syncWeaponHud();
    this._syncAmmoHud();
  }

  get weapon() { return WEAPONS[this.currentKey]; }
  get ammoState() { return this.state[this.currentKey]; }

  _buildViewModels() {
    // материалы по частям: body — красится скином, accent — рукояти/приклады,
    // metal — стволы и механика (скином не красятся)
    const std = (color, roughness, metalness) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this._mats = {
      knife: { body: std(0xc8d0d8, 0.25, 0.9), accent: std(0x26282c, 0.7, 0.2), metal: std(0x5a5f66, 0.35, 0.8) },
      usp:   { body: std(0x2e3238, 0.35, 0.7), accent: std(0x222428, 0.6, 0.3), metal: std(0x6f767e, 0.35, 0.85) },
      ak:    { body: std(0x33363b, 0.4, 0.6),  accent: std(0x6e4a26, 0.6, 0.05), metal: std(0x55595f, 0.4, 0.8) },
      awp:   { body: std(0x4a5942, 0.6, 0.15), accent: std(0x2c2f33, 0.6, 0.3), metal: std(0x3d4147, 0.4, 0.75) },
    };
    // запомнить заводской вид для снятия скина
    this._defaults = {};
    for (const k in this._mats) {
      this._defaults[k] = {
        color: this._mats[k].body.color.clone(),
        roughness: this._mats[k].body.roughness,
        metalness: this._mats[k].body.metalness,
        accent: this._mats[k].accent.color.clone(),
      };
    }

    const bx = (grp, mat, w, h, d, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.z = rz;
      grp.add(m);
      return m;
    };
    // цилиндр вдоль оси Z (стволы, глушители, прицелы)
    const cz = (grp, mat, r, len, x, y, z, seg = 12) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      grp.add(m);
      return m;
    };

    this.viewRoot = new THREE.Group();
    this.viewRoot.position.set(0.28, -0.26, -0.55);
    this.camera.add(this.viewRoot);

    this.models = {};

    // --- Нож: клинок (красится скином), гарда, рукоять с кольцами ---
    {
      const M = this._mats.knife;
      const g = new THREE.Group();
      bx(g, M.body, 0.014, 0.048, 0.28, 0, 0.012, -0.15);         // клинок
      bx(g, M.body, 0.013, 0.032, 0.07, 0, 0.02, -0.315, 0.28);   // скос к острию
      bx(g, M.metal, 0.006, 0.014, 0.26, 0, 0.038, -0.14);        // обух
      bx(g, M.metal, 0.022, 0.075, 0.018, 0, 0, -0.005);          // гарда
      bx(g, M.accent, 0.03, 0.05, 0.15, 0, -0.004, 0.085);        // рукоять
      for (const zz of [0.035, 0.085, 0.135])
        bx(g, M.metal, 0.033, 0.053, 0.007, 0, -0.004, zz);       // кольца рукояти
      bx(g, M.metal, 0.033, 0.054, 0.02, 0, -0.004, 0.168);       // навершие
      g.rotation.y = 0.35;
      this.models.knife = g;
    }

    // --- USP-S: затвор, рамка, рукоять, глушитель, прицельные ---
    {
      const M = this._mats.usp;
      const g = new THREE.Group();
      bx(g, M.body, 0.046, 0.052, 0.22, 0, 0.045, -0.05);          // затвор
      bx(g, M.metal, 0.048, 0.012, 0.06, 0, 0.045, 0.05);          // насечки затвора
      bx(g, M.accent, 0.042, 0.05, 0.19, 0, 0.0, -0.045);          // рамка
      bx(g, M.accent, 0.04, 0.125, 0.058, 0, -0.075, 0.045, 0.16); // рукоять
      bx(g, M.metal, 0.03, 0.008, 0.055, 0, -0.032, -0.01);        // скоба
      bx(g, M.metal, 0.008, 0.03, 0.008, 0, -0.02, 0.015);         // курок
      cz(g, M.metal, 0.021, 0.17, 0, 0.045, -0.245);               // глушитель
      bx(g, M.metal, 0.022, 0.012, 0.012, 0, 0.078, 0.045);        // целик
      bx(g, M.metal, 0.007, 0.012, 0.012, 0, 0.078, -0.15);        // мушка
      this.models.usp = g;
    }

    // --- AK-47: коробка, ствол, газовая трубка, дерево, магазин ---
    {
      const M = this._mats.ak;
      const g = new THREE.Group();
      bx(g, M.body, 0.05, 0.072, 0.26, 0, 0, 0.03);                // ствольная коробка
      bx(g, M.body, 0.044, 0.02, 0.22, 0, 0.046, 0.02);            // крышка
      cz(g, M.metal, 0.013, 0.34, 0, 0.018, -0.33);                // ствол
      cz(g, M.metal, 0.011, 0.16, 0, 0.052, -0.22);                // газовая трубка
      bx(g, M.accent, 0.052, 0.052, 0.17, 0, 0.002, -0.185);       // цевьё
      bx(g, M.metal, 0.009, 0.05, 0.012, 0, 0.06, -0.47);          // мушка
      cz(g, M.metal, 0.017, 0.055, 0, 0.018, -0.525, 10);          // дульный тормоз
      bx(g, M.body, 0.038, 0.13, 0.068, 0, -0.095, 0.02, 0.4);     // магазин (верх)
      bx(g, M.body, 0.038, 0.1, 0.06, 0, -0.165, 0.075, 0.8);      // магазин (изгиб)
      bx(g, M.accent, 0.036, 0.09, 0.05, 0, -0.075, 0.14, -0.22);  // рукоять
      bx(g, M.accent, 0.042, 0.07, 0.2, 0, -0.015, 0.27, 0.08);    // приклад
      bx(g, M.accent, 0.046, 0.1, 0.045, 0, -0.028, 0.365);        // затыльник
      this.models.ak = g;
    }

    // --- AWP: ложа, длинный ствол, прицел с линзой, затвор, магазин ---
    {
      const M = this._mats.awp;
      const g = new THREE.Group();
      bx(g, M.body, 0.05, 0.075, 0.5, 0, 0, -0.03);                // ложа
      cz(g, M.metal, 0.014, 0.4, 0, 0.02, -0.47);                  // ствол
      cz(g, M.metal, 0.02, 0.075, 0, 0.02, -0.68, 10);             // дульный тормоз
      cz(g, M.metal, 0.028, 0.22, 0, 0.098, -0.08);                // труба прицела
      cz(g, M.metal, 0.034, 0.03, 0, 0.098, -0.2);                 // объектив
      cz(g, M.metal, 0.034, 0.03, 0, 0.098, 0.04);                 // окуляр
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.027, 14),
        new THREE.MeshBasicMaterial({ color: 0x0a1a2c }),
      );
      lens.position.set(0, 0.098, 0.056);
      g.add(lens);
      bx(g, M.metal, 0.016, 0.035, 0.03, 0, 0.06, -0.13);          // крепление прицела
      bx(g, M.metal, 0.016, 0.035, 0.03, 0, 0.06, -0.01);          // крепление прицела
      const bolt = cz(g, M.metal, 0.008, 0.05, 0.045, 0.028, 0.09, 8);
      bolt.rotation.set(0, 0, 1.1);                                // рукоять затвора
      bx(g, M.metal, 0.04, 0.085, 0.09, 0, -0.058, -0.06);         // магазин
      bx(g, M.accent, 0.036, 0.1, 0.05, 0, -0.08, 0.14, -0.3);     // рукоять
      bx(g, M.body, 0.046, 0.1, 0.2, 0, -0.015, 0.33);             // приклад
      bx(g, M.accent, 0.05, 0.028, 0.12, 0, 0.048, 0.31);          // щека приклада
      this.models.awp = g;
    }

    for (const k in this.models) {
      this.models[k].visible = false;
      this.viewRoot.add(this.models[k]);
    }
    this.models[this.currentKey].visible = true;
  }

  // применить экипированные скины из системы кейсов ко вьюмоделям
  applySkins(caseSys) {
    this._caseSys = caseSys;
    for (const key of ['knife', 'usp', 'ak', 'awp']) {
      const mats = this._mats[key];
      const def = this._defaults[key];
      const skin = caseSys?.equippedSkin(key) || null;
      if (skin) {
        mats.body.map = skinTexture(skin);
        mats.body.color.set(0xffffff);
        mats.body.roughness = 0.38;
        mats.body.metalness = 0.45;
        mats.accent.color.set(skin.accent);
      } else {
        mats.body.map = null;
        mats.body.color.copy(def.color);
        mats.body.roughness = def.roughness;
        mats.body.metalness = def.metalness;
        mats.accent.color.copy(def.accent);
      }
      mats.body.needsUpdate = true;
    }
    this._syncWeaponHud();
  }

  selectSlot(n) {
    const key = Object.keys(WEAPONS).find(k => WEAPONS[k].slot === n);
    if (!key || key === this.currentKey || !this.owned[key]) return;
    this.models[this.currentKey].visible = false;
    this.currentKey = key;
    this.models[key].visible = true;
    this.switchT = 0.38;
    this.reloadT = 0;
    this.shotIndex = 0;
    this._setScope(false);
    this._syncWeaponHud();
    this._syncAmmoHud();
  }

  // имя с учётом экипированного скина: «AK-47 | Азимов»
  _displayName(key) {
    const skin = this._caseSys?.equippedSkin(key);
    return skin ? `${WEAPONS[key].name} | ${skin.name}` : WEAPONS[key].name;
  }

  _syncWeaponHud() {
    this.hud.setWeapon(this._displayName(this.currentKey), this.weapon.slot);
    this.hud.setWeapons(Object.values(WEAPONS).map((w) => ({
      slot: w.slot,
      name: this._displayName(w.key),
      owned: !!this.owned[w.key],
      active: w.key === this.currentKey,
    })));
  }

  // покупка оружия в меню закупки
  buy(key) {
    if (!WEAPONS[key] || this.owned[key]) return;
    this.owned[key] = true;
    this.state[key].ammo = WEAPONS[key].mag;
    this.state[key].reserve = WEAPONS[key].reserve;
    this.selectSlot(WEAPONS[key].slot);
    this._syncWeaponHud();
  }

  // потеря купленного оружия (смерть)
  stripBought() {
    this.owned.ak = false;
    this.owned.awp = false;
    if (!this.owned[this.currentKey]) {
      this.models[this.currentKey].visible = false;
      this.currentKey = 'usp';
      this.models.usp.visible = true;
      this._setScope(false);
    }
    this._syncWeaponHud();
    this._syncAmmoHud();
  }

  // сброс арсенала к пистолетному раунду (новый матч / смена сторон)
  resetLoadout() {
    this.stripBought();
    this.refill();
  }

  // пополнение патронов в начале раунда
  roundRefill() {
    this.refill();
  }

  startReload() {
    const w = this.weapon;
    if (w.melee || this.reloadT > 0 || this.switchT > 0) return;
    const st = this.ammoState;
    if (st.ammo >= w.mag || st.reserve <= 0) return;
    this.reloadT = w.reload;
    this._setScope(false);
    this.audio.reload(w.reload);
  }

  refill() {
    for (const k of ['usp', 'ak', 'awp']) {
      this.state[k].ammo = WEAPONS[k].mag;
      this.state[k].reserve = WEAPONS[k].reserve;
    }
    this.reloadT = 0;
    this._setScope(false);
    this._syncAmmoHud();
  }

  _setScope(on) {
    if (!this.weapon.scope) on = false;
    if (this.scoped === on) return;
    this.scoped = on;
    this.hud.scope(on);
    this.viewRoot.visible = !on;
  }

  computeSpread() {
    const w = this.weapon;
    if (w.melee) return 0;
    let spr = (w.scope && this.scoped) ? w.scopedSpread : w.spread;
    spr += (w.moveSpread || 0) * clamp(this.player.horizSpeed / 6, 0, 1.3);
    if (!this.player.onGround) spr += 0.045;
    if (this.player.crouching) spr *= 0.65;
    spr += this.bloom;
    return spr;
  }

  _syncAmmoHud() {
    const w = this.weapon;
    if (w.melee) this.hud.setAmmo('—', '');
    else this.hud.setAmmo(this.ammoState.ammo, `/ ${this.ammoState.reserve}`);
  }

  _muzzleWorld(out) {
    out.set(0.28, -0.2, -1.1);
    return this.camera.localToWorld(out);
  }

  tryFire() {
    if (!this.player.alive) return;
    if (this.fireT > 0 || this.switchT > 0 || this.reloadT > 0) return;
    const w = this.weapon;

    if (w.melee) {
      this.fireT = w.rate;
      this._kick = 1;
      this.audio.swing();
      this._knifeHit(w);
      return;
    }

    const st = this.ammoState;
    if (st.ammo <= 0) {
      this.audio.dryfire();
      if (st.reserve > 0) this.startReload();
      this.fireT = 0.3;
      return;
    }

    st.ammo--;
    this.fireT = w.rate;
    this._kick = 1;

    const now = this._time;
    if (now - this.lastFire > 0.4) this.shotIndex = 0;
    this.lastFire = now;

    // направление с разбросом
    const spread = this.computeSpread();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const dir = fwd.clone()
      .addScaledVector(right, gauss() * spread)
      .addScaledVector(up, gauss() * spread)
      .normalize();

    const eye = this.player.eyePos(new THREE.Vector3());
    const tWall = raycastWorld(eye, dir, 300, this.colliders);

    // проверка попадания по ботам вражеской команды (свои не под огнём)
    let hitBot = null, hitT = tWall, hitHead = false;
    for (const b of this.bots.enemiesOfPlayer()) {
      if (!b.alive) continue;
      const bodyMin = new THREE.Vector3(b.pos.x - 0.35, b.pos.y - 0.9, b.pos.z - 0.35);
      const bodyMax = new THREE.Vector3(b.pos.x + 0.35, b.pos.y + 0.6, b.pos.z + 0.35);
      const headC = new THREE.Vector3(b.pos.x, b.pos.y + 0.72, b.pos.z);
      const tHead = raySphere(eye, dir, headC, 0.22);
      const tBody = rayAABB(eye, dir, bodyMin, bodyMax);
      let t = -1, head = false;
      if (tHead >= 0 && (tBody < 0 || tHead <= tBody)) { t = tHead; head = true; }
      else if (tBody >= 0) t = tBody;
      if (t >= 0 && t < hitT) { hitT = t; hitBot = b; hitHead = head; }
    }

    const hitPoint = eye.clone().addScaledVector(dir, hitT);
    const muzzle = this._muzzleWorld(new THREE.Vector3());
    this.effects.tracer(muzzle, hitPoint);
    this.effects.muzzle(muzzle);
    this.effects.shell(muzzle, right);
    this.audio.shot(w.sound);
    if (w.loud) this.onLoudShot?.();

    if (hitBot) {
      let dmg = w.damage * clamp(1 - (hitT - 30) / 130, 0.45, 1);
      if (hitHead) dmg *= w.hsMult;
      this.effects.blood(hitPoint);
      this.audio.hit(hitHead);
      this.hud.hitmarker(hitHead);
      const died = hitBot.takeDamage(dmg, hitHead, this.player);
      if (died) this.onKill(hitBot, w, hitHead);
    } else {
      this.effects.impact(hitPoint);
    }

    // отдача камеры
    let rp, ry;
    if (w.pattern) {
      const [p, y] = w.pattern[Math.min(this.shotIndex, w.pattern.length - 1)];
      rp = p; ry = y * (0.85 + Math.random() * 0.3);
    } else {
      rp = w.recoil[0] * D2R * (0.9 + Math.random() * 0.2);
      ry = w.recoil[1] * D2R * gauss();
    }
    this.recoil.pitch += rp;
    this.recoil.yaw += ry;
    this.bloom += w.bloom;
    this.shotIndex++;

    this._syncAmmoHud();
  }

  _knifeHit(w) {
    const eye = this.player.eyePos(new THREE.Vector3());
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    for (const b of this.bots.enemiesOfPlayer()) {
      if (!b.alive) continue;
      const to = new THREE.Vector3(b.pos.x - eye.x, 0, b.pos.z - eye.z);
      const dist = to.length();
      if (dist > w.range) continue;
      to.normalize();
      const fxz = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      if (to.dot(fxz) < 0.45) continue;
      const hitP = new THREE.Vector3(b.pos.x, eye.y, b.pos.z);
      this.effects.blood(hitP);
      this.audio.hit(false);
      this.hud.hitmarker(false);
      const died = b.takeDamage(w.damage, false, this.player);
      if (died) this.onKill(b, w, false);
      break;
    }
  }

  update(dt, input) {
    this._time += dt;
    this.fireT = Math.max(0, this.fireT - dt);
    this.switchT = Math.max(0, this.switchT - dt);

    // перезарядка
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.weapon, st = this.ammoState;
        const need = w.mag - st.ammo;
        const take = Math.min(need, st.reserve);
        st.ammo += take;
        st.reserve -= take;
        this._syncAmmoHud();
      }
    }

    // стрельба
    if (input.click0) {
      input.click0 = false;
      this.tryFire();
    } else if (input.mouse0 && this.weapon.auto) {
      this.tryFire();
    }

    // прицел AWP
    if (input.click2) {
      input.click2 = false;
      if (this.weapon.scope) this._setScope(!this.scoped);
    }

    // восстановление отдачи и разброса
    this.recoil.pitch = damp(this.recoil.pitch, 0, 6.5, dt);
    this.recoil.yaw = damp(this.recoil.yaw, 0, 6.5, dt);
    this.bloom = damp(this.bloom, 0, 4, dt);

    // анимация вьюмодели
    this._kick = damp(this._kick, 0, 12, dt);
    const bobK = this.player.onGround ? clamp(this.player.horizSpeed / 6, 0, 1) : 0;
    const bob = Math.sin(this._time * 9) * 0.008 * bobK;
    const raise = this.switchT > 0 ? -this.switchT * 0.9 : 0;
    const reloadDip = this.reloadT > 0 ? -0.35 * Math.sin(Math.min(this.reloadT / this.weapon.reload, 1) * Math.PI) : 0;
    this.viewRoot.position.set(0.28, -0.26 + bob + raise * 0.3, -0.55 + this._kick * 0.07);
    this.viewRoot.rotation.x = this._kick * 0.16 + reloadDip + raise;
    // лёгкий крен при боковом движении — оружие «живее»
    const p = this.player;
    const lateral = p.vel.x * Math.cos(p.yaw) - p.vel.z * Math.sin(p.yaw);
    this.viewRoot.rotation.z = damp(this.viewRoot.rotation.z, -lateral * 0.008, 8, dt);

    this.hud.crosshair(this.computeSpread(), !this.scoped && !this.weapon.melee);
  }
}
