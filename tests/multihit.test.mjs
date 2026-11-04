import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMultihit, multihitFields, multihitSummary, multihitText, parseMultihitText, showdownMultihitLines, multihitPowerFactor } from '../js/features/multihit.ts';

test('a move with no setting reads as off', () => {
    assert.equal(readMultihit({}).on, false);
    assert.equal(readMultihit({ multihit: 1 }).on, false);
});

test('an old move with only the flag reads as 2 to 5', () => {
    const s = readMultihit({ flags: { multihit: 1 } });
    assert.deepEqual([s.on, s.min, s.max], [true, 2, 5]);
});

test('the fields round trip through a move', () => {
    const fixed = multihitFields({ on: true, min: 3, max: 3, style: 'rising', everyHit: true }, 'Physical');
    assert.deepEqual(fixed, { multihit: 3, multihitStyle: 'rising', multiaccuracy: true });
    assert.deepEqual(readMultihit(fixed), { on: true, min: 3, max: 3, style: 'rising', everyHit: true });
    const range = multihitFields({ on: true, min: 2, max: 5, style: 'same', everyHit: false }, 'Special');
    assert.deepEqual(range.multihit, [2, 5]);
});

test('a status move and an off setting clear the fields', () => {
    const cleared = { multihit: undefined, multihitStyle: undefined, multiaccuracy: undefined };
    assert.deepEqual(multihitFields({ on: true, min: 2, max: 5 }, 'Status'), cleared);
    assert.deepEqual(multihitFields({ on: false }, 'Physical'), cleared);
});

test('hit counts stay inside the limits, and max is never below min', () => {
    assert.deepEqual(multihitFields({ on: true, min: 99, max: 2 }, 'Physical').multihit, 10);
    assert.deepEqual(multihitFields({ on: true, min: 0, max: 3 }, 'Physical').multihit, [2, 3]);
});

test('the text line survives an export and import', () => {
    const move = multihitFields({ on: true, min: 3, max: 3, style: 'rising', everyHit: true }, 'Physical');
    const text = `20 BP | 90% ACC | 10 PP${multihitText(move)}`;
    assert.deepEqual(parseMultihitText(text), move);
    assert.deepEqual(parseMultihitText('20 BP | 90% ACC | 10 PP'), {});
});

test('Showdown gets Triple Axel fields', () => {
    const move = { category: 'Physical', basePower: 20, multihit: 3, multihitStyle: 'rising', multiaccuracy: true };
    const out = showdownMultihitLines(move).join('\n');
    assert.match(out, /multihit: 3,/);
    assert.match(out, /multiaccuracy: true,/);
    assert.match(out, /return 20 \* move\.hit;/);
});

test('hand-written code wins over a generated field', () => {
    const move = { category: 'Physical', basePower: 20, multihit: 3, multihitStyle: 'rising' };
    const out = showdownMultihitLines(move, 'basePowerCallback() { return 5; }, multihit: 4').join('\n');
    assert.equal(out, '');
});

test('the summary names the power of each hit', () => {
    const s = readMultihit({ multihit: 3, multihitStyle: 'rising', multiaccuracy: true });
    assert.equal(multihitSummary(s, 20), 'Hits 3 times. Power by hit: 20, 40, 60. It stops at the first miss.');
    const usual = readMultihit({ multihit: [2, 5] });
    assert.match(multihitSummary(usual, 25), /Hits 2 to 5 times\. 2 or 3 hits are the most likely\. Each hit has 25 power\./);
});

test('a damage estimate uses the mainline average', () => {
    assert.equal(multihitPowerFactor({ multihit: [2, 5] }), 3.1);
    assert.equal(multihitPowerFactor({ multihit: 3, multihitStyle: 'rising' }), 6);
    assert.equal(multihitPowerFactor({}), 1);
});
