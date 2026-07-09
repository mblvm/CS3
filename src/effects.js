import * as THREE from 'three';

// Трассеры, вспышки, частицы попаданий.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flash = new THREE.PointLight(0xffc873, 0, 20, 2);
    scene.add(this.flash);
    this._impactGeo = new THREE.SphereGeometry(0.06, 6, 6);
  }

  tracer(a, b, color = 0xffe6a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.07, max: 0.07, kind: 'tracer' });
  }

  impact(p, color = 0xd8c294) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(this._impactGeo, mat);
    m.position.copy(p);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.22, max: 0.22, kind: 'puff' });
  }

  blood(p) {
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xb01818, transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(this._impactGeo, mat);
      m.position.copy(p).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.25,
      ));
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.3, max: 0.3, kind: 'puff' });
    }
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 6;
  }

  // взрыв бомбы: вспышка, огненный шар и разлетающиеся частицы
  explosion(p) {
    this.flash.position.set(p.x, p.y + 1.5, p.z);
    this.flash.intensity = 60;
    const ball = new THREE.Mesh(
      this._impactGeo,
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.95 }),
    );
    ball.position.set(p.x, p.y + 0.6, p.z);
    this.scene.add(ball);
    this.items.push({ obj: ball, life: 0.6, max: 0.6, kind: 'puff', grow: 90 });
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? 0xff8020 : 0x555046,
        transparent: true, opacity: 0.95,
      });
      const m = new THREE.Mesh(this._impactGeo, mat);
      m.position.set(p.x, p.y + 0.4, p.z);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        Math.random() * 14 + 3,
        (Math.random() - 0.5) * 22,
      );
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.9, max: 0.9, kind: 'debris', vel });
    }
  }

  update(dt) {
    this.flash.intensity *= Math.pow(0.00001, dt);
    if (this.flash.intensity < 0.05) this.flash.intensity = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(it.life / it.max, 0);
      if (it.obj.material) it.obj.material.opacity = k;
      if (it.kind === 'puff') {
        const s = 1 + (1 - k) * (it.grow || 3);
        it.obj.scale.setScalar(s);
      } else if (it.kind === 'debris') {
        it.vel.y -= 25 * dt;
        it.obj.position.addScaledVector(it.vel, dt);
        if (it.obj.position.y < 0.05) { it.obj.position.y = 0.05; it.vel.y = 0; }
      }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.geometry?.dispose?.();
        it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}
