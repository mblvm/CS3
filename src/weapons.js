import * as THREE from 'three';
import { clamp, gauss, damp, raycastWorld, rayAABB, raySphere } from './utils.js';

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
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a26 });
    const green = new THREE.MeshLambertMaterial({ color: 0x3d4b3a });

    const bx = (w, h, d, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      return m;
    };

    this.viewRoot = new THREE.Group();
    this.viewRoot.position.set(0.28, -0.26, -0.55);
    this.camera.add(this.viewRoot);

    this.models = {};

    const knife = new THREE.Group();
    knife.add(bx(0.035, 0.045, 0.14, dark, 0, 0, 0.07));
    knife.add(bx(0.012, 0.05, 0.26, steel, 0, 0.01, -0.13));
    this.models.knife = knife;

    const usp = new THREE.Group();
    usp.add(bx(0.05, 0.11, 0.19, dark, 0, -0.02, 0));
    usp.add(bx(0.035, 0.045, 0.24, steel, 0, 0.045, -0.16));
    this.models.usp = usp;

    const ak = new THREE.Group();
    ak.add(bx(0.06, 0.1, 0.5, dark, 0, 0, -0.05));
    ak.add(bx(0.04, 0.04, 0.32, steel, 0, 0.02, -0.42));
    ak.add(bx(0.05, 0.2, 0.09, dark, 0, -0.13, 0.02, 0.45));
    ak.add(bx(0.055, 0.09, 0.22, wood, 0, -0.005, 0.31));
    this.models.ak = ak;

    const awp = new THREE.Group();
    awp.add(bx(0.06, 0.09, 0.78, green, 0, 0, -0.1));
    awp.add(bx(0.035, 0.035, 0.4, dark, 0, 0.015, -0.6));
    const scopeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), dark);
    scopeMesh.rotation.x = Math.PI / 2;
    scopeMesh.position.set(0, 0.09, -0.12);
    awp.add(scopeMesh);
    awp.add(bx(0.05, 0.11, 0.16, green, 0, -0.01, 0.35));
    this.models.awp = awp;

    for (const k in this.models) {
      this.models[k].visible = false;
      this.viewRoot.add(this.models[k]);
    }
    this.models[this.currentKey].visible = true;
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

  _syncWeaponHud() {
    this.hud.setWeapon(this.weapon.name, this.weapon.slot);
    this.hud.setWeapons(Object.values(WEAPONS).map((w) => ({
      slot: w.slot,
      name: w.name,
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

    this.hud.crosshair(this.computeSpread(), !this.scoped && !this.weapon.melee);
  }
}
