import * as THREE from 'three';
import { clamp, moveAABB } from './utils.js';

const GRAVITY = 20;
const JUMP_VEL = 7.0;
const RUN_SPEED = 6.1;
const FRICTION = 8;
const GROUND_ACCEL = 14;
const AIR_ACCEL = 90;
const AIR_WISH_CAP = 0.95; // ключ к air-strafe: маленький "желаемый" предел скорости в воздухе

const STAND_HALF = 0.9;   // рост 1.8
const CROUCH_HALF = 0.62; // рост 1.24

export class Player {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();   // центр AABB
    this.vel = new THREE.Vector3();
    this.half = new THREE.Vector3(0.4, STAND_HALF, 0.4);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.onGround = false;
    this.crouching = false;
    this.walking = false;
    this._stepT = 0;
    this._wish = new THREE.Vector3();
  }

  spawn(spawnPoint) {
    this.pos.copy(spawnPoint.pos);
    this.pos.y = STAND_HALF + 0.01;
    this.vel.set(0, 0, 0);
    this.yaw = spawnPoint.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.half.y = STAND_HALF;
    this.crouching = false;
  }

  look(dx, dy, sens) {
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.half.y - 0.18, this.pos.z);
  }

  getAABB() {
    return {
      min: new THREE.Vector3(this.pos.x - 0.4, this.pos.y - this.half.y, this.pos.z - 0.4),
      max: new THREE.Vector3(this.pos.x + 0.4, this.pos.y + this.half.y, this.pos.z + 0.4),
    };
  }

  get horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  _setCrouch(want) {
    if (want === this.crouching) return;
    const oldHalf = this.half.y;
    const newHalf = want ? CROUCH_HALF : STAND_HALF;
    if (!want) {
      // проверяем, есть ли место встать
      const testPos = this.pos.clone();
      testPos.y += this.onGround ? (newHalf - oldHalf) : (oldHalf - newHalf);
      const half = new THREE.Vector3(0.4, newHalf, 0.4);
      for (const c of this.colliders) {
        if (testPos.x + half.x > c.min.x && testPos.x - half.x < c.max.x &&
            testPos.y + half.y > c.min.y && testPos.y - half.y < c.max.y &&
            testPos.z + half.z > c.min.z && testPos.z - half.z < c.max.z) return;
      }
    }
    // на земле — приседаем "вниз", в воздухе — подтягиваем ноги
    this.pos.y += this.onGround ? (newHalf - oldHalf) : (oldHalf - newHalf);
    this.half.y = newHalf;
    this.crouching = want;
  }

  _friction(dt) {
    const speed = this.horizSpeed;
    if (speed < 0.0001) return;
    const drop = speed * FRICTION * dt;
    const k = Math.max(speed - drop, 0) / speed;
    this.vel.x *= k;
    this.vel.z *= k;
  }

  _accelerate(wish, wishSpeed, accel, dt, capWish) {
    const ws = capWish ? Math.min(wishSpeed, AIR_WISH_CAP) : wishSpeed;
    const cur = this.vel.x * wish.x + this.vel.z * wish.z;
    const add = ws - cur;
    if (add <= 0) return;
    const a = Math.min(accel * wishSpeed * dt, add);
    this.vel.x += wish.x * a;
    this.vel.z += wish.z * a;
  }

  update(dt, input, moveMult, recoil, audio) {
    if (!this.alive) return;

    this._setCrouch(input.keys.has('crouch'));
    this.walking = input.keys.has('walk');

    // направление желания движения из клавиш и yaw
    const f = (input.keys.has('fwd') ? 1 : 0) - (input.keys.has('back') ? 1 : 0);
    const s = (input.keys.has('right') ? 1 : 0) - (input.keys.has('left') ? 1 : 0);
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    this._wish.set(
      -sinY * f + cosY * s,
      0,
      -cosY * f - sinY * s,
    );
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    let speed = RUN_SPEED * moveMult;
    if (this.walking) speed *= 0.52;
    if (this.crouching) speed *= 0.47;

    if (this.onGround) {
      if (input.keys.has('jump')) {
        // распрыжка: прыжок в кадр приземления без трения
        this.vel.y = JUMP_VEL;
        this.onGround = false;
        this._accelerate(this._wish, speed, AIR_ACCEL, dt, true);
      } else {
        this._friction(dt);
        this._accelerate(this._wish, speed, GROUND_ACCEL, dt, false);
      }
    } else {
      this._accelerate(this._wish, speed, AIR_ACCEL, dt, true);
    }

    this.vel.y -= GRAVITY * dt;
    this.onGround = moveAABB(this.pos, this.vel, dt, this.half, this.colliders);

    // шаги
    if (this.onGround && this.horizSpeed > 2 && !this.walking && !this.crouching) {
      this._stepT -= dt;
      if (this._stepT <= 0) {
        audio.step(0.05 + Math.min(this.horizSpeed / 60, 0.05));
        this._stepT = 2.4 / Math.max(this.horizSpeed, 3);
      }
    }

    // камера
    this.eyePos(this.camera.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + recoil.yaw;
    this.camera.rotation.x = this.pitch + recoil.pitch;
    this.camera.rotation.z = 0;
  }

  damage(dmg) {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }
}
