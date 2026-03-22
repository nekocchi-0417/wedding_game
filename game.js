// Zootopia Wedding Run — game.js

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Music ────────────────────────────────────────────────────────────────────
const bgm = new Audio('zoo.mp3');
bgm.loop = true;
const BGM_START = 16; // skip first 16 seconds

// ── Canvas internal size ───────────────────────────────────────────────────────
const W = 800, H = 400;
const GROUND_Y = 308; // player feet rest here

// ── Physics ───────────────────────────────────────────────────────────────────
const GRAVITY       = 0.62;
const GLIDE_GRAVITY = 0.14;
const JUMP_VY       = -15;
const MAX_FALL      = 15;
const BASE_SPEED    = 5;

// ── Characters ────────────────────────────────────────────────────────────────
const CHARS = [
  { id:0, name:'Nick Wilde', emoji:'🦊', jumpMult:1.00, glideMult:1.00, unlockAt:0,    stat:'Balanced'    },
  { id:1, name:'Judy Hopps', emoji:'🐰', jumpMult:1.30, glideMult:0.80, unlockAt:0,    stat:'High Jump'   },
  { id:2, name:'Flash',      emoji:'🦥', jumpMult:0.80, glideMult:2.20, unlockAt:0, stat:'Long Glide'  },
  { id:3, name:'Chief Bogo', emoji:'🐃', jumpMult:0.95, glideMult:1.10, unlockAt:0, stat:'Steady'      },
  { id:4, name:'Mr. Big',    emoji:'🐭', jumpMult:1.45, glideMult:1.40, unlockAt:0, stat:'Tiny Legend' },
];

// ── Obstacles ─────────────────────────────────────────────────────────────────
const OBS_DEFS = [
  { emoji:'🚧', w:46, h:50, stack:false },
  { emoji:'🍩', w:50, h:44, stack:true  }, // donuts stacked 2 high
  { emoji:'🚔', w:82, h:56, stack:false },
  { emoji:'👰', w:46, h:80, stack:false },
  { emoji:'🤵', w:46, h:80, stack:false },
  { emoji:'💒', w:68, h:88, stack:false },
];

// ── State ─────────────────────────────────────────────────────────────────────
let state        = 'menu';   // menu | select | playing | gameover
let score        = 0;
let highScore    = +( localStorage.getItem('zwr_hs') || 0 );
let selectedChar = 0;
let unlocked     = new Set([0, 1, 2, 3, 4]);
let frame        = 0;

let player, obstacles = [], particles = [], bgClouds, bgBuildings;
let speed, spawnTimer, isHolding, newUnlock;

// ── Background init ───────────────────────────────────────────────────────────
function initBg() {
  bgClouds = Array.from({length:6}, (_,i) => ({
    x: i * 140 + Math.random()*60, y: 28 + Math.random()*60,
    w: 70 + Math.random()*80, speed: 0.3 + Math.random()*0.35,
  }));
  bgBuildings = Array.from({length:10}, (_,i) => ({
    x: i * 90 + Math.random()*30,
    h: 55 + Math.random()*130,
    w: 50 + Math.random()*45,
    hue: 200 + Math.random()*40,
  }));
}

// ── Game init ─────────────────────────────────────────────────────────────────
function initGame() {
  const char = CHARS[selectedChar];
  player = { x:130, y:GROUND_Y, vy:0, w:58, h:58, onGround:true, char, squish:1 };
  obstacles  = [];
  particles  = [];
  score      = 0;
  frame      = 0;
  speed      = BASE_SPEED;
  spawnTimer = 80;
  isHolding  = false;
  newUnlock  = null;
  initBg();
}

// ── Update ────────────────────────────────────────────────────────────────────
function update() {
  if (state !== 'playing') {
    // keep background scrolling on menu/gameover
    scrollBg(BASE_SPEED);
    return;
  }

  frame++;
  score  = Math.floor(frame / 6);
  speed  = BASE_SPEED + Math.floor(score / 150) * 0.7;

  // Player physics
  const useGlide = !player.onGround && isHolding && player.vy > 0;
  const grav     = useGlide ? GLIDE_GRAVITY / player.char.glideMult : GRAVITY;
  player.vy      = Math.min(player.vy + grav, MAX_FALL);
  player.y      += player.vy;

  if (player.y >= GROUND_Y) {
    if (player.vy > 7) player.squish = 0.65;
    player.y       = GROUND_Y;
    player.vy      = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
  player.squish += (1 - player.squish) * 0.22;

  // Spawn obstacles
  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    const gap  = Math.max(40, 85 - score / 40);
    spawnTimer = Math.round((55 + Math.random() * gap) * (BASE_SPEED / speed));
  }

  // Move obstacles + cull
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= speed;
    if (obstacles[i].x + obstacles[i].w < -30) obstacles.splice(i, 1);
  }

  // Collision (shrunken hitbox for fairness)
  for (const obs of obstacles) {
    if (hitTest(player, obs)) {
      spawnBurst(player.x, player.y - player.h * 0.6);
      endGame();
      return;
    }
  }

  scrollBg(speed);

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function scrollBg(spd) {
  for (const c of bgClouds) {
    c.x -= c.speed * (spd / BASE_SPEED);
    if (c.x + c.w < 0) c.x = W + c.w;
  }
  for (const b of bgBuildings) {
    b.x -= 1.4 * (spd / BASE_SPEED);
    if (b.x + b.w < 0) b.x = W + Math.random() * 40;
  }
}

function hitTest(p, obs) {
  const px = p.x - p.w * 0.30, pw = p.w * 0.60;
  const py = p.y - p.h * 0.88, ph = p.h * 0.86;
  return px < obs.x + obs.w - 10 && px + pw > obs.x + 10
      && py < obs.y              && py + ph > obs.y - obs.h;
}

function spawnObstacle() {
  const def = OBS_DEFS[Math.floor(Math.random() * OBS_DEFS.length)];
  obstacles.push({ x: W + 20, y: GROUND_Y, w: def.w, h: def.h,
                   emoji: def.emoji, stack: def.stack });
}

function spawnBurst(x, y) {
  const fx = ['💥','⭐','✨','💫','❤️','💔'];
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() - 0.9) * 9,
      life: 28 + Math.random() * 22,
      emoji: fx[Math.floor(Math.random() * fx.length)],
      size: 16 + Math.random() * 14,
    });
  }
}

function doJump() {
  if (player.onGround) {
    player.vy       = JUMP_VY * player.char.jumpMult;
    player.onGround = false;
    spawnDust();
  }
}

function spawnDust() {
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: player.x + (Math.random()-0.5)*20, y: player.y,
      vx: (Math.random()-0.5)*3, vy: -Math.random()*2,
      life: 14, emoji: '·', size: 10,
    });
  }
}

// ── End Game ──────────────────────────────────────────────────────────────────
function endGame() {
  bgm.pause();
  state = 'gameover';
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('zwr_hs', highScore);
  }
  for (const c of CHARS) {
    if (!unlocked.has(c.id) && score >= c.unlockAt) {
      unlocked.add(c.id);
      newUnlock = c;
    }
  }
  if (newUnlock) localStorage.setItem('zwr_unlocked', JSON.stringify([...unlocked]));
  showGameover();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#5ab4e8');
  sky.addColorStop(1, '#d4efff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // City silhouette
  for (const b of bgBuildings) {
    ctx.fillStyle = `hsla(${b.hue},30%,35%,0.32)`;
    ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    ctx.fillStyle = `hsla(50,90%,70%,0.3)`;
    for (let wx = b.x + 7; wx < b.x + b.w - 7; wx += 13) {
      for (let wy = GROUND_Y - b.h + 10; wy < GROUND_Y - 10; wy += 17) {
        ctx.fillRect(wx, wy, 7, 9);
      }
    }
  }

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  for (const c of bgClouds) drawCloud(c.x, c.y, c.w);

  // Ground
  const gr = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  gr.addColorStop(0,    '#6fc46e');
  gr.addColorStop(0.12, '#52a050');
  gr.addColorStop(0.12, '#c8a057');
  gr.addColorStop(1,    '#a07840');
  ctx.fillStyle = gr;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Road dashes
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([22, 16]);
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 18); ctx.lineTo(W, GROUND_Y + 18);
  ctx.stroke();
  ctx.setLineDash([]);

  // Obstacles
  ctx.globalAlpha  = 1;
  ctx.fillStyle    = 'white';
  ctx.textBaseline = 'bottom';
  ctx.textAlign    = 'center';
  for (const obs of obstacles) {
    if (obs.stack) {
      const half = Math.floor(obs.h / 2);
      ctx.font = half + 'px serif';
      ctx.fillText(obs.emoji, obs.x + obs.w / 2, obs.y - half);
      ctx.fillText(obs.emoji, obs.x + obs.w / 2, obs.y);
    } else {
      ctx.font = obs.h * 0.92 + 'px serif';
      ctx.fillText(obs.emoji, obs.x + obs.w / 2, obs.y);
    }
  }

  // Player
  drawPlayer();

  // Particles
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'center';
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    ctx.font = p.size + 'px serif';
    ctx.fillText(p.emoji, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  // HUD
  if (state === 'playing') drawHUD();
}

function drawPlayer() {
  if (state === 'menu' || state === 'select' || state === 'instruct' || !player) return;
  const p  = player;
  const bob = p.onGround ? Math.sin(frame * 0.22) * 2.5 : 0;
  const sx  = 1 + (1 - p.squish) * 0.28;
  const sy  = p.squish;

  ctx.save();
  ctx.translate(p.x, p.y - p.h / 2 + bob);
  ctx.scale(sx, sy);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, p.h / 2 + 4, p.w * 0.38, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tilt in air
  if (!p.onGround) ctx.rotate(p.vy * 0.012);

  ctx.globalAlpha = 1;
  ctx.fillStyle   = 'white';
  ctx.font = p.h + 'px serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.char.emoji, 0, 0);

  // Glide streaks
  if (!p.onGround && isHolding && p.vy > 0) {
    ctx.font = '18px serif';
    ctx.globalAlpha = 0.65;
    ctx.fillText('〰', -p.w * 0.75,  4);
    ctx.fillText('〰',  p.w * 0.75,  4);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawCloud(x, y, w) {
  ctx.beginPath();
  ctx.arc(x + w*0.28, y,       w*0.20, 0, Math.PI*2);
  ctx.arc(x + w*0.50, y-w*0.11, w*0.26, 0, Math.PI*2);
  ctx.arc(x + w*0.72, y,       w*0.19, 0, Math.PI*2);
  ctx.fill();
}

function drawHUD() {
  // Score pill
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(W - 140, 10, 128, 36, 18);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 22px system-ui';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(score, W - 16, 29);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 11px system-ui';
  ctx.fillText('SCORE', W - 16, 17);

  // Glide label
  const useGlide = !player.onGround && isHolding && player.vy > 0;
  if (useGlide) {
    ctx.fillStyle = 'rgba(100,210,255,0.75)';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('✦ GLIDING ✦', player.x, player.y - player.h - 12);
  }

  // Character icon
  ctx.font = '26px serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.char.emoji, 14, 29);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,   x+w,y+r,   r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h, x+w-r,y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h,   x,y+h-r,   r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,y,     x+r,y,     r);
  ctx.closePath();
  ctx.fill();
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let loopRunning = false;
function loop() {
  loopRunning = true;
  try {
    update();
    draw();
  } catch (e) {
    console.error('Game loop error:', e);
  }
  requestAnimationFrame(loop);
}
function ensureLoop() { if (!loopRunning) loop(); }

// ── UI helpers ────────────────────────────────────────────────────────────────
function showMenu() {
  document.getElementById('menuScreen').classList.remove('hidden');
  document.getElementById('selectScreen').classList.add('hidden');
  document.getElementById('gameoverScreen').classList.add('hidden');
  document.getElementById('menuHs').textContent = highScore;
}

function showSelect() {
  document.getElementById('menuScreen').classList.add('hidden');
  document.getElementById('selectScreen').classList.remove('hidden');
  buildCharGrid();
}

function buildCharGrid() {
  const grid = document.getElementById('charGrid');
  grid.innerHTML = '';
  for (const c of CHARS) {
    const locked = !unlocked.has(c.id);
    const card   = document.createElement('div');
    card.className = 'char-card' +
      (locked ? ' locked' : '') +
      (selectedChar === c.id ? ' selected' : '');
    card.innerHTML = `
      <div class="char-emoji">${c.emoji}</div>
      <div class="char-name">${c.name}</div>
      ${locked
        ? `<div class="char-lock">🔒 ${c.unlockAt}</div>`
        : `<div class="char-stat">${c.stat}</div>`}
    `;
    if (!locked) card.addEventListener('click', () => { selectedChar = c.id; buildCharGrid(); });
    grid.appendChild(card);
  }
}

function showInstructions() {
  document.getElementById('selectScreen').classList.add('hidden');
  document.getElementById('instructScreen').classList.remove('hidden');
  state = 'instruct';
}

function showPlaying() {
  document.getElementById('selectScreen').classList.add('hidden');
  document.getElementById('instructScreen').classList.add('hidden');
  document.getElementById('gameoverScreen').classList.add('hidden');
  initGame();
  state = 'playing';
  ensureLoop();
  bgm.currentTime = BGM_START;
  bgm.play().catch(() => {});
}

function showGameover() {
  document.getElementById('gameoverScreen').classList.remove('hidden');
  document.getElementById('finalScore').textContent = score;
  document.getElementById('finalHs').textContent    = highScore;
  const el = document.getElementById('unlockMsg');
  if (newUnlock) {
    el.classList.remove('hidden');
    el.textContent = `🎉 Unlocked: ${newUnlock.emoji} ${newUnlock.name}!`;
  } else {
    el.classList.add('hidden');
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────
function onDown(e) {
  e.preventDefault();
  isHolding = true;
  if (state === 'playing') doJump();
}
function onUp(e) { e.preventDefault(); isHolding = false; }

canvas.addEventListener('mousedown',  onDown);
canvas.addEventListener('mouseup',    onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchend',   onUp,   { passive: false });

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault(); isHolding = true;
    if (state === 'playing') doJump();
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') isHolding = false;
});

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => { state='select'; showSelect(); });
document.getElementById('backBtn') .addEventListener('click', () => { state='menu';   showMenu();   });
document.getElementById('playBtn') .addEventListener('click', showInstructions);
document.getElementById('goBtn')  .addEventListener('click', showPlaying);
document.getElementById('retryBtn').addEventListener('click', showPlaying);
document.getElementById('menuBtn') .addEventListener('click', () => { state='menu';   showMenu();   });

// ── Boot ──────────────────────────────────────────────────────────────────────
initBg();
showMenu();
loop();
