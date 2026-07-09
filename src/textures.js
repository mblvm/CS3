import * as THREE from 'three';

function make(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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
  const floor = make(256, (g, s) => {
    g.fillStyle = '#c7ae7f';
    g.fillRect(0, 0, s, s);
    noise(g, s, 900, '#8f7a52');
    noise(g, s, 500, '#e2cf9f');
    // трещины
    g.strokeStyle = 'rgba(110,92,60,0.35)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });

  const wall = make(256, (g, s) => {
    g.fillStyle = '#bda57c';
    g.fillRect(0, 0, s, s);
    noise(g, s, 1200, '#93825f');
    noise(g, s, 400, '#d9c69a');
    // горизонтальная полоса как на dust2
    g.fillStyle = 'rgba(122,96,58,0.5)';
    g.fillRect(0, s * 0.72, s, s * 0.1);
    g.strokeStyle = 'rgba(100,84,52,0.25)';
    for (let y = 0; y < s; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    }
  });

  const crate = make(256, (g, s) => {
    g.fillStyle = '#9c7a44';
    g.fillRect(0, 0, s, s);
    noise(g, s, 900, '#6d5228');
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
  });

  const metal = make(128, (g, s) => {
    g.fillStyle = '#7d8288';
    g.fillRect(0, 0, s, s);
    noise(g, s, 500, '#5a5f65');
    noise(g, s, 200, '#a8adb3');
    g.fillStyle = '#4c5156';
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.arc(16 + i * 32, 16 + j * 32, 3, 0, Math.PI * 2);
        g.fill();
      }
  });

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
    floor, wall, crate, metal,
    letterA: letter('A', '#ff9d3c'),
    letterB: letter('B', '#ffd23c'),
  };
}
