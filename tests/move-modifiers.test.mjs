import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyModifiers, modifierFields, modifiersFromShowdown, modifierSummary, readModifiers, showdownModifierLines } from '../js/features/move-modifiers.ts';

const withEffects = (effects, extra = {}) => ({ ...emptyModifiers(), effects, ...extra });

test('a damaging move gets Showdown secondaries, drain and crit', () => {
    const f = modifierFields(withEffects([
        { kind: 'status', who: 'target', status: 'frz', chance: 30 },
        { kind: 'boost', who: 'self', stat: 'atk', stages: 1, chance: 100 }
    ], { drain: 50, crit: 'high' }), 'Physical');
    assert.deepEqual(f.secondaries, [{ chance: 30, status: 'frz' }, { chance: 100, self: { boosts: { atk: 1 } } }]);
    assert.deepEqual(f.drain, [1, 2]);
    assert.equal(f.critRatio, 2);
    assert.equal(f.status, undefined);
});

test('a status move does its effects outright', () => {
    const f = modifierFields(withEffects([
        { kind: 'status', who: 'target', status: 'tox', chance: 40 },
        { kind: 'boost', who: 'self', stat: 'spe', stages: 2, chance: 100 }
    ], { heal: 50 }), 'Status');
    assert.equal(f.status, 'tox');
    assert.deepEqual(f.self, { boosts: { spe: 2 } });
    assert.deepEqual(f.heal, [1, 2]);
    assert.equal(f.secondaries, undefined);
});

test('nothing set clears every field', () => {
    const f = modifierFields(emptyModifiers(), 'Physical');
    assert.ok(Object.values(f).every(v => v === undefined));
});

test('odd input from an import is cleaned', () => {
    const m = readModifiers({ modifiers: { effects: [{ kind: 'status', status: 'evil', chance: 50 }, { kind: 'boost', stat: 'atk', stages: 99, chance: 500 }], drain: 900, behavesLike: '../x', crit: 'huge' } });
    assert.deepEqual(m.effects, [{ kind: 'boost', who: 'target', stat: 'atk', stages: 6, chance: 100 }]);
    assert.equal(m.drain, 100);
    assert.equal(m.behavesLike, '');
    assert.equal(m.crit, 'normal');
});

test('a main-game move turns into modifiers and back', () => {
    const icebeam = { category: 'Special', secondary: { chance: 10, status: 'frz' } };
    const m = modifiersFromShowdown(icebeam);
    assert.deepEqual(m.effects, [{ kind: 'status', who: 'target', status: 'frz', chance: 10 }]);
    assert.deepEqual(modifierFields(m, 'Special').secondaries, [{ chance: 10, status: 'frz' }]);
    const uturn = modifiersFromShowdown({ selfSwitch: true });
    assert.equal(uturn.selfSwitch, true);
});

test('the summary reads like a move description', () => {
    const lines = modifierSummary(withEffects([{ kind: 'status', who: 'target', status: 'brn', chance: 20 }], { recoil: 33, behavesLike: 'pursuit' }), 'Physical', 'Pursuit');
    assert.deepEqual(lines, ['20% chance to burn the target.', 'The user takes 33% of the damage dealt as recoil.', 'Behaves like Pursuit.']);
});

test('the export skips a field the code already sets', () => {
    const move = { category: 'Physical', modifiers: withEffects([{ kind: 'volatile', who: 'target', volatile: 'flinch', chance: 30 }], { recoil: 25 }) };
    const all = showdownModifierLines(move).join('\n');
    assert.match(all, /secondaries: \[\{"chance":30,"volatileStatus":"flinch"\}\],/);
    assert.match(all, /recoil: \[1,4\],/);
    assert.doesNotMatch(showdownModifierLines(move, 'recoil: [1, 3]').join('\n'), /recoil/);
});
