import * as THREE from 'three';

// Трассеры, вспышки, частицы попаданий, гильзы.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flash = new THREE.PointLight(0xffc873, 0, 20, 2);
    scene.add(this.flash);
    this._impactGeo = new THREE.SphereGeometry(0.06, 6, 6);
    this._sparkGeo = new THREE.SphereGeometry(0.02, 4, 4);
    this._shellGeo = new THREE.BoxGeometry(0.013, 0.013, 0.035);
    this._shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.3, metalness: 0.9 });

    // спрайт дульной вспышки — рисованная «звезда» с аддитивным смешением
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(0.35, 'rgba(255,180,80,0.85)');
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,220,140,0.9)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.4;
      g.beginPath();
      g.moveTo(32 - Math.cos(a) * 30, 32 - Math.sin(a) * 30);
      g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
      g.stroke();
    }
    this._flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    }));
    this._flashSprite.scale.setScalar(0.28);
    scene.add(this._flashSprite);
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
    // искры от поверхности
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(this._sparkGeo, new THREE.MeshBasicMaterial({
        color: 0xffcf70, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      s.position.copy(p);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4, Math.random() * 3.2, (Math.random() - 0.5) * 4,
      );
      this.scene.add(s);
      this.items.push({ obj: s, life: 0.28, max: 0.28, kind: 'debris', vel });
    }
  }

  // выброс гильзы вправо-вверх от дула
  shell(pos, right) {
    const m = new THREE.Mesh(this._shellGeo, this._shellMat);
    m.position.copy(pos).addScaledVector(right, 0.06);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    const vel = right.clone().multiplyScalar(1.4 + Math.random())
      .add(new THREE.Vector3(0, 2 + Math.random() * 1.2, 0));
    const spin = new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.9, max: 0.9, kind: 'shell', vel, spin });
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
    this._flashSprite.position.copy(pos);
    this._flashSprite.material.rotation = Math.random() * Math.PI;
    this._flashSprite.material.opacity = 1;
    this._flashSprite.scale.setScalar(0.2 + Math.random() * 0.14);
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
    const fm = this._flashSprite.material;
    if (fm.opacity > 0) fm.opacity = Math.max(0, fm.opacity - dt * 22);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(it.life / it.max, 0);
      if (it.obj.material && it.kind !== 'shell') it.obj.material.opacity = k;
      if (it.kind === 'puff') {
        const s = 1 + (1 - k) * (it.grow || 3);
        it.obj.scale.setScalar(s);
      } else if (it.kind === 'debris') {
        it.vel.y -= 25 * dt;
        it.obj.position.addScaledVector(it.vel, dt);
        if (it.obj.position.y < 0.05) { it.obj.position.y = 0.05; it.vel.y = 0; }
      } else if (it.kind === 'shell') {
        it.vel.y -= 14 * dt;
        it.obj.position.addScaledVector(it.vel, dt);
        it.obj.rotation.x += it.spin.x * dt;
        it.obj.rotation.y += it.spin.y * dt;
        it.obj.rotation.z += it.spin.z * dt;
      }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        // уникальна только геометрия трассера; материал гильз общий
        if (it.kind === 'tracer') it.obj.geometry?.dispose?.();
        if (it.kind !== 'shell') it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}
