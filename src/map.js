import * as THREE from 'three';
import { makeTextures } from './textures.js';

// Карта в духе de_dust2: T-спавн на юге, CT-спавн на севере,
// три "линии": лонг (восток), мид (центр), тоннели (запад),
// два сайта закладки: A (северо-восток) и B (северо-запад).
export function buildMap(scene) {
  const colliders = [];
  const T = makeTextures();

  function matFromTex(t, rx, ry) {
    const tt = t.clone();
    tt.needsUpdate = true;
    tt.repeat.set(Math.max(1, Math.round(rx)), Math.max(1, Math.round(ry)));
    return new THREE.MeshLambertMaterial({ map: tt });
  }

  function box(cx, cz, w, h, d, tex, y0 = 0, texScale = 3.5) {
    const mat = matFromTex(tex, (w + d) / 2 / texScale, h / texScale);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    // центр и радиус описанной сферы — для быстрой отбраковки в raycastWorld
    colliders.push({
      min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2),
      center: new THREE.Vector3(cx, y0 + h / 2, cz),
      radius: Math.hypot(w, h, d) / 2,
    });
    return m;
  }

  // --- Небо, свет, туман ---
  scene.background = new THREE.Color(0x9ec4e0);
  scene.fog = new THREE.Fog(0xcbbfa0, 70, 230);

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a7a55, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d4, 1.6);
  sun.position.set(45, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // --- Пол ---
  const floorMat = matFromTex(T.floor, 28, 24);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(114, 94), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Внешние стены (арена x:-56..56, z:-46..46) ---
  const WH = 7; // высота стен
  box(0, -46.75, 114, WH, 1.5, T.wall);
  box(0, 46.75, 114, WH, 1.5, T.wall);
  box(-56.75, 0, 1.5, WH, 94, T.wall);
  box(56.75, 0, 1.5, WH, 94, T.wall);

  // --- Большие блоки, формирующие коридоры (z: -15..32) ---
  // между мидом и лонгом
  box(15.5, 8.5, 15, 5.5, 47, T.wall);
  // между мидом и тоннелями
  box(-15.5, 8.5, 15, 5.5, 47, T.wall);
  // внешний блок лонга
  box(49, 8.5, 14, 5.5, 47, T.wall);
  // внешний блок тоннелей
  box(-49, 8.5, 14, 5.5, 47, T.wall);

  // --- Укрытия: ящики ---
  // T-спавн (юг)
  box(12, 40, 2, 2, 2, T.crate);
  box(-14, 41, 2, 2, 2, T.crate);
  box(-14, 41, 1.4, 1.4, 1.4, T.crate, 2);
  // лонг
  box(26.5, 20, 2, 2, 2, T.crate);
  box(38, 2, 2, 2, 2, T.crate);
  // мид
  box(5, 14, 2, 2, 2, T.crate);
  box(-4.5, 2, 2, 2, 2, T.crate);
  box(-4.5, 2, 1.4, 1.4, 1.4, T.crate, 2);
  box(4.5, -17, 2, 2, 2, T.crate);
  box(-4.5, -17, 2, 2, 2, T.crate);
  // тоннели
  box(-27, 8, 2, 2, 2, T.crate);
  box(-37, -4, 2, 2, 2, T.crate);
  // сайт A
  box(36, -26, 2.4, 2.4, 2.4, T.crate);
  box(28, -25, 2, 2, 2, T.crate);
  box(28, -25, 1.4, 1.4, 1.4, T.crate, 2);
  box(44, -22, 2, 2, 2, T.metal);
  // сайт B
  box(-36, -26, 2.4, 2.4, 2.4, T.crate);
  box(-28, -25, 2, 2, 2, T.crate);
  box(-44, -22, 2, 2, 2, T.metal);
  // центр севера (CT-мид)
  box(10, -32, 2, 2, 2, T.metal);
  box(-10, -32, 2, 2, 2, T.metal);
  // CT-спавн
  box(6, -42, 2, 2, 2, T.crate);
  box(-6, -42, 2, 2, 2, T.crate);

  // --- Маркеры точек закладки ---
  function siteMarker(tex, x, z) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
  }
  siteMarker(T.letterA, 34, -31);
  siteMarker(T.letterB, -34, -31);

  // --- Waypoint-граф для ботов ---
  const wp = (x, z, edges) => ({ p: new THREE.Vector3(x, 0.9, z), edges });
  const waypoints = [
    /* 0 T центр   */ wp(0, 38, [1, 2, 10]),
    /* 1 T восток  */ wp(18, 38, [0, 3]),
    /* 2 T запад   */ wp(-18, 38, [0, 17]),
    /* 3 вход лонг */ wp(32, 36, [1, 4]),
    /* 4 лонг-1    */ wp(32, 15, [3, 5]),
    /* 5 лонг-2    */ wp(32, -5, [4, 6]),
    /* 6 выход лонг*/ wp(32, -20, [5, 7, 15]),
    /* 7 сайт A    */ wp(33, -30, [6, 8, 9]),
    /* 8 A задник  */ wp(44, -32, [7]),
    /* 9 A левый   */ wp(22, -34, [7, 13, 15]),
    /*10 вход мид  */ wp(0, 30, [0, 11]),
    /*11 мид-1     */ wp(0, 12, [10, 12]),
    /*12 мид-2     */ wp(0, -6, [11, 13]),
    /*13 мид север */ wp(0, -22, [12, 14, 9, 23]),
    /*14 CT спавн  */ wp(0, -40, [13, 15, 16]),
    /*15 CT восток */ wp(15, -38, [14, 6, 9]),
    /*16 CT запад  */ wp(-15, -38, [14, 20, 23]),
    /*17 вход тонн.*/ wp(-32, 36, [2, 18]),
    /*18 тонн-1    */ wp(-32, 15, [17, 19]),
    /*19 тонн-2    */ wp(-32, -5, [18, 20]),
    /*20 выход тонн*/ wp(-32, -20, [19, 21, 16]),
    /*21 сайт B    */ wp(-33, -30, [20, 22, 23]),
    /*22 B задник  */ wp(-44, -32, [21]),
    /*23 B левый   */ wp(-22, -34, [21, 13, 16]),
  ];

  // --- Зоны закладки бомбы (прямоугольники в плоскости XZ) ---
  const sites = {
    A: { cx: 34, cz: -31, hw: 9, hd: 8 },
    B: { cx: -34, cz: -31, hw: 9, hd: 8 },
  };

  // --- Точки появления команд: T — юг, CT — север ---
  const v = (x, z) => new THREE.Vector3(x, 0.91, z);
  const spawns = {
    T: {
      player: { pos: v(0, 41), yaw: 0 }, // лицом на север
      bots: [v(5, 41), v(-5, 41), v(10, 40), v(-10, 40), v(16, 41), v(-16, 41)],
    },
    CT: {
      player: { pos: v(0, -41), yaw: Math.PI }, // лицом на юг
      bots: [v(5, -41), v(-5, -41), v(10, -40), v(-10, -40), v(16, -41), v(-16, -41)],
    },
  };

  return { colliders, waypoints, sites, spawns };
}
