'use strict';

/**
 * core/test.js — runnable with `node core/test.js`
 * Exercises the config-merge logic (the safety-critical path) and validates
 * that every preset value is inside Rust's legal convar range.
 */

const assert = require('assert');
const { parseClientCfg, mergeClientCfg, normaliseValue, clampValue } = require('./rust-config');
const { CONVARS, PRESETS } = require('./rust-presets');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  \u2717 ${name}\n      ${err.message}`);
  }
}

// A realistic-ish existing config with comments, blanks, audio + sensitivity
// settings that MUST survive a graphics preset being applied.
const SAMPLE = [
  '# my personal rust config',
  'audio.master "0.8"',
  'audio.voices "1"',
  '',
  'input.sensitivity "0.31"',
  'graphics.fov "75"',
  'graphics.quality "0"',
  'client.pushtotalk "True"',
  '',
].join('\n');

console.log('\nparseClientCfg');
test('parses convars into ordered list + map', () => {
  const { order, values } = parseClientCfg(SAMPLE);
  assert.strictEqual(values['audio.master'], '0.8');
  assert.strictEqual(values['input.sensitivity'], '0.31');
  assert.strictEqual(values['graphics.quality'], '0');
  assert.ok(order.indexOf('audio.master') < order.indexOf('graphics.fov'));
});

test('returns empty structures for empty/non-string input', () => {
  assert.deepStrictEqual(parseClientCfg('').order, []);
  assert.deepStrictEqual(parseClientCfg(undefined).values, {});
});

test('last write wins on duplicate keys (mirrors Rust load order)', () => {
  const { values } = parseClientCfg('graphics.fov "70"\ngraphics.fov "90"');
  assert.strictEqual(values['graphics.fov'], '90');
});

console.log('\nmergeClientCfg — preservation');
test('keeps comments, blank lines and unrelated convars intact', () => {
  const { text } = mergeClientCfg(SAMPLE, { 'graphics.quality': 2 }, { presetLabel: 'PVP' });
  assert.ok(text.includes('# my personal rust config'), 'comment lost');
  assert.ok(text.includes('audio.master "0.8"'), 'audio setting lost');
  assert.ok(text.includes('input.sensitivity "0.31"'), 'sensitivity lost');
  assert.ok(text.includes('client.pushtotalk "True"'), 'ptt lost');
});

test('rewrites a changed convar in place (no duplicate line)', () => {
  const { text, changed } = mergeClientCfg(SAMPLE, { 'graphics.quality': 2 });
  const occurrences = text.split('\n').filter((l) => l.startsWith('graphics.quality ')).length;
  assert.strictEqual(occurrences, 1, 'convar duplicated');
  assert.ok(text.includes('graphics.quality "2"'));
  assert.deepStrictEqual(changed, ['graphics.quality']);
});

test('reports unchanged when value already matches', () => {
  const { changed, unchanged } = mergeClientCfg(SAMPLE, { 'graphics.fov': 75 });
  assert.deepStrictEqual(changed, []);
  assert.deepStrictEqual(unchanged, ['graphics.fov']);
});

test('preserves original indentation on a rewritten line', () => {
  const indented = '   graphics.quality "0"';
  const { text } = mergeClientCfg(indented, { 'graphics.quality': 4 });
  assert.ok(text.startsWith('   graphics.quality "4"'), 'indentation not preserved');
});

console.log('\nmergeClientCfg — additions');
test('appends brand-new convars under a Settinger banner', () => {
  const { text, added } = mergeClientCfg(SAMPLE, { 'water.quality': 0 }, { presetLabel: 'Max Performance', stamp: 'STAMP' });
  assert.ok(added.includes('water.quality'));
  assert.ok(text.includes('# Settinger :: Max Performance :: added STAMP'));
  assert.ok(text.includes('water.quality "0"'));
});

test('handles a brand-new (empty) config file', () => {
  const { text, added } = mergeClientCfg('', { 'graphics.quality': 1, 'fps.limit': 0 });
  assert.ok(text.includes('graphics.quality "1"'));
  assert.ok(text.includes('fps.limit "0"'));
  assert.strictEqual(added.length, 2);
});

console.log('\nmergeClientCfg — robustness');
test('booleans serialise to Rust True/False casing', () => {
  const { text } = mergeClientCfg('', { 'effects.bloom': false, 'graphics.lso': true });
  assert.ok(text.includes('effects.bloom "False"'));
  assert.ok(text.includes('graphics.lso "True"'));
});

test('handles CRLF line endings without corruption', () => {
  const crlf = '# header\r\ngraphics.fov "75"\r\naudio.master "1"\r\n';
  const { text } = mergeClientCfg(crlf, { 'graphics.fov': 90 });
  assert.ok(text.includes('graphics.fov "90"'));
  assert.ok(text.includes('audio.master "1"'));
  assert.ok(text.includes('# header'));
});

test('applying the same preset twice is idempotent', () => {
  const preset = PRESETS.find((p) => p.id === 'pvp').convars;
  const once = mergeClientCfg(SAMPLE, preset, { presetLabel: 'PVP', stamp: 'S' }).text;
  const twice = mergeClientCfg(once, preset, { presetLabel: 'PVP', stamp: 'S' }).text;
  assert.strictEqual(once, twice, 'second apply changed the file');
});

test('output ends with exactly one trailing newline', () => {
  const { text } = mergeClientCfg(SAMPLE, { 'graphics.quality': 2 });
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.endsWith('\n\n'));
});

test('does not invent or drop keys when applying a full preset', () => {
  const preset = PRESETS.find((p) => p.id === 'max_performance').convars;
  const { text } = mergeClientCfg(SAMPLE, preset, { presetLabel: 'Max Performance' });
  const after = parseClientCfg(text).values;
  for (const k of Object.keys(preset)) {
    assert.strictEqual(after[k], normaliseValue(preset[k]), `key ${k} not written correctly`);
  }
  // untouched personal settings still present
  assert.strictEqual(after['audio.master'], '0.8');
  assert.strictEqual(after['input.sensitivity'], '0.31');
});

console.log('\nclampValue');
test('clamps integers into range and rounds', () => {
  assert.strictEqual(clampValue(9999, { type: 'int', min: 0, max: 100 }).value, 100);
  assert.strictEqual(clampValue(-5, { type: 'int', min: 0, max: 100 }).value, 0);
  assert.strictEqual(clampValue(2.7, { type: 'int', min: 0, max: 100 }).value, 3);
});

test('flags out-of-range enum values', () => {
  assert.strictEqual(clampValue(9, { type: 'enum', options: [1, 2, 4] }).adjusted, true);
  assert.strictEqual(clampValue(2, { type: 'enum', options: [1, 2, 4] }).adjusted, false);
});

console.log('\npreset validity (every value within Rust\u2019s legal range)');
for (const preset of PRESETS) {
  test(`preset "${preset.id}" has only known, in-range convars`, () => {
    for (const [key, val] of Object.entries(preset.convars)) {
      const def = CONVARS[key];
      assert.ok(def, `unknown convar ${key} in preset ${preset.id}`);
      const { adjusted } = clampValue(val, def.spec);
      assert.ok(!adjusted, `value ${val} for ${key} is outside its legal range`);
    }
  });
}

test('soft shadows only used when graphics.quality > 2 (Rust constraint)', () => {
  for (const preset of PRESETS) {
    const c = preset.convars;
    if (c['graphics.shadowmode'] === 2) {
      assert.ok(c['graphics.quality'] > 2, `${preset.id} uses soft shadows but quality <= 2`);
    }
  }
});

console.log(`\n----------------------------------------`);
console.log(`Result: ${passed} passed, ${failed} failed`);
console.log(`----------------------------------------\n`);

if (failed > 0) process.exit(1);
