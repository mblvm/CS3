import * as THREE from 'three';
import { losClear } from './utils.js';

// Миникарта (радар): вид сверху, север вверху.
// Статичная геометрия запекается один раз в offscreen-canvas,
// поверх каждый кадр рисуются игрок, союзники, замеченные враги и бомба.
const WORLD = { minX: -57, maxX: 57, minZ: -47, maxZ: 47 };
const SPOT_TIME = 2.5; // сколько секунд враг остаётся на радаре после потери из виду

export class Radar {
  constructor(canvas, colliders, sites) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.sx = this.w / (WORLD.maxX - WORLD.minX);
    this.sz = this.h / (WORLD.maxZ - WORLD.minZ);
    this.spotted = new Map(); // бот → оставшееся время отметки
    this.visionT = 0;
    this._eye = new THREE.Vector3();
    this._botEye = new THREE.Vector3();
    this._bakeBackground(colliders, sites);
  }

  _toX(wx) { return (wx - WORLD.minX) * this.sx; }
  _toY(wz) { return (wz - WORLD.minZ) * this.sz; }

  _bakeBackground(colliders, sites) {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(12, 14, 18, 0.92)';
    g.fillRect(0, 0, this.w, this.h);
    // след коллайдеров: высокие — стены, низкие — ящики
    for (const col of colliders) {
      const h = col.max.y - col.min.y;
      g.fillStyle = h > 4 ? '#57503f' : '#3d3a30';
      g.fillRect(
        this._toX(col.min.x), this._toY(col.min.z),
        (col.max.x - col.min.x) * this.sx, (col.max.z - col.min.z) * this.sz,
      );
    }
    // буквы точек закладки
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const k of Object.keys(sites)) {
      const s = sites[k];
      g.fillStyle = 'rgba(255, 179, 64, 0.8)';
      g.fillText(k, this._toX(s.cx), this._toY(s.cz));
    }
    this.bg = c;
  }

  _dot(x, y, r, color) {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  update(dt, { player, bots, game, colliders }) {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.bg, 0, 0);

    // обновляем «замеченность» врагов (лучи считаем на 10 Гц)
    this.visionT -= dt;
    const checkVision = this.visionT <= 0 && player.alive;
    if (checkVision) this.visionT = 0.1;
    player.eyePos(this._eye);
    for (const b of bots.enemiesOfPlayer()) {
      if (!b.alive) { this.spotted.delete(b); continue; }
      let t = this.spotted.get(b) ?? 0;
      if (checkVision) {
        b.eyePos(this._botEye);
        if (this._eye.distanceTo(this._botEye) < 70 && losClear(this._eye, this._botEye, colliders)) {
          t = SPOT_TIME;
        }
      }
      t -= dt;
      if (t > 0) this.spotted.set(b, t);
      else this.spotted.delete(b);
    }

    // бомба: носитель своей команды — всегда, установленная/брошенная — всем
    if (game && game.phase !== 'idle') {
      let bombXZ = null;
      if (game.bombState === 'planted' || game.bombState === 'dropped') {
        bombXZ = game.bombPos;
      } else if (game.carrier && player.team === 'T') {
        bombXZ = game.carrier.pos;
      }
      if (bombXZ) {
        const blink = game.bombState !== 'planted' || Math.sin(performance.now() / 120) > -0.3;
        if (blink) {
          g.fillStyle = '#ff5030';
          const x = this._toX(bombXZ.x), y = this._toY(bombXZ.z);
          g.fillRect(x - 3, y - 3, 6, 6);
        }
      }
    }

    // союзники — зелёные точки
    for (const b of bots.bots) {
      if (b.team !== player.team || !b.alive) continue;
      this._dot(this._toX(b.pos.x), this._toY(b.pos.z), 2.5, '#5fd06a');
    }

    // замеченные враги — красные, гаснут со временем
    for (const [b, t] of this.spotted) {
      g.globalAlpha = Math.min(t / SPOT_TIME + 0.25, 1);
      this._dot(this._toX(b.pos.x), this._toY(b.pos.z), 2.5, '#ff4a3c');
      g.globalAlpha = 1;
    }

    // игрок — белая стрелка по направлению взгляда
    if (player.alive) {
      const x = this._toX(player.pos.x), y = this._toY(player.pos.z);
      g.save();
      g.translate(x, y);
      g.rotate(-player.yaw); // yaw=0 → взгляд на север (вверх)
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(3.6, 4);
      g.lineTo(0, 2);
      g.lineTo(-3.6, 4);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}
