import * as THREE from 'three';
import { buildMap } from './map.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { BotManager } from './bots.js';
import { GameState } from './gamestate.js';
import { HUD } from './hud.js';
import { Radar } from './radar.js';
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
const { colliders, waypoints, sites, spawns } = buildMap(scene);
const player = new Player(camera, colliders);
player.spawn(spawns.T.player);

const state = {
  started: false,       // матч запущен
  menuOpen: true,
  difficulty: 'normal',
  sens: 1,
  scoreboardOpen: false,
};

const bots = new BotManager({
  scene, colliders, waypoints, spawns, sites, player, effects, audio,
});
bots.setDifficulty(state.difficulty);

const weapons = new WeaponSystem({
  camera, scene, player, bots, colliders, effects, audio, hud,
  onKill(bot, weapon, headshot) {
    game.onPlayerKill(bot, weapon, headshot);
  },
  onLoudShot() {
    bots.alertShot(player.pos, player.team);
  },
});

const game = new GameState({
  player, bots, weapons, hud, audio, effects, scene, sites, spawns,
});
bots.setGame(game);

const radar = new Radar(document.getElementById('radar'), colliders, sites);

// --- ввод ---
const input = { keys: new Set(), mouse0: false, click0: false, click2: false };
// пустой ввод — подставляется, пока движение заблокировано (подготовка раунда)
const NO_INPUT = { keys: new Set(), mouse0: false, click0: false, click2: false };
const KEYMAP = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
  ShiftLeft: 'walk', ShiftRight: 'walk', KeyE: 'use',
};

document.addEventListener('keydown', (e) => {
  if (state.menuOpen) return;
  if (KEYMAP[e.code]) { input.keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    // при открытом меню закупки цифры покупают, иначе — переключают оружие
    if (game.buyOpen) game.buyKey(n);
    else if (n >= 1 && n <= 4) weapons.selectSlot(n);
  }
  if (e.code === 'KeyR') weapons.startReload();
  if (e.code === 'KeyB') game.toggleBuy();
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

// --- главное меню ---
const menuEl = document.getElementById('menu');
const sensEl = document.getElementById('sens');
const sensVal = document.getElementById('sens-val');
sensEl.addEventListener('input', () => {
  state.sens = +sensEl.value;
  sensVal.textContent = state.sens.toFixed(1);
});
let appliedDifficulty = null;
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.difficulty = b.dataset.diff;
  });
});

document.getElementById('play').addEventListener('click', () => {
  audio.resume();
  // новый матч, если ещё не начат или сменили сложность
  if (!state.started || appliedDifficulty !== state.difficulty) {
    appliedDifficulty = state.difficulty;
    hud.gameOver(false);
    game.startMatch(state.difficulty);
    state.started = true;
  }
  closeMenu();
});

// возврат в меню с экрана конца матча
document.getElementById('to-menu').addEventListener('click', () => {
  hud.gameOver(false);
  state.started = false; // следующее «Играть» начнёт новый матч
  openMenu();
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
  if (!document.pointerLockElement && state.started && !state.menuOpen
      && game.phase !== 'gameover') openMenu();
});
renderer.domElement.addEventListener('click', () => {
  if (!state.menuOpen && !document.pointerLockElement && game.phase !== 'gameover') {
    renderer.domElement.requestPointerLock?.();
  }
});

// --- игровой цикл ---
const clock = new THREE.Clock();
let targetFov = 75;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.started && !state.menuOpen) {
    if (player.alive) {
      // во время подготовки движение и стрельба заблокированы, обзор — нет
      const activeInput = game.movementLocked ? NO_INPUT : input;
      const recoil = { pitch: weapons.recoil.pitch, yaw: weapons.recoil.yaw };
      player.update(dt, activeInput, weapons.weapon.moveMult, recoil, audio);
      if (game.combatAllowed) weapons.update(dt, input);
      else { input.click0 = false; input.click2 = false; } // клики не копятся в паузах
    }
    bots.update(dt);
    game.update(dt, input);
    effects.update(dt);

    // зум AWP
    targetFov = weapons.scoped ? 20 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = damp(camera.fov, targetFov, 14, dt);
      camera.updateProjectionMatrix();
    }

    radar.update(dt, { player, bots, game, colliders });
    hud.setSpeed(player.horizSpeed);
    hud.scoreboard(state.scoreboardOpen, state.scoreboardOpen ? game.scoreboardData() : null);
  }

  renderer.render(scene, camera);
}

hud.setHP(player.hp);
hud.setArmor(0);
hud.setMoney(800);
tick();

// хук для отладки/тестов
window.__game = { state, game, player, bots, weapons };
