const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = process.env.EMBERWOOD_MINI_SOURCE;
const html = sourcePath ? null : fs.readFileSync(path.resolve(__dirname, '../emberwood.html'), 'utf8');
const source = sourcePath ? fs.readFileSync(sourcePath, 'utf8') : html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1];
const scope = vm.createContext({ window: {}, console, Math, Set, Map, structuredClone });
vm.runInContext(source, scope, { filename: sourcePath || 'emberwood-minigames.js' });
const plain = value => JSON.parse(JSON.stringify(value));
function engine(options = {}) {
  assert.equal(typeof scope.window.EmberwoodMiniGames?.CombatMiniGame, 'function', 'combat minigame export is missing');
  return new scope.window.EmberwoodMiniGames.CombatMiniGame({ type: 'targets', day: 1, seed: 42, id: 'test-mini', ...options });
}
function advance(game, seconds, dt = 1 / 120) {
  let remaining = seconds;
  while (remaining > 1e-9 && !game.finished) {
    const step = Math.min(dt, remaining);
    game.update(step);
    remaining -= step;
  }
}
function restore(data) { return scope.window.EmberwoodMiniGames.CombatMiniGame.restore(plain(data)); }
function finishTargets(game) {
  while (!game.finished) {
    const target = game.snapshot().targets[0];
    assert.equal(game.act({ action: 'shoot', x: target.x, y: target.y }), true);
  }
}

test('the DOM-free engine exposes the agreed snapshot and waits for completion', () => {
  const game = engine();
  const view = game.snapshot();
  assert.equal(view.id, 'test-mini');
  assert.equal(view.type, 'targets');
  assert.equal(view.finished, false);
  assert.equal(view.score, 0);
  assert.equal(view.maxScore, 1000);
  assert.match(view.message, /[ก-๙]/);
  assert.equal(game.getResult(), null);
  view.targets[0].x = -1;
  assert.ok(game.snapshot().targets[0].x >= 0, 'snapshots must not expose mutable engine state');
});

test('targets move, real hits finish at ten, and misses reduce final quality', () => {
  const clean = engine();
  const initial = plain(clean.snapshot().targets);
  advance(clean, 0.4);
  assert.notDeepEqual(plain(clean.snapshot().targets), initial);
  finishTargets(clean);
  assert.deepEqual(plain(clean.getResult()), { score: 1000, maxScore: 1000, quality: 1, success: true });
  const missed = engine();
  missed.act({ action: 'shoot', x: 0, y: 0 });
  finishTargets(missed);
  assert.ok(missed.getResult().quality < clean.getResult().quality);
});

test('invalid or unrelated target actions cannot change the game', () => {
  const game = engine();
  const before = plain(game.serialize());
  for (const action of [null, {}, { action: 'parry' }, { action: 'shoot', x: NaN, y: 0 }, { action: 'shoot', x: 0, y: Infinity }, { action: 'shoot', x: -1, y: 20 }, { action: 'shoot', x: 361, y: 20 }]) {
    assert.equal(game.act(action), false);
  }
  for (const dt of [NaN, Infinity, -1, '1']) game.update(dt);
  assert.deepEqual(plain(game.serialize()), before);
});

test('unshot targets time out and completed games cannot pay or change twice', () => {
  const game = engine();
  advance(game, 21);
  assert.equal(game.finished, true);
  assert.equal(game.snapshot().elapsed, 20);
  assert.equal(game.getResult().success, false);
  const before = plain(game.serialize());
  const result = plain(game.getResult());
  game.update(1);
  assert.equal(game.act({ action: 'shoot', x: 180, y: 110 }), false);
  assert.equal(game.setInput(1, 0), false);
  assert.deepEqual(plain(game.serialize()), before);
  assert.deepEqual(plain(game.getResult()), result);
  game.getResult().score = 9999;
  assert.deepEqual(plain(game.getResult()), result);
});

test('dodge normalizes diagonal movement, rejects invalid input and bounds long frames', () => {
  const straight = engine({ type: 'dodge' });
  const diagonal = engine({ type: 'dodge' });
  const origin = straight.snapshot().player;
  straight.setInput(1, 0);
  diagonal.setInput(1, 1);
  advance(straight, 0.1);
  advance(diagonal, 0.1);
  const a = straight.snapshot().player, b = diagonal.snapshot().player;
  assert.ok(Math.abs(Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)) < 1e-7);
  const before = plain(straight.serialize());
  assert.equal(straight.setInput(NaN, 1), false);
  assert.equal(straight.setInput(2, 0), false);
  assert.deepEqual(plain(straight.serialize()), before);
  const x = straight.snapshot().player.x;
  straight.update(10000);
  assert.ok(straight.snapshot().elapsed <= 0.351);
  assert.ok(straight.snapshot().player.x - x <= 40);
  advance(straight, 2);
  const edge = straight.snapshot().player;
  assert.ok(edge.x <= 360 - edge.r && edge.y <= 220 - edge.r);
});

test('incoming dodge hazards move, expire and remain bounded', () => {
  const game = engine({ type: 'dodge' });
  advance(game, 0.5);
  const first = game.snapshot().hazards[0];
  assert.ok(first && Number.isFinite(first.x));
  advance(game, 0.1);
  const moved = game.snapshot().hazards.find(hazard => hazard.id === first.id);
  assert.ok(moved && Math.hypot(moved.x - first.x, moved.y - first.y) > 0);
  for (let i = 0; i < 900 && !game.finished; i++) {
    game.setInput(Math.cos(i / 30), Math.sin(i / 30));
    game.update(1 / 60);
    assert.ok(game.snapshot().hazards.length <= 32);
  }
  assert.equal(game.finished, true);
  assert.ok(game.snapshot().elapsed <= 15);
  assert.equal(game.snapshot().hazards.some(hazard => hazard.id === first.id), false);
});

test('dodge collisions remove HP once during invulnerability and defeat at zero HP', () => {
  const saved = plain(engine({ type: 'dodge' }).serialize());
  const player = saved.state.player;
  saved.state.hazards = [1, 2, 3].map(id => ({ id, x: player.x, y: player.y, r: 5, vx: 0, vy: 0, life: 5 }));
  saved.state.nextId = 4;
  const game = restore(saved);
  game.update(0.01);
  assert.equal(game.snapshot().player.hp, 2);
  assert.equal(game.snapshot().player.invincible, true);
  advance(game, 0.3);
  assert.equal(game.snapshot().player.hp, 2);
  advance(game, 2);
  assert.equal(game.snapshot().player.hp, 0);
  assert.equal(game.finished, true);
  assert.equal(game.getResult().success, false);
  assert.ok(game.getResult().quality >= 0 && game.getResult().quality <= 1);
});

test('dodge hazards expire without a collision and a surviving player completes fifteen seconds', () => {
  const saved = plain(engine({ type: 'dodge' }).serialize());
  saved.state.hazards = [{ id: 1, x: 20, y: 20, r: 5, vx: 0, vy: 0, life: 0.02 }];
  saved.state.nextId = 2;
  const expiry = restore(saved);
  advance(expiry, 0.03);
  assert.equal(expiry.snapshot().hazards.length, 0);
  assert.equal(expiry.snapshot().player.hp, 3);
  const game = engine({ type: 'dodge', seed: 7 });
  for (let i = 0; i < 901 && !game.finished; i++) {
    const player = game.snapshot().player;
    // Travel around the arena perimeter; hostile shots aim at previous positions.
    const corners = [[330, 190], [30, 190], [30, 30], [330, 30]];
    const point = corners[Math.floor(i / 90) % corners.length];
    const dx = point[0] - player.x, dy = point[1] - player.y, length = Math.hypot(dx, dy);
    game.setInput(length > 2 ? dx / length : 0, length > 2 ? dy / length : 0);
    game.update(1 / 60);
  }
  assert.equal(game.snapshot().elapsed, 15);
  assert.equal(game.getResult().success, true);
  assert.ok(game.getResult().quality > 0.7 && game.getResult().quality <= 1);
});

test('duel rewards actual parry timing and all five rounds must be played', () => {
  const game = engine({ type: 'duel' });
  const seenWindups = [];
  while (!game.finished) {
    const view = game.snapshot(), cue = view.cue;
    if (cue.phase === 'windup' && !seenWindups[cue.round - 1]) seenWindups[cue.round - 1] = cue.windowStart;
    if (cue.phase === 'parry' && cue.progress >= (cue.windowStart + cue.windowEnd) / 2) {
      assert.equal(game.act({ action: 'parry' }), true);
      assert.equal(game.act({ action: 'parry' }), false, 'one round cannot award multiple parries');
    }
    game.update(1 / 1000);
  }
  assert.equal(seenWindups.length, 5);
  assert.ok(new Set(seenWindups).size > 1, 'windup timings must vary');
  assert.ok(game.getResult().score >= 990);
  assert.equal(game.getResult().success, true);
});

test('early, late and absent duel parries cannot score', () => {
  const early = engine({ type: 'duel' });
  assert.equal(early.act({ action: 'parry' }), true);
  advance(early, 20);
  assert.equal(early.getResult().score, 0);
  const late = engine({ type: 'duel' });
  while (late.snapshot().cue.phase !== 'recovery') late.update(0.005);
  assert.equal(late.act({ action: 'parry' }), false);
  advance(late, 20);
  assert.equal(late.getResult().success, false);
  assert.equal(late.getResult().score, 0);
});

for (const type of ['targets', 'dodge', 'duel']) test(`${type} serialization resumes the exact deterministic simulation`, () => {
  const game = engine({ type, day: 55 });
  game.setInput(0.5, -0.25);
  advance(game, 0.8);
  if (type === 'targets') {
    const target = game.snapshot().targets[0];
    game.act({ action: 'shoot', x: target.x, y: target.y });
  }
  const copy = restore(game.serialize());
  assert.equal(copy.serialize().day, 55);
  assert.deepEqual(plain(copy.snapshot()), plain(game.snapshot()));
  for (let i = 0; i < 400; i++) {
    if (type === 'duel' && i % 37 === 0) { game.act({ action: 'parry' }); copy.act({ action: 'parry' }); }
    game.update(1 / 60);
    copy.update(1 / 60);
  }
  assert.deepEqual(plain(copy.serialize()), plain(game.serialize()));
  assert.deepEqual(plain(copy.getResult()), plain(game.getResult()));
  const retagged = plain(game.serialize());
  retagged.id = 'resumed-mini';
  assert.equal(restore(retagged).snapshot().id, 'resumed-mini');
});

test('completed saves remain completed after restore without accepting more actions', () => {
  const game = engine();
  finishTargets(game);
  const resumed = restore(game.serialize());
  assert.equal(resumed.finished, true);
  assert.equal(resumed.act({ action: 'shoot', x: 180, y: 110 }), false);
  assert.deepEqual(plain(resumed.getResult()), plain(game.getResult()));
});

test('constructors and restore reject malformed, impossible or nonfinite state', () => {
  engine();
  const CombatMiniGame = scope.window.EmberwoodMiniGames.CombatMiniGame;
  for (const options of [{ type: 'unknown' }, { day: 0 }, { day: Infinity }, { seed: NaN }, { id: {} }]) assert.throws(() => engine(options));
  for (const data of [null, {}, [], { version: 99 }]) assert.throws(() => CombatMiniGame.restore(data));
  const mutations = [
    data => { data.type = 'unknown'; },
    data => { data.elapsed = Infinity; },
    data => { data.elapsed = -1; },
    data => { data.finished = true; },
    data => { data.input.x = NaN; },
    data => { data.state.targets[0].x = -1000; },
    data => { data.state.targets[0].vx = Infinity; },
    data => { data.state.targets = new Array(10000).fill(data.state.targets[0]); }
  ];
  for (const mutate of mutations) {
    const data = plain(engine().serialize());
    mutate(data);
    assert.throws(() => CombatMiniGame.restore(data));
  }
});

test('restore rejects impossible duel outcomes before the parry window and missed deadlines', () => {
  const before = plain(engine({ type: 'duel' }).serialize());
  before.state.scores[0] = 200;
  assert.throws(() => restore(before));
  const late = engine({ type: 'duel' });
  while (late.snapshot().cue.phase !== 'recovery') late.update(0.005);
  const saved = plain(late.serialize());
  saved.state.scores[0] = null;
  assert.throws(() => restore(saved));
});
