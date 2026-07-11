import * as THREE from 'three';
import { damp, raycastWorld } from './utils.js';
import { WEAPONS } from './weapons.js';

const DELAY = 1.6;  // пауза после смерти перед переключением камеры, сек
const BACK = 3.1;   // отступ камеры за спину союзника
const UP = 0.85;    // подъём камеры над глазами

// Режим наблюдения после смерти: камера от третьего лица следует за живым
// союзником, ЛКМ переключает на следующего. Панель HUD показывает имя,
// оружие и HP наблюдаемого и список остальных живых союзников.
export class Spectator {
  constructor({ camera, player, bots, weapons, hud, colliders, game }) {
    this.camera = camera;
    this.player = player;
    this.bots = bots;
    this.weapons = weapons;
    this.hud = hud;
    this.colliders = colliders;
    this.game = game;
    this.active = false;
    this.target = null;
    this.delayT = 0;
    this._camPos = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  _allies() {
    return this.bots.bots.filter((b) => b.team === this.player.team && b.alive);
  }

  update(dt, input) {
    const g = this.game;
    const phaseOk = g.phase === 'live' || g.phase === 'planted' || g.phase === 'end';
    if (this.player.alive || !phaseOk) {
      this._stop();
      this.delayT = 0;
      return;
    }

    // умерли с прицелом AWP — снять затемнение сразу
    if (this.weapons.scoped) this.weapons._setScope(false);

    this.delayT += dt;
    if (this.delayT < DELAY) { input.click0 = false; return; }

    const allies = this._allies();
    if (!allies.length) {
      // наблюдать не за кем — обычный экран смерти
      this._stop();
      this.hud.death(true, 'Наблюдайте за раундом');
      return;
    }

    // выбор цели: ЛКМ — следующий союзник, погибшая цель сменяется сама
    let idx = allies.indexOf(this.target);
    if (input.click0) {
      input.click0 = false;
      idx = (idx + 1) % allies.length;
    }
    if (idx < 0) idx = 0;
    let snap = false;
    if (allies[idx] !== this.target) { this.target = allies[idx]; snap = true; }
    if (!this.active) { this._start(); snap = true; }

    this._updateCamera(dt, snap);
    this._updateHud(allies);
  }

  _start() {
    this.active = true;
    this.hud.death(false);
    this.hud.crosshair(0, false);
    this.weapons.viewRoot.visible = false; // своё оружие в кадре не нужно
  }

  _stop() {
    this.target = null;
    if (!this.active) return;
    this.active = false;
    this.hud.spectate(null);
    this.weapons.viewRoot.visible = !this.weapons.scoped;
  }

  _updateCamera(dt, snap) {
    const t = this.target;
    t.eyePos(this._eye);
    const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);

    // желаемая точка — за спиной и выше; не даём камере уйти за стену
    this._desired.set(this._eye.x - fx * BACK, this._eye.y + UP, this._eye.z - fz * BACK);
    this._dir.copy(this._desired).sub(this._eye);
    const dist = this._dir.length();
    this._dir.divideScalar(dist);
    const tWall = raycastWorld(this._eye, this._dir, dist, this.colliders);
    const d = Math.max(Math.min(dist, tWall - 0.25), 0.4);
    this._desired.copy(this._eye).addScaledVector(this._dir, d);

    if (snap) this._camPos.copy(this._desired);
    else {
      this._camPos.x = damp(this._camPos.x, this._desired.x, 9, dt);
      this._camPos.y = damp(this._camPos.y, this._desired.y, 9, dt);
      this._camPos.z = damp(this._camPos.z, this._desired.z, 9, dt);
    }
    this.camera.position.copy(this._camPos);
    // точка взгляда чуть ниже глаз — союзник в кадре выше панели HUD
    this._look.set(this._eye.x + fx * 3, this._eye.y - 0.25, this._eye.z + fz * 3);
    this.camera.lookAt(this._look);
  }

  _updateHud(allies) {
    this.hud.spectate({
      name: this.target.name,
      hp: Math.ceil(this.target.hp),
      weapon: WEAPONS[this.target.weaponKey].name,
      allies: allies.map((a) => ({
        name: a.name,
        hp: Math.ceil(a.hp),
        weapon: WEAPONS[a.weaponKey].name,
        current: a === this.target,
      })),
    });
  }
}
