import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
// приближение нормального распределения для разброса
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
export const damp = (cur, target, lambda, dt) => THREE.MathUtils.damp(cur, target, lambda, dt);

export function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function turnToward(cur, target, maxStep) {
  const d = angleWrap(target - cur);
  return cur + clamp(d, -maxStep, maxStep);
}

function overlaps(pos, half, c) {
  return pos.x + half.x > c.min.x && pos.x - half.x < c.max.x &&
         pos.y + half.y > c.min.y && pos.y - half.y < c.max.y &&
         pos.z + half.z > c.min.z && pos.z - half.z < c.max.z;
}

// Перемещение AABB (центр pos, полуразмеры half) с разрешением коллизий по осям.
// Возвращает true, если стоим на земле.
export function moveAABB(pos, vel, dt, half, colliders) {
  let onGround = false;

  // --- Y ---
  const prevBottom = pos.y - half.y;
  const prevTop = pos.y + half.y;
  pos.y += vel.y * dt;
  for (const c of colliders) {
    if (!overlaps(pos, half, c)) continue;
    if (vel.y <= 0 && prevBottom >= c.max.y - 0.02) {
      pos.y = c.max.y + half.y - 0.001;
      vel.y = 0;
      onGround = true;
    } else if (vel.y > 0 && prevTop <= c.min.y + 0.02) {
      pos.y = c.min.y - half.y - 0.001;
      vel.y = 0;
    }
  }
  if (pos.y - half.y <= 0) {
    pos.y = half.y;
    if (vel.y < 0) vel.y = 0;
    onGround = true;
  }

  // --- X ---
  pos.x += vel.x * dt;
  for (const c of colliders) {
    if (pos.y - half.y >= c.max.y - 0.01) continue; // стоим сверху
    if (!overlaps(pos, half, c)) continue;
    if (vel.x > 0) pos.x = c.min.x - half.x - 0.001;
    else if (vel.x < 0) pos.x = c.max.x + half.x + 0.001;
    vel.x = 0;
  }

  // --- Z ---
  pos.z += vel.z * dt;
  for (const c of colliders) {
    if (pos.y - half.y >= c.max.y - 0.01) continue;
    if (!overlaps(pos, half, c)) continue;
    if (vel.z > 0) pos.z = c.min.z - half.z - 0.001;
    else if (vel.z < 0) pos.z = c.max.z + half.z + 0.001;
    vel.z = 0;
  }

  return onGround;
}

// Луч против AABB (slab-метод). Возвращает t >= 0 или -1.
export function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / d[ax];
    let t1 = (min[ax] - o[ax]) * inv;
    let t2 = (max[ax] - o[ax]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export function raySphere(o, d, center, r) {
  const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

// Дистанция до ближайшего препятствия мира (стены, ящики, пол) вдоль луча.
// Перед точным тестом AABB коллайдер отбраковывается по описанной сфере —
// это отсекает большинство ящиков без дорогих делений в rayAABB.
export function raycastWorld(o, d, maxDist, colliders) {
  let best = maxDist;
  if (d.y < 0) {
    const t = -o.y / d.y;
    if (t >= 0 && t < best) best = t;
  }
  for (const c of colliders) {
    if (c.center) {
      const cx = c.center.x - o.x, cy = c.center.y - o.y, cz = c.center.z - o.z;
      const tp = cx * d.x + cy * d.y + cz * d.z; // проекция центра на луч
      if (tp - c.radius > best || tp + c.radius < 0) continue; // дальше лучшего или сзади
      const dsq = cx * cx + cy * cy + cz * cz - tp * tp; // расстояние от оси луча
      if (dsq > c.radius * c.radius) continue;
    }
    const t = rayAABB(o, d, c.min, c.max);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

const _losDir = new THREE.Vector3();
export function losClear(a, b, colliders) {
  _losDir.copy(b).sub(a);
  const dist = _losDir.length();
  if (dist < 0.001) return true;
  _losDir.divideScalar(dist);
  return raycastWorld(a, _losDir, dist, colliders) >= dist - 0.15;
}
