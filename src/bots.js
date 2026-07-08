import * as THREE from 'three';
import {
  moveAABB, raycastWorld, rayAABB, rand, randInt, clamp, gauss, turnToward, losClear,
} from './utils.js';

const NAMES = ['Phoenix', 'Balkan', 'Anarchist', 'Pirate', 'Professional', 'Elite'];

// Уровни сложности ботов
export const DIFFICULTY = {
  easy:   { count: 4, reaction: 0.85, spread: 0.05,  dmg: 0.65, view: 32, fovCos: Math.cos(1.25), turn: 2.5, burst: [2, 3], rate: 0.17, hearDist: 28, strafe: 0.4 },
  normal: { count: 5, reaction: 0.5,  spread: 0.03,  dmg: 1.0,  view: 46, fovCos: Math.cos(1.45), turn: 4.0, burst: [3, 5], rate: 0.13, hearDist: 40, strafe: 0.7 },
  hard:   { count: 6, reaction: 0.27, spread: 0.017, dmg: 1.3,  view: 62, fovCos: Math.cos(1.6),  turn: 7.0, burst: [4, 7], rate: 0.11, hearDist: 55, strafe: 1.0 },
};

const BOT_DMG = 28;
const HALF = new THREE.Vector3(0.4, 0.9, 0.4);

class Bot {
  constructor(mgr, i) {
    this.mgr = mgr;
    this.name = NAMES[i % NAMES.length];
    this.pos = new THREE.Vector3(); // центр AABB (y ≈ 0.9)
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hp = 100;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.state = 'patrol';
    this.path = [];
    this.visible = false;
    this.reactT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.shotT = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.lostT = 0;
    this.lastSeen = new THREE.Vector3();
    this.respawnT = 0;
    this.coverT = 0;
    this.lookT = 0;
    this.stuckT = 0;
    this.dieAnim = 0;
    this._buildMesh(i);
  }

  _buildMesh(i) {
    const shirt = new THREE.MeshLambertMaterial({ color: [0xc2a36a, 0xa88f56, 0xb59a63][i % 3] });
    const pants = new THREE.MeshLambertMaterial({ color: 0x4a4438 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xcf9f7a });
    const gunM = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });

    this.mesh = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.3), pants);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.34), shirt);
    torso.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skin);
    head.position.y = 1.62;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), new THREE.MeshLambertMaterial({ color: 0xa02020 }));
    band.position.y = 1.7;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.7), gunM);
    gun.position.set(0.22, 1.3, -0.25);
    for (const m of [legs, torso, head, band, gun]) {
      m.castShadow = true;
      this.mesh.add(m);
    }

    // полоска здоровья
    const hpc = document.createElement('canvas');
    hpc.width = 64; hpc.height = 8;
    this.hpCtx = hpc.getContext('2d');
    this.hpTex = new THREE.CanvasTexture(hpc);
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hpTex, depthTest: false }));
    this.hpBar.scale.set(0.8, 0.1, 1);
    this.hpBar.position.y = 2.05;
    this.mesh.add(this.hpBar);
    this._drawHp();

    this.mgr.scene.add(this.mesh);
  }

  _drawHp() {
    const g = this.hpCtx;
    g.clearRect(0, 0, 64, 8);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 64, 8);
    g.fillStyle = this.hp > 55 ? '#46c04a' : this.hp > 25 ? '#d8a72e' : '#d0392e';
    g.fillRect(1, 1, 62 * (this.hp / 100), 6);
    this.hpTex.needsUpdate = true;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 0.72, this.pos.z);
  }

  spawn(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.hp = 100;
    this.alive = true;
    this.state = 'patrol';
    this.path = [];
    this.visible = false;
    this.dieAnim = 0;
    this.yaw = rand(-Math.PI, Math.PI);
    this.mesh.visible = true;
    this.mesh.rotation.z = 0;
    this._drawHp();
  }

  takeDamage(dmg, isHead) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this._drawHp();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      this.state = 'dead';
      this.respawnT = 6;
      this.dieAnim = 0.5;
      return true;
    }
    // реагируем на урон: разворачиваемся к игроку
    const pl = this.mgr.player;
    if (pl.alive) {
      this.lastSeen.copy(pl.pos);
      if (this.state === 'patrol' || this.state === 'hunt') {
        this.state = 'combat';
        this.reactT = this.mgr.diff.reaction * 0.5;
      }
      // при низком HP — ищем укрытие
      if (this.hp < 38 && this.state === 'combat' && Math.random() < 0.6) {
        this._seekCover();
      }
    }
    return false;
  }

  // --- навигация ---
  _nearestWp(pos) {
    let best = 0, bd = Infinity;
    this.mgr.waypoints.forEach((w, i) => {
      const d = (w.p.x - pos.x) ** 2 + (w.p.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  _findPath(from, to) {
    const wps = this.mgr.waypoints;
    if (from === to) return [to];
    const prev = new Array(wps.length).fill(-1);
    const q = [from];
    prev[from] = from;
    while (q.length) {
      const cur = q.shift();
      if (cur === to) break;
      for (const e of wps[cur].edges) {
        if (prev[e] === -1) { prev[e] = cur; q.push(e); }
      }
    }
    if (prev[to] === -1) return [to];
    const path = [];
    let c = to;
    while (c !== from) { path.unshift(c); c = prev[c]; }
    return path;
  }

  _pathTo(pos) {
    this.path = this._findPath(this._nearestWp(this.pos), this._nearestWp(pos));
  }

  _seekCover() {
    // ближайшая точка, не видимая с позиции игрока
    const plEye = this.mgr.player.eyePos(new THREE.Vector3());
    const wps = this.mgr.waypoints;
    let best = -1, bd = Infinity;
    wps.forEach((w, i) => {
      const d = (w.p.x - this.pos.x) ** 2 + (w.p.z - this.pos.z) ** 2;
      if (d > 30 * 30 || d < 4) return;
      const wpEye = new THREE.Vector3(w.p.x, 1.6, w.p.z);
      if (losClear(plEye, wpEye, this.mgr.colliders)) return;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      this.path = this._findPath(this._nearestWp(this.pos), best);
      this.state = 'cover';
      this.coverT = rand(1.4, 2.4);
    }
  }

  _followPath(dt, speed) {
    if (!this.path.length) return true;
    const target = this.mgr.waypoints[this.path[0]].p;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.4) {
      this.path.shift();
      return this.path.length === 0;
    }
    const desiredYaw = Math.atan2(-dx, -dz);
    this.yaw = turnToward(this.yaw, desiredYaw, this.mgr.diff.turn * 1.5 * dt);
    this.vel.x = (dx / dist) * speed;
    this.vel.z = (dz / dist) * speed;
    // застряли?
    if (Math.hypot(this.vel.x, this.vel.z) > 0.5 && this._movedSq < 0.0003) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        this.stuckT = 0;
        this.path = [];
        this.vel.y = 6; // подпрыгнуть, вдруг ящик
      }
    } else this.stuckT = 0;
    return false;
  }

  _canSeePlayer() {
    const pl = this.mgr.player;
    if (!pl.alive) return false;
    const eye = this.eyePos(new THREE.Vector3());
    const plEye = pl.eyePos(new THREE.Vector3());
    const to = plEye.clone().sub(eye);
    const dist = to.length();
    let view = this.mgr.diff.view;
    if (pl.crouching || pl.walking) view *= 0.8;
    if (dist > view) return false;
    to.divideScalar(dist);
    // поле зрения (вплотную бот "слышит" игрока)
    if (dist > 6) {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const toXZ = new THREE.Vector3(to.x, 0, to.z).normalize();
      if (fwd.dot(toXZ) < this.mgr.diff.fovCos) return false;
    }
    return raycastWorld(eye, to, dist, this.mgr.colliders) >= dist - 0.2;
  }

  _shoot() {
    const mgr = this.mgr;
    const pl = mgr.player;
    const eye = this.eyePos(new THREE.Vector3());
    const target = pl.eyePos(new THREE.Vector3());
    target.y -= rand(0, 0.5); // целятся в голову/грудь
    const dir = target.sub(eye).normalize();

    // разброс, растущий от скорости игрока и дистанции
    const plSpeedK = 1 + clamp(pl.horizSpeed / 6, 0, 1) * 0.8;
    const spread = mgr.diff.spread * plSpeedK;
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir);
    dir.addScaledVector(right, gauss() * spread).addScaledVector(up, gauss() * spread).normalize();

    const tWall = raycastWorld(eye, dir, 200, mgr.colliders);
    const box = pl.getAABB();
    const tp = rayAABB(eye, dir, box.min, box.max);
    const hit = tp >= 0 && tp < tWall;
    const tEnd = hit ? tp : tWall;
    const hitPoint = eye.clone().addScaledVector(dir, tEnd);

    this.mesh.updateMatrixWorld();
    const muzzle = new THREE.Vector3(0.22, 1.3, -0.6).applyMatrix4(this.mesh.matrixWorld);
    mgr.effects.tracer(muzzle, hitPoint, 0xffb37a);
    const dist = eye.distanceTo(pl.pos);
    mgr.audio.shot('ak', clamp(1 - dist / 70, 0.08, 0.85));

    if (hit) {
      const isHead = hitPoint.y > pl.pos.y + 0.5;
      let dmg = BOT_DMG * mgr.diff.dmg * clamp(1 - (tEnd - 30) / 130, 0.5, 1);
      if (isHead) dmg *= 2.5;
      mgr.onPlayerHit(this, dmg);
    } else {
      mgr.effects.impact(hitPoint);
    }
  }

  update(dt) {
    const mgr = this.mgr;
    const diff = mgr.diff;

    if (!this.alive) {
      if (this.dieAnim > 0) {
        this.dieAnim -= dt;
        this.mesh.rotation.z = (1 - Math.max(this.dieAnim, 0) / 0.5) * Math.PI / 2;
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.mesh.visible = false;
        this.spawn(mgr.spawns[randInt(0, mgr.spawns.length - 1)]);
      }
      this.mesh.position.set(this.pos.x, this.pos.y - 0.9, this.pos.z);
      return;
    }

    const prevX = this.pos.x, prevZ = this.pos.z;
    this.visible = this._canSeePlayer();
    const pl = mgr.player;

    // обнаружение
    if (this.visible && this.state !== 'combat' && this.state !== 'cover') {
      this.state = 'combat';
      this.reactT = diff.reaction * rand(0.8, 1.2);
      this.burstLeft = 0;
      this.burstPause = 0.1;
    }

    this.vel.x = 0;
    this.vel.z = 0;

    switch (this.state) {
      case 'patrol': {
        if (!this.path.length) {
          this.path = this._findPath(
            this._nearestWp(this.pos),
            randInt(0, mgr.waypoints.length - 1),
          );
        }
        this._followPath(dt, 3.2);
        break;
      }

      case 'combat': {
        if (!pl.alive) { this.state = 'patrol'; this.path = []; break; }
        if (this.visible) {
          this.lastSeen.copy(pl.pos);
          this.lostT = 0;
          // прицеливание
          const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
          this.yaw = turnToward(this.yaw, Math.atan2(-dx, -dz), diff.turn * dt);
          const dist = Math.hypot(dx, dz);

          this.reactT -= dt;
          if (this.reactT <= 0) {
            // стрельба очередями
            this.shotT -= dt;
            if (this.burstLeft <= 0) {
              this.burstPause -= dt;
              if (this.burstPause <= 0) {
                this.burstLeft = randInt(diff.burst[0], diff.burst[1]);
              }
            } else if (this.shotT <= 0) {
              // стреляем только если корпус повёрнут к игроку
              const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
              const toP = new THREE.Vector3(dx, 0, dz).normalize();
              if (fwd.dot(toP) > 0.9) {
                this._shoot();
                this.burstLeft--;
                this.shotT = diff.rate * rand(0.9, 1.15);
                if (this.burstLeft <= 0) this.burstPause = rand(0.35, 0.9);
              }
            }
          }

          // движение в бою: стрейф или сближение
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafeDir = Math.random() < 0.5 ? -1 : 1;
            this.strafeT = rand(0.7, 1.6);
          }
          if (dist > 32) {
            const k = 2.8 / dist;
            this.vel.x = dx * k; this.vel.z = dz * k;
          } else if (Math.random() < diff.strafe) {
            const px = -dz / dist, pz = dx / dist;
            this.vel.x = px * 2.4 * this.strafeDir;
            this.vel.z = pz * 2.4 * this.strafeDir;
          }
        } else {
          this.lostT += dt;
          if (this.lostT > 1.2) {
            this.state = 'hunt';
            this._pathTo(this.lastSeen);
            this.lookT = 1.6;
          }
        }
        break;
      }

      case 'hunt': {
        if (this.visible) { this.state = 'combat'; break; }
        const arrived = this._followPath(dt, 3.6);
        if (arrived) {
          this.lookT -= dt;
          this.yaw += dt * 2.2; // осматриваемся
          if (this.lookT <= 0) { this.state = 'patrol'; this.path = []; }
        }
        break;
      }

      case 'cover': {
        const arrived = this._followPath(dt, 4.2);
        if (arrived) {
          this.coverT -= dt;
          if (this.coverT <= 0) {
            this.state = this.visible ? 'combat' : 'hunt';
            if (this.state === 'hunt') { this._pathTo(this.lastSeen); this.lookT = 1.6; }
            this.reactT = 0;
          }
        } else if (this.visible && Math.random() < 0.02) {
          // иногда отстреливаются на бегу
          this._shoot();
        }
        break;
      }
    }

    // физика
    this.vel.y -= 20 * dt;
    moveAABB(this.pos, this.vel, dt, HALF, mgr.colliders);
    this._movedSq = (this.pos.x - prevX) ** 2 + (this.pos.z - prevZ) ** 2;

    this.mesh.position.set(this.pos.x, this.pos.y - 0.9, this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }
}

export class BotManager {
  constructor({ scene, colliders, waypoints, spawns, player, effects, audio, onPlayerHit }) {
    this.scene = scene;
    this.colliders = colliders;
    this.waypoints = waypoints;
    this.spawns = spawns;
    this.player = player;
    this.effects = effects;
    this.audio = audio;
    this.onPlayerHit = onPlayerHit;
    this.diff = DIFFICULTY.normal;
    this.bots = [];
  }

  setDifficulty(name) {
    this.diff = DIFFICULTY[name] || DIFFICULTY.normal;
    // пересоздаём нужное количество ботов
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    for (let i = 0; i < this.diff.count; i++) {
      const b = new Bot(this, i);
      b.spawn(this.spawns[i % this.spawns.length]);
      this.bots.push(b);
    }
  }

  reset() {
    this.bots.forEach((b, i) => {
      b.kills = 0;
      b.deaths = 0;
      b.spawn(this.spawns[i % this.spawns.length]);
    });
  }

  // громкий выстрел игрока — боты неподалёку идут проверять
  alertShot(pos) {
    for (const b of this.bots) {
      if (!b.alive || b.state === 'combat' || b.state === 'cover') continue;
      if (b.pos.distanceTo(pos) < this.diff.hearDist) {
        b.lastSeen.copy(pos);
        b.state = 'hunt';
        b._pathTo(pos);
        b.lookT = 2.2;
      }
    }
  }

  onPlayerDeath() {
    for (const b of this.bots) {
      if (b.state === 'combat' || b.state === 'hunt') {
        b.state = 'patrol';
        b.path = [];
      }
    }
  }

  update(dt) {
    for (const b of this.bots) b.update(dt);
  }
}
