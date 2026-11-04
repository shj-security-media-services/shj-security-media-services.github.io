import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import config from '../data.mjs';
import { text, roleFor, itemsFor, search, initialState, validSnapshot } from '../model.mjs';

for (const [id, role] of Object.entries(config.roles)) {
  test(`${id}: one unique DEMO identity keyed by mil`, () => {
    assert.match(role.mil, /^9000[1-6]$/);
    assert.equal(config.people.filter(person => person.mil === role.mil).length, 1);
    assert.equal(new Set(config.people.map(person => person.mil)).size, config.people.length);
  });
  test(`${id}: focal and waiting records are scoped by mil`, () => {
    const items = itemsFor(config, id);
    assert.ok(items.length);
    assert.ok(items.every(item => item.for.includes(role.mil)));
    assert.ok(items.some(item => item.kind === role.focal));
  });
  test(`${id}: all shortcuts and second tab exist`, () => {
    assert.ok(config.services[role.tab]);
    assert.ok(role.shortcuts.every(key => Object.hasOwn(config.services, key)));
  });
  test(`${id}: search covers translated services, records and mil`, () => {
    for (const lang of config.languages) {
      assert.ok(search(config, id, text(config.services[role.shortcuts[0]].title, lang), lang).length);
      assert.ok(search(config, id, role.mil, lang).length);
      const alien = config.people.find(person => person.mil !== role.mil);
      assert.equal(search(config, id, alien.mil, lang).length, 0);
    }
  });
}
test('invalid and inherited role keys fail closed to DEMO default', () => {
  for (const key of [null, '', '__proto__', 'constructor', 'admin']) assert.equal(roleFor(config, key), config.defaults.role);
});
test('invalid display settings fall back to configured defaults', () => {
  assert.deepEqual(initialState(config, new URLSearchParams('role=admin&lang=bad&theme=bad')), config.defaults);
});
test('whitespace search returns no results', () => assert.deepEqual(search(config, 'ph', '  ', 'ar'), []));
test('markup search is treated as text', () => assert.deepEqual(search(config, 'ph', '<img onerror=alert(1)>', 'en'), []));
test('valid cache contains only bundled IDs', () => assert.ok(validSnapshot({ schema: config.schema, ids: config.items.map(x => x.id) }, config)));
test('foreign, duplicate and old cache records are rejected', () => {
  assert.equal(validSnapshot({ schema: 'old', ids: [] }, config), false);
  assert.equal(validSnapshot({ schema: config.schema, ids: config.items.map(() => config.items[0].id) }, config), false);
  assert.equal(validSnapshot({ schema: config.schema, ids: config.items.map(x => x.id).concat('foreign') }, config), false);
});
test('every visible DEMO label has Arabic and English', () => {
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'ar')) {
      assert.equal(typeof value.en, 'string'); assert.ok(value.ar && value.en);
      assert.equal(/[\u0600-\u06ff]/.test(value.en), false, value.en);
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(config);
});
test('the DEMO has no executable live data or credential transport', () => {
  const source = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(|serviceWorker|localStorage|sessionStorage|console\.log|innerHTML/);
  assert.doesNotMatch(readFileSync(new URL('../data.mjs', import.meta.url), 'utf8'), /https?:|webhook|token|password/i);
});
