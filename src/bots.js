import * as THREE from 'three';
import {
  moveAABB, raycastWorld, rayAABB, rand, randInt, clamp, gauss, turnToward, losClear,
} from './utils.js';

// Имена ботов по сторонам
const NAMES = {
  T: ['Phoenix', 'Balkan', 'Anarchist', 'Pirate', 'Professional', 'Elite'],
  CT: ['GIGN', 'SAS', 'FBI', 'SWAT', 'GSG-9', 'IDF'],
};

// Уровни сложности: teamSize — размер каждой команды (у игрока на 1 бота меньше)
export const DIFFICULTY = {
  easy:   { teamSize: 4, reaction: 0.85, spread: 0.05,  dmg: 0.65, view: 32, fovCos: Math.cos(1.25), turn: 2.5, burst: [2, 3], rate: 0.17, hearDist: 28, strafe: 0.4 },
  normal: { teamSize: 5, reaction: 0.5,  spread: 0.03,  dmg: 1.0,  view: 46, fovCos: Math.cos(1.45), turn: 4.0, burst: [3, 5], rate: 0.13, hearDist: 40, strafe: 0.7 },
  hard:   { teamSize: 5, reaction: 0.27, spread: 0.017, dmg: 1.3,  view: 62, fovCos: Math.cos(1.6),  turn: 7.0, burst: [4, 7], rate: 0.11, hearDist: 55, strafe: 1.0 },
};

const BOT_DMG = 28; // базовый урон пули бота
const HALF = new THREE.Vector3(0.4, 0.9, 0.4);

// Цвета формы по сторонам
const TEAM_COLORS = {
  T: { shirts: [0xc2a36a, 0xa88f56, 0xb59a63], band: 0xa02020 },
  CT: { shirts: [0x5b6c85, 0x4e5f78, 0x66778f], band: 0x1d2b4d },
};

class Bot {
  constructor(mgr, i, team) {
    this.mgr = mgr;
    this.team = team;
    this.name = NAMES[team][i % NAMES[team].length];
    this.pos = new THREE.Vector3(); // центр AABB (y ≈ 0.9)
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hp = 100;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.state = 'objective';
    this.path = [];
    this.target = null;       // текущая цель боя (игрок или бот)
    this.spotted = null;      // последний увиденный враг (обновляется на 10 Гц)
    this.visionT = rand(0, 0.1); // рассинхронизация проверок зрения между ботами
    this.assigned = new THREE.Vector3(); // назначенная точка раунда (сайт)
    this.goal = new THREE.Vector3();     // текущая точка следования
    this.waitT = 0;
    this.holdT = 0;
    this.holdYaw = 0;
    this.plantT = 0;
    this.defuseT = 0;
    this.reactT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.shotT = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.lostT = 0;
    this.lastSeen = new THREE.Vector3();
    this.lookT = 0;
    this.coverT = 0;
    this.stuckT = 0;
    this.dieAnim = 0;
    this._movedSq = 1;
    this._buildMesh(i);
  }

  _buildMesh(i) {
    const col = TEAM_COLORS[this.team];
    const shirt = new THREE.MeshLambertMaterial({ color: col.shirts[i % col.shirts.length] });
    const pants = new THREE.MeshLambertMaterial({ color: 0x4a4438 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xcf9f7a });
    const gunM = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
    const vestM = new THREE.MeshLambertMaterial({ color: this.team === 'CT' ? 0x2a3446 : 0x3a3428 });
    const bandM = new THREE.MeshLambertMaterial({ color: col.band });

    this.mesh = new THREE.Group();
    const parts = [];
    const add = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parts.push(m);
      return m;
    };
    // ноги раздельно
    add(new THREE.BoxGeometry(0.15, 0.8, 0.24), pants, 0.1, 0.4, 0);
    add(new THREE.BoxGeometry(0.15, 0.8, 0.24), pants, -0.1, 0.4, 0);
    // торс + бронежилет
    add(new THREE.BoxGeometry(0.56, 0.64, 0.3), shirt, 0, 1.12, 0);
    add(new THREE.BoxGeometry(0.5, 0.4, 0.36), vestM, 0, 1.18, 0);
    // руки тянутся к оружию
    add(new THREE.BoxGeometry(0.11, 0.11, 0.46), shirt, 0.29, 1.28, -0.1, 0.3);
    add(new THREE.BoxGeometry(0.11, 0.11, 0.4), shirt, -0.26, 1.26, -0.14, 0.45);
    add(new THREE.SphereGeometry(0.065, 6, 5), skin, 0.27, 1.2, -0.3);
    add(new THREE.SphereGeometry(0.065, 6, 5), skin, -0.22, 1.16, -0.3);
    // голова: у CT — каска, у T — повязка
    add(new THREE.SphereGeometry(0.19, 10, 8), skin, 0, 1.62, 0);
    if (this.team === 'CT') {
      add(new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), bandM, 0, 1.63, 0);
    } else {
      add(new THREE.BoxGeometry(0.34, 0.08, 0.34), bandM, 0, 1.7, 0);
    }
    // оружие: корпус, ствол, магазин
    add(new THREE.BoxGeometry(0.07, 0.09, 0.42), gunM, 0.22, 1.3, -0.14);
    const barrel = add(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), gunM, 0.22, 1.32, -0.5);
    barrel.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.05, 0.13, 0.06), gunM, 0.22, 1.21, -0.1, 0.35);
    for (const m of parts) {
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

  getAABB() {
    return {
      min: new THREE.Vector3(this.pos.x - 0.35, this.pos.y - 0.9, this.pos.z - 0.35),
      max: new THREE.Vector3(this.pos.x + 0.35, this.pos.y + 0.9, this.pos.z + 0.35),
    };
  }

  spawn(p, yaw = 0) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.hp = 100;
    this.alive = true;
    this.state = 'objective';
    this.path = [];
    this.target = null;
    this.spotted = null;
    this.waitT = 0;
    this.plantT = 0;
    this.defuseT = 0;
    this.dieAnim = 0;
    this.yaw = yaw;
    this.mesh.visible = true;
    this.mesh.rotation.z = 0;
    this._drawHp();
  }

  takeDamage(dmg, isHead, attacker) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this._drawHp();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      this.state = 'dead';
      this.dieAnim = 0.5;
      this.mgr.game?.onEntityDeath(this); // выпадение бомбы и т.п.
      return true;
    }
    // реагируем на урон: разворачиваемся к обидчику
    if (attacker && attacker.alive) {
      this.lastSeen.copy(attacker.pos);
      if (this.state !== 'combat' && this.state !== 'cover') {
        this.state = 'combat';
        this.target = attacker;
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
    // ближайшая точка, не видимая с последней позиции угрозы
    const threat = new THREE.Vector3(this.lastSeen.x, 1.6, this.lastSeen.z);
    const wps = this.mgr.waypoints;
    let best = -1, bd = Infinity;
    wps.forEach((w, i) => {
      const d = (w.p.x - this.pos.x) ** 2 + (w.p.z - this.pos.z) ** 2;
      if (d > 30 * 30 || d < 4) return;
      const wpEye = new THREE.Vector3(w.p.x, 1.6, w.p.z);
      if (losClear(threat, wpEye, this.mgr.colliders)) return;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      this.path = this._findPath(this._nearestWp(this.pos), best);
      this.state = 'cover';
      this.coverT = rand(1.4, 2.4);
    }
  }

  // шаг напрямую к точке (x, z); используется на финальном отрезке после пути
  _walkToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    const desiredYaw = Math.atan2(-dx, -dz);
    this.yaw = turnToward(this.yaw, desiredYaw, this.mgr.diff.turn * 1.5 * dt);
    this.vel.x = (dx / dist) * speed;
    this.vel.z = (dz / dist) * speed;
    // застряли? подпрыгнуть и сбросить путь
    if (this._movedSq < 0.0003) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        this.stuckT = 0;
        this.path = [];
        this.vel.y = 6;
      }
    } else this.stuckT = 0;
  }

  _followPath(dt, speed) {
    if (!this.path.length) return true;
    const target = this.mgr.waypoints[this.path[0]].p;
    const dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    if (dist < 1.4) {
      this.path.shift();
      return this.path.length === 0;
    }
    this._walkToward(target.x, target.z, dt, speed);
    return false;
  }

  // движение к this.goal: сперва по графу, затем напрямую. true — пришли.
  _gotoGoal(dt, speed) {
    const dist = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
    if (dist < 1.4) return true;
    if (this.path.length) {
      this._followPath(dt, speed);
      return false;
    }
    if (dist > 10) {
      this._pathTo(this.goal);
    } else {
      this._walkToward(this.goal.x, this.goal.z, dt, speed);
    }
    return false;
  }

  // --- зрение ---
  _canSee(t) {
    if (!t || !t.alive) return false;
    const eye = this.eyePos(_v1);
    const tEye = t.eyePos(_v2);
    const to = _v3.copy(tEye).sub(eye);
    const dist = to.length();
    let view = this.mgr.diff.view;
    if (t.crouching || t.walking) view *= 0.8; // тихого игрока видно хуже
    if (dist > view) return false;
    to.divideScalar(dist);
    // поле зрения (вплотную бот «слышит» цель)
    if (dist > 6) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const len = Math.hypot(to.x, to.z) || 1;
      if ((fx * to.x + fz * to.z) / len < this.mgr.diff.fovCos) return false;
    }
    return raycastWorld(eye, to, dist, this.mgr.colliders) >= dist - 0.2;
  }

  // ближайший видимый враг (вызывается на ~10 Гц)
  _acquire() {
    let best = null, bd = Infinity;
    for (const e of this.mgr.enemiesOf(this.team)) {
      if (!e.alive) continue;
      const d = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2;
      if (d >= bd) continue;
      if (this._canSee(e)) { best = e; bd = d; }
    }
    return best;
  }

  // --- стрельба по цели (игроку или боту) ---
  _shoot(t) {
    const mgr = this.mgr;
    const eye = this.eyePos(new THREE.Vector3());
    const target = t.eyePos(new THREE.Vector3());
    target.y -= rand(0, 0.5); // целятся в голову/грудь
    const dir = target.sub(eye).normalize();

    // разброс растёт от скорости цели
    const tSpeed = t.horizSpeed ?? Math.hypot(t.vel?.x || 0, t.vel?.z || 0);
    const spread = mgr.diff.spread * (1 + clamp(tSpeed / 6, 0, 1) * 0.8);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir);
    dir.addScaledVector(right, gauss() * spread).addScaledVector(up, gauss() * spread).normalize();

    const tWall = raycastWorld(eye, dir, 200, mgr.colliders);
    const box = t.getAABB();
    const tp = rayAABB(eye, dir, box.min, box.max);
    const hit = tp >= 0 && tp < tWall;
    const tEnd = hit ? tp : tWall;
    const hitPoint = eye.clone().addScaledVector(dir, tEnd);

    this.mesh.updateMatrixWorld();
    const muzzle = new THREE.Vector3(0.22, 1.3, -0.6).applyMatrix4(this.mesh.matrixWorld);
    mgr.effects.tracer(muzzle, hitPoint, 0xffb37a);
    // громкость по расстоянию до игрока (слушателя)
    const hearDist = eye.distanceTo(mgr.player.pos);
    mgr.audio.shot('ak', clamp(1 - hearDist / 70, 0.05, 0.85));

    if (hit) {
      const isHead = hitPoint.y > t.pos.y + 0.5;
      const falloff = clamp(1 - (tEnd - 30) / 130, 0.5, 1);
      if (t === mgr.player) {
        let dmg = BOT_DMG * mgr.diff.dmg * falloff;
        if (isHead) dmg *= 2.5;
        mgr.game?.hurtPlayer(dmg, this);
      } else {
        let dmg = BOT_DMG * falloff;
        if (isHead) dmg *= 2.5;
        const died = t.takeDamage(dmg, isHead, this);
        if (died) {
          this.kills++;
          mgr.game?.onBotKilled(this, t, isHead);
        }
      }
    } else {
      mgr.effects.impact(hitPoint);
    }
  }

  // желаемая цель раунда с учётом фазы игры
  _desiredGoal(out) {
    const g = this.mgr.game;
    out.copy(this.assigned);
    if (!g) return out;
    if (g.phase === 'planted' && g.bombPos) {
      out.copy(g.bombPos); // обе команды стягиваются к бомбе
      out.y = 0.9;
    } else if (this.team === 'T' && g.bombState === 'dropped'
               && this.mgr.nearestAliveBotT(g.bombPos) === this) {
      out.copy(g.bombPos); // ближайший T подбирает брошенную бомбу
      out.y = 0.9;
    }
    return out;
  }

  // синхронизация текущей цели с желаемой; при смене — заново в путь
  _refreshGoal() {
    const desired = this._desiredGoal(_v1);
    if (Math.hypot(desired.x - this.goal.x, desired.z - this.goal.z) > 3) {
      this.goal.copy(desired);
      this.path = [];
      if (this.state === 'hold') this.state = 'objective';
    }
  }

  update(dt, frozen) {
    const mgr = this.mgr;
    const diff = mgr.diff;
    const g = mgr.game;

    if (!this.alive) {
      // анимация падения; тело остаётся лежать до конца раунда
      if (this.dieAnim > 0) {
        this.dieAnim -= dt;
        this.mesh.rotation.z = (1 - Math.max(this.dieAnim, 0) / 0.5) * Math.PI / 2;
      }
      this.mesh.position.set(this.pos.x, this.pos.y - 0.9, this.pos.z);
      return;
    }

    if (frozen) {
      this.mesh.position.set(this.pos.x, this.pos.y - 0.9, this.pos.z);
      this.mesh.rotation.y = this.yaw;
      return;
    }

    const prevX = this.pos.x, prevZ = this.pos.z;

    // зрение — на 10 Гц со сдвигом фазы между ботами
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = 0.1;
      this.spotted = this._acquire();
    }

    // обнаружение врага: установка бомбы продолжается под огнём,
    // разминирование прерывается при виде противника
    if (this.spotted && this.state !== 'combat' && this.state !== 'cover' && this.state !== 'plant') {
      this.state = 'combat';
      this.target = this.spotted;
      this.reactT = diff.reaction * rand(0.8, 1.2);
      this.burstLeft = 0;
      this.burstPause = 0.1;
    }

    this.vel.x = 0;
    this.vel.z = 0;

    switch (this.state) {
      case 'objective': {
        if (this.waitT > 0) { this.waitT -= dt; break; }
        this._refreshGoal();
        const arrived = this._gotoGoal(dt, 3.6);
        if (arrived) {
          if (g && this.team === 'T' && g.carrier === this && g.phase === 'live' && g.inSite(this.pos)) {
            // носитель бомбы на точке — начинаем установку
            this.state = 'plant';
            this.plantT = g.rules.plantTime;
          } else if (g && this.team === 'CT' && g.phase === 'planted'
                     && this.pos.distanceTo(g.bombPos) < 1.7) {
            this.state = 'defuse';
            this.defuseT = g.rules.defuseTime;
          } else if (g && this.team === 'T' && g.bombState === 'dropped'
                     && this.pos.distanceTo(g.bombPos) < 3) {
            // стоим у брошенной бомбы — подбор сработает по близости
            this.state = 'hold';
            this.holdT = rand(0.5, 1);
          } else {
            this.state = 'hold';
            this.holdT = rand(2.5, 6);
            this.holdYaw = this.yaw;
          }
        }
        break;
      }

      case 'hold': {
        // носитель уже стоит на точке — сразу ставим бомбу
        if (g && this.team === 'T' && g.carrier === this && g.phase === 'live' && g.inSite(this.pos)) {
          this.state = 'plant';
          this.plantT = g.rules.plantTime;
          break;
        }
        // CT стоит вплотную к установленной бомбе — разминируем
        if (g && this.team === 'CT' && g.phase === 'planted') {
          if (this.pos.distanceTo(g.bombPos) < 1.7) {
            this.state = 'defuse';
            this.defuseT = g.rules.defuseTime;
            break;
          }
          // иначе идём к бомбе
          this.goal.copy(g.bombPos);
          this.goal.y = 0.9;
          this.path = [];
          this.state = 'objective';
          break;
        }
        this._refreshGoal();
        if (this.state !== 'hold') break; // цель сменилась
        // осматриваемся по сторонам
        this.lookT -= dt;
        if (this.lookT <= 0) {
          this.lookT = rand(1.2, 2.6);
          this.holdYaw = this.yaw + rand(-1.6, 1.6);
        }
        this.yaw = turnToward(this.yaw, this.holdYaw, 1.8 * dt);
        // время от времени меняем позицию рядом с целью
        this.holdT -= dt;
        if (this.holdT <= 0) {
          this.goal.set(
            this.assigned.x + rand(-2.5, 2.5), 0.9,
            this.assigned.z + rand(-2.5, 2.5),
          );
          this._desiredGoal(_v1);
          // если есть особая цель (бомба) — идём к ней, иначе гуляем у сайта
          if (Math.hypot(_v1.x - this.assigned.x, _v1.z - this.assigned.z) > 3) this.goal.copy(_v1);
          this.path = [];
          this.state = 'objective';
        }
        break;
      }

      case 'plant': {
        // установка бомбы: стоим на месте (урон прерывает через takeDamage)
        if (!g || g.phase !== 'live' || g.carrier !== this) { this.state = 'objective'; break; }
        this.plantT -= dt;
        if (this.plantT <= 0) {
          g.plantBomb(this);
          this.state = 'hold';
          this.holdT = rand(2, 4);
        }
        break;
      }

      case 'defuse': {
        if (!g || g.phase !== 'planted') { this.state = 'objective'; break; }
        if (this.spotted) { // под прицелом не разминируем
          this.state = 'combat';
          this.target = this.spotted;
          break;
        }
        this.defuseT -= dt;
        if (this.defuseT <= 0) g.bombDefused(this);
        break;
      }

      case 'combat': {
        let t = this.target;
        if (!t || !t.alive) {
          this.target = this.spotted;
          if (!this.target) {
            this.state = 'hunt';
            this._pathTo(this.lastSeen);
            this.lookT = 1.6;
          }
          break;
        }
        if (this._canSee(t)) {
          this.lastSeen.copy(t.pos);
          this.lostT = 0;
          // прицеливание
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
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
              // стреляем только если корпус повёрнут к цели
              const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
              if ((fx * dx + fz * dz) / dist > 0.9) {
                this._shoot(t);
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
        if (this.spotted) { this.state = 'combat'; this.target = this.spotted; break; }
        const arrived = this._followPath(dt, 3.6);
        if (arrived) {
          this.lookT -= dt;
          this.yaw += dt * 2.2; // осматриваемся
          if (this.lookT <= 0) { this.state = 'objective'; this.path = []; }
        }
        break;
      }

      case 'cover': {
        const arrived = this._followPath(dt, 4.2);
        if (arrived) {
          this.coverT -= dt;
          if (this.coverT <= 0) {
            if (this.spotted) {
              this.state = 'combat';
              this.target = this.spotted;
            } else {
              this.state = 'hunt';
              this._pathTo(this.lastSeen);
              this.lookT = 1.6;
            }
            this.reactT = 0;
          }
        } else if (this.spotted && Math.random() < 0.02) {
          // иногда отстреливаются на бегу
          this._shoot(this.spotted);
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

// временные векторы, чтобы не создавать мусор в горячих путях
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class BotManager {
  constructor({ scene, colliders, waypoints, spawns, sites, player, effects, audio }) {
    this.scene = scene;
    this.colliders = colliders;
    this.waypoints = waypoints;
    this.spawns = spawns;
    this.sites = sites;
    this.player = player;
    this.effects = effects;
    this.audio = audio;
    this.game = null; // выставляется из GameState
    this.diff = DIFFICULTY.normal;
    this.bots = [];
  }

  setGame(game) { this.game = game; }

  setDifficulty(name) {
    this.diff = DIFFICULTY[name] || DIFFICULTY.normal;
  }

  // создать команды: у стороны игрока на одного бота меньше
  buildTeams(playerSide) {
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    const enemySide = playerSide === 'T' ? 'CT' : 'T';
    for (let i = 0; i < this.diff.teamSize - 1; i++) this.bots.push(new Bot(this, i, playerSide));
    for (let i = 0; i < this.diff.teamSize; i++) this.bots.push(new Bot(this, i, enemySide));
  }

  // сущности команды (включая игрока)
  entitiesOf(team) {
    const arr = this.bots.filter((b) => b.team === team);
    if (this.player.team === team) arr.push(this.player);
    return arr;
  }

  enemiesOf(team) { return this.entitiesOf(team === 'T' ? 'CT' : 'T'); }

  // враги игрока (только боты) — для hitscan оружия
  enemiesOfPlayer() {
    return this.bots.filter((b) => b.team !== this.player.team);
  }

  aliveOf(team) {
    let n = 0;
    for (const e of this.entitiesOf(team)) if (e.alive) n++;
    return n;
  }

  nearestAliveBotT(pos) {
    let best = null, bd = Infinity;
    for (const b of this.bots) {
      if (b.team !== 'T' || !b.alive) continue;
      const d = (b.pos.x - pos.x) ** 2 + (b.pos.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // расстановка на раунд: T идут на выбранный сайт, CT делятся между A и B
  roundStart() {
    const g = this.game;
    const siteC = (s) => new THREE.Vector3(this.sites[s].cx, 0.9, this.sites[s].cz);
    let tIdx = 0, ctIdx = 0, ctFlip = 0;
    for (const b of this.bots) {
      if (b.team === 'T') {
        const sp = this.spawns.T.bots[tIdx++ % this.spawns.T.bots.length];
        b.spawn(sp, 0);
        b.assigned.copy(siteC(g.targetSite));
        b.waitT = rand(0.5, 5); // выходят со спавна не разом
      } else {
        const sp = this.spawns.CT.bots[ctIdx++ % this.spawns.CT.bots.length];
        b.spawn(sp, Math.PI);
        b.assigned.copy(siteC(ctFlip++ % 2 ? 'A' : 'B')); // защита делится между сайтами
        b.waitT = rand(0, 1.2);
      }
      b.assigned.x += rand(-3, 3);
      b.assigned.z += rand(-3, 3);
      b.goal.copy(b.assigned);
    }
    // носитель бомбы выдвигается одним из первых
    if (g.carrier && g.carrier !== this.player) g.carrier.waitT = rand(0.3, 1);
  }

  // сброс статистики (новый матч / смена сторон)
  resetStats() {
    for (const b of this.bots) { b.kills = 0; b.deaths = 0; }
  }

  // громкий выстрел — боты другой команды неподалёку идут проверять
  alertShot(pos, shooterTeam) {
    for (const b of this.bots) {
      if (!b.alive || b.team === shooterTeam) continue;
      if (b.state === 'combat' || b.state === 'cover' || b.state === 'plant' || b.state === 'defuse') continue;
      if (b.pos.distanceTo(pos) < this.diff.hearDist) {
        b.lastSeen.copy(pos);
        b.state = 'hunt';
        b._pathTo(pos);
        b.lookT = 2.2;
      }
    }
  }

  update(dt) {
    const g = this.game;
    // вне активной фазы боты замирают (подготовка, конец раунда)
    const frozen = !g || (g.phase !== 'live' && g.phase !== 'planted');
    for (const b of this.bots) b.update(dt, frozen);
  }
}
