import * as THREE from 'three';

function make(size, draw, sizeY = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = sizeY;
  const g = c.getContext('2d');
  draw(g, size, sizeY);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noise(g, size, n, color, alphaMax = 0.14) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color;
    g.globalAlpha = Math.random() * alphaMax;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  g.globalAlpha = 1;
}

export function makeTextures() {
  const floor = make(512, (g, s) => {
    g.fillStyle = '#c7ae7f';
    g.fillRect(0, 0, s, s);
    noise(g, s, 2600, '#8f7a52');
    noise(g, s, 1400, '#e2cf9f');
    // каменные плиты со швами
    g.strokeStyle = 'rgba(105,88,58,0.4)';
    g.lineWidth = 3;
    const tile = s / 4;
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const off = (ty % 2) * tile * 0.5;
        g.strokeRect(tx * tile + off - tile * 0.5, ty * tile, tile, tile);
        // затемнение части плит
        if (Math.random() < 0.35) {
          g.fillStyle = 'rgba(90,74,46,0.12)';
          g.fillRect(tx * tile + off - tile * 0.5, ty * tile, tile, tile);
        }
      }
    }
    // трещины
    g.strokeStyle = 'rgba(110,92,60,0.4)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // пятна потёртости
    for (let i = 0; i < 12; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(150,125,84,0.15)' : 'rgba(220,200,150,0.12)';
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * s, 20 + Math.random() * 60, 15 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });

  const wall = make(512, (g, s) => {
    g.fillStyle = '#bda57c';
    g.fillRect(0, 0, s, s);
    noise(g, s, 3200, '#93825f');
    noise(g, s, 1200, '#d9c69a');
    // кладка из блоков песчаника
    const bh = s / 8;
    g.lineWidth = 3;
    for (let row = 0; row < 8; row++) {
      const y = row * bh;
      g.strokeStyle = 'rgba(96,80,50,0.45)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      const off = (row % 2) * bh;
      for (let x = -bh; x < s + bh; x += bh * 2) {
        g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + off, y + bh); g.stroke();
        // блоки чуть разного тона
        g.fillStyle = `rgba(${140 + Math.random() * 40 | 0},${115 + Math.random() * 30 | 0},${70 + Math.random() * 25 | 0},0.18)`;
        g.fillRect(x + off, y, bh * 2, bh);
      }
    }
    // горизонтальная полоса как на dust2
    g.fillStyle = 'rgba(122,96,58,0.5)';
    g.fillRect(0, s * 0.72, s, s * 0.1);
    // подтёки сверху
    g.fillStyle = 'rgba(90,74,46,0.15)';
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s;
      g.fillRect(x, 0, 2 + Math.random() * 5, 20 + Math.random() * 90);
    }
  });

  const crate = make(256, (g, s) => {
    g.fillStyle = '#9c7a44';
    g.fillRect(0, 0, s, s);
    noise(g, s, 900, '#6d5228');
    // волокна дерева
    g.strokeStyle = 'rgba(120,90,45,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * s;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 8, s * 0.6, y + (Math.random() - 0.5) * 8, s, y);
      g.stroke();
    }
    // доски
    g.strokeStyle = 'rgba(70,50,22,0.7)';
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo(0, (s / 4) * i); g.lineTo(s, (s / 4) * i); g.stroke();
    }
    // рамка
    g.strokeStyle = '#5d431f';
    g.lineWidth = 14;
    g.strokeRect(7, 7, s - 14, s - 14);
    // диагональ
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(14, 14); g.lineTo(s - 14, s - 14); g.stroke();
    // металлические уголки
    g.fillStyle = '#4c4a44';
    for (const [x, y] of [[0, 0], [s - 26, 0], [0, s - 26], [s - 26, s - 26]]) {
      g.fillRect(x, y, 26, 26);
    }
    g.fillStyle = '#7a7870';
    for (const [x, y] of [[13, 13], [s - 13, 13], [13, s - 13], [s - 13, s - 13]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  });

  const metal = make(128, (g, s) => {
    g.fillStyle = '#7d8288';
    g.fillRect(0, 0, s, s);
    // «щётка» горизонтальными штрихами
    for (let i = 0; i < 200; i++) {
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(90,95,101,0.4)' : 'rgba(168,173,179,0.35)';
      g.lineWidth = 1;
      const y = Math.random() * s;
      g.beginPath(); g.moveTo(Math.random() * s * 0.5, y); g.lineTo(s * 0.5 + Math.random() * s * 0.5, y); g.stroke();
    }
    g.fillStyle = '#4c5156';
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.arc(16 + i * 32, 16 + j * 32, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3c4146';
      }
  });

  // небо: градиент от зенита к горизонту + солнце с ореолом и облака
  const sky = make(1024, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4d84c4');
    grad.addColorStop(0.42, '#8fb8dd');
    grad.addColorStop(0.62, '#c9d3d2');
    grad.addColorStop(0.78, '#e3d4ae');
    grad.addColorStop(1, '#d9c49a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // солнце (соответствует направлению света в map.js)
    const sx = w * 0.31, sy = h * 0.34;
    const halo = g.createRadialGradient(sx, sy, 4, sx, sy, 170);
    halo.addColorStop(0, 'rgba(255,248,225,1)');
    halo.addColorStop(0.12, 'rgba(255,240,200,0.9)');
    halo.addColorStop(0.4, 'rgba(255,230,170,0.25)');
    halo.addColorStop(1, 'rgba(255,225,160,0)');
    g.fillStyle = halo;
    g.fillRect(sx - 200, sy - 200, 400, 400);
    // мягкие облака
    for (let i = 0; i < 26; i++) {
      const cx = Math.random() * w;
      const cy = h * (0.28 + Math.random() * 0.35);
      const rw = 40 + Math.random() * 120, rh = 8 + Math.random() * 16;
      const cl = g.createRadialGradient(cx, cy, 1, cx, cy, rw);
      cl.addColorStop(0, 'rgba(255,255,255,0.5)');
      cl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cl;
      g.save();
      g.translate(cx, cy);
      g.scale(1, rh / rw);
      g.beginPath(); g.arc(0, 0, rw, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }, 512);
  sky.wrapS = THREE.RepeatWrapping;
  sky.wrapT = THREE.ClampToEdgeWrapping;

  const letter = (ch, color) => make(256, (g, s) => {
    g.fillStyle = 'rgba(40,34,24,1)';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = color;
    g.lineWidth = 10;
    g.strokeRect(12, 12, s - 24, s - 24);
    g.fillStyle = color;
    g.font = 'bold 170px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, s / 2, s / 2 + 8);
  });

  return {
    floor, wall, crate, metal, sky,
    letterA: letter('A', '#ff9d3c'),
    letterB: letter('B', '#ffd23c'),
  };
}
