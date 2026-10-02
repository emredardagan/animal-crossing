import { balance, emptySave, merge, migrate } from '../src/platform/saveModel';

const S = ['dog', 'cat'];

test('balance is earned + iap - spent', () => {
  const s = { ...emptySave('u', S), earned: { a: 100, b: 50 }, spent: { a: 30 }, iap: { t1: 500 } };
  expect(balance(s)).toBe(620);
});

test('two devices playing offline keep all coins after merge', () => {
  const base = { ...emptySave('u', S), earned: { a: 100 } };
  const onA = { ...base, earned: { a: 140 }, spent: { a: 100 }, owned: [...S, 'fox'] };   // A earns 40, buys fox
  const onB = { ...base, earned: { a: 100, b: 25 }, best: 77 };                            // B earns 25
  const m = merge(onA, onB);
  expect(balance(m)).toBe(140 + 25 - 100);
  expect(m.owned).toContain('fox');
  expect(m.best).toBe(77);
  expect(merge(onB, onA)).toEqual({ ...m, rcUserId: m.rcUserId });
});

test('a coin pack is never granted twice', () => {
  const a = { ...emptySave('u', S), iap: { tx1: 1500 } };
  const b = { ...emptySave('u', S), iap: { tx1: 1500 } };
  expect(balance(merge(a, b))).toBe(1500);
});

test('merge is idempotent', () => {
  const a = { ...emptySave('u', S), earned: { a: 5 }, mlevel: 3, missions: [{ type: 'score', n: 15, p: 4, reward: 10, done: false }] };
  expect(merge(a, a)).toEqual({ ...a, owned: [...a.owned].sort() });
});

test('missions come from the side with the higher mission level', () => {
  const a = { ...emptySave('u', S), mlevel: 2, missions: [{ type: 'roads', n: 10, p: 1, reward: 10, done: false }] };
  const b = { ...emptySave('u', S), mlevel: 5, missions: [{ type: 'rails', n: 4, p: 2, reward: 22, done: false }] };
  expect(merge(a, b).missions?.[0].type).toBe('rails');
});

test('rcUserId converges to the same value on both devices', () => {
  const a = emptySave('bbb', S), b = emptySave('aaa', S);
  expect(merge(a, b).rcUserId).toBe('aaa');
  expect(merge(b, a).rcUserId).toBe('aaa');
});

test('migrate handles garbage and legacy keys', () => {
  const ctx = { rcUserId: 'u', deviceId: 'd', starters: S };
  expect(migrate('nope', ctx).owned).toEqual(S);
  const m = migrate(null, { ...ctx, legacy: { 'paw.coins': 42, 'paw.best': 9, 'paw.owned': ['dog', 'cat', 'pig'] } });
  expect(balance(m)).toBe(42);
  expect(m.owned).toContain('pig');
  expect(m.best).toBe(9);
});
