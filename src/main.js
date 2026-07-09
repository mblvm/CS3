import * as THREE from 'three';
import { buildMap } from './map.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { BotManager } from './bots.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { damp } from './utils.js';

// --- рендер ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- системы ---
const audio = new AudioSys();
const hud = new HUD();
const effects = new Effects(scene);
const { colliders, waypoints, playerSpawn, botSpawns } = buildMap(scene);
const player = new Player(camera, colliders);
player.spawn(playerSpawn);

const state = {
  started: false,
  menuOpen: true,
  difficulty: 'normal',
  sens: 1,
  kills: 0,
  deaths: 0,
  respawnT: 0,
  scoreboardOpen: false,
};

const bots = new BotManager({
  scene, colliders, waypoints, spawns: botSpawns, player, effects, audio,
  onPlayerHit(bot, dmg) {
    if (!player.alive) return;
    const died = player.damage(dmg);
    hud.setHP(player.hp);
    hud.damageFlash();
    audio.hurt();
    if (died) {
      bot.kills++;
      state.deaths++;
      state.respawnT = 3;
      hud.setScore(state.kills, state.deaths);
      hud.killfeed(`<b>${bot.name}</b> убил вас`);
      hud.death(true, `${bot.name} · возрождение через 3 c`);
      bots.onPlayerDeath();
    }
  },
});
bots.setDifficulty(state.difficulty);
let appliedDifficulty = state.difficulty;

const weapons = new WeaponSystem({
  camera, scene, player, bots, colliders, effects, audio, hud,
  onKill(bot, weaponName, headshot) {
    state.kills++;
    hud.setScore(state.kills, state.deaths);
    hud.killfeed(`Вы <b>убили ${bot.name}</b> (${weaponName}${headshot ? ', в голову' : ''})`);
  },
  onLoudShot() {
    bots.alertShot(player.pos);
  },
});

// --- ввод ---
const input = { keys: new Set(), mouse0: false, click0: false, click2: false };
const KEYMAP = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
  ShiftLeft: 'walk', ShiftRight: 'walk',
};

document.addEventListener('keydown', (e) => {
  if (state.menuOpen) return;
  if (KEYMAP[e.code]) { input.keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 4) weapons.selectSlot(n);
  }
  if (e.code === 'KeyR') weapons.startReload();
  if (e.code === 'Tab') { state.scoreboardOpen = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) input.keys.delete(KEYMAP[e.code]);
  if (e.code === 'Tab') state.scoreboardOpen = false;
});
document.addEventListener('mousedown', (e) => {
  if (state.menuOpen) return;
  if (e.button === 0) { input.mouse0 = true; input.click0 = true; }
  if (e.button === 2) input.click2 = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouse0 = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (state.menuOpen || !player.alive) return;
  const sens = state.sens * (weapons.scoped ? 0.35 : 1);
  player.look(e.movementX, e.movementY, sens);
});

// --- меню ---
const menuEl = document.getElementById('menu');
const sensEl = document.getElementById('sens');
const sensVal = document.getElementById('sens-val');
sensEl.addEventListener('input', () => {
  state.sens = +sensEl.value;
  sensVal.textContent = state.sens.toFixed(1);
});
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.difficulty = b.dataset.diff;
  });
});

document.getElementById('play').addEventListener('click', () => {
  audio.resume();
  if (appliedDifficulty !== state.difficulty) {
    appliedDifficulty = state.difficulty;
    bots.setDifficulty(state.difficulty);
    state.kills = 0;
    state.deaths = 0;
    hud.setScore(0, 0);
    if (!player.alive) { state.respawnT = 0; }
    respawnPlayer();
  }
  state.started = true;
  closeMenu();
});

function closeMenu() {
  state.menuOpen = false;
  menuEl.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
}

function openMenu() {
  state.menuOpen = true;
  menuEl.style.display = '';
  input.keys.clear();
  input.mouse0 = false;
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state.started && !state.menuOpen) openMenu();
});
renderer.domElement.addEventListener('click', () => {
  if (!state.menuOpen && !document.pointerLockElement) {
    renderer.domElement.requestPointerLock?.();
  }
});

// --- зум AWP ---
let targetFov = 75;

function respawnPlayer() {
  player.spawn(playerSpawn);
  weapons.refill();
  hud.setHP(player.hp);
  hud.death(false);
}

// --- игровой цикл ---
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.started && !state.menuOpen) {
    if (player.alive) {
      const recoil = { pitch: weapons.recoil.pitch, yaw: weapons.recoil.yaw };
      player.update(dt, input, weapons.weapon.moveMult, recoil, audio);
      weapons.update(dt, input);
    } else {
      state.respawnT -= dt;
      if (state.respawnT <= 0) respawnPlayer();
    }
    bots.update(dt);
    effects.update(dt);

    // зум
    targetFov = weapons.scoped ? 20 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = damp(camera.fov, targetFov, 14, dt);
      camera.updateProjectionMatrix();
    }

    hud.setSpeed(player.horizSpeed);
    hud.scoreboard(state.scoreboardOpen, state.scoreboardOpen ? [
      { name: 'Вы', kills: state.kills, deaths: state.deaths, me: true },
      ...bots.bots.map((b) => ({ name: b.name, kills: b.kills, deaths: b.deaths })),
    ] : null);
  }

  renderer.render(scene, camera);
}

hud.setHP(player.hp);
hud.setScore(0, 0);
tick();

// хук для отладки/тестов
window.__game = { state, player, bots, weapons };
