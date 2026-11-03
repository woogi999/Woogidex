// Run: node --test tests/*.test.mjs (Node 23.6 or later loads the .ts module without a build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, parseCommand, suggest, runCommand, statAt, effectiveness, damageRange } from '../js/features/commands-model.ts';

const cmd = name => COMMANDS.find(c => c.name === name);
const types = ['Normal', 'Fire', 'Water', 'Grass', 'Ground', 'Flying', 'Poison', 'Dragon', 'Electric', 'Ice'];
const chart = {
    Ground: { Fire: 2, Electric: 2, Poison: 2, Grass: 0.5, Flying: 0 },
    Water: { Fire: 2, Ground: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
    Ice: { Grass: 2, Ground: 2, Flying: 2, Dragon: 2, Fire: 0.5, Water: 0.5, Ice: 0.5 },
    Fire: { Grass: 2, Ice: 2, Fire: 0.5, Water: 0.5, Dragon: 0.5 },
    Electric: { Water: 2, Flying: 2, Ground: 0, Grass: 0.5, Electric: 0.5, Dragon: 0.5 },
    Grass: { Water: 2, Ground: 2, Fire: 0.5, Grass: 0.5, Poison: 0.5, Flying: 0.5, Dragon: 0.5 }
};
const mon = (id, name, t, s, abilities = [], learns = []) => ({ id, name, types: t, stats: { hp: s[0], atk: s[1], def: s[2], spa: s[3], spd: s[4], spe: s[5] }, abilities, learns: new Set(learns) });
const dex = {
    mons: [
        mon('garchomp', 'Garchomp', ['Dragon', 'Ground'], [108, 130, 95, 80, 85, 102], ['Sand Veil', 'Rough Skin'], ['earthquake']),
        mon('toxapex', 'Toxapex', ['Poison', 'Water'], [50, 63, 152, 53, 142, 35], ['Merciless', 'Regenerator']),
        mon('pelipper', 'Pelipper', ['Water', 'Flying'], [60, 50, 100, 95, 70, 65], ['Drizzle']),
        { ...mon('fizzle', 'Fizzle', ['Fire'], [70, 70, 70, 120, 70, 110], ['Blaze']), own: true }
    ],
    moves: [
        { id: 'earthquake', name: 'Earthquake', type: 'Ground', category: 'Physical', basePower: 100, accuracy: 100 },
        { id: 'surf', name: 'Surf', type: 'Water', category: 'Special', basePower: 90, accuracy: 100 },
        { id: 'recover', name: 'Recover', type: 'Normal', category: 'Status', basePower: 0, accuracy: true }
    ],
    abilities: [{ id: 'regenerator', name: 'Regenerator' }, { id: 'drizzle', name: 'Drizzle' }],
    items: [{ id: 'leftovers', name: 'Leftovers', desc: 'Heals a little each turn.' }],
    types, chart, learnsetsLoaded: true,
    searchMoves: q => (q.includes('ground') ? [dex.moves[0]] : [])
};

test('parse: commands, aliases, unknown ones, and plain text', () => {
    assert.equal(parseCommand('/ms fire').cmd.name, 'ms');
    assert.equal(parseCommand('/dexsearch water').cmd.name, 'ds');
    assert.equal(parseCommand('/ds  water, spe > 100 ').args, 'water, spe > 100');
    assert.deepEqual(parseCommand('/nope x'), { unknown: 'nope' });
    assert.equal(parseCommand('garchomp'), null);
    assert.deepEqual(suggest('/w').map(c => c.name), ['weakness']);
    assert.equal(suggest('/').length, COMMANDS.length);
});

test('stats match the games at level 100', () => {
    assert.equal(statAt(108, 0, 1, true), 357);         // Garchomp HP, no EVs
    assert.equal(statAt(108, 252, 1, true), 420);       // 252 HP
    assert.equal(statAt(130, 252, 1.1), 394);           // 252+ Atk Garchomp
    assert.equal(statAt(1, 252, 1, true), 1);           // Shedinja-style 1 HP
});

test('effectiveness multiplies over both types', () => {
    assert.equal(effectiveness(dex, 'Ice', ['Dragon', 'Ground']), 4);
    assert.equal(effectiveness(dex, 'Electric', ['Water', 'Flying']), 4);
    assert.equal(effectiveness(dex, 'Ground', ['Water', 'Flying']), 0);
});

test('damage range: the base formula with the 85 to 100 roll', () => {
    const [lo, hi] = damageRange(100, 394, 236, 1.5);
    assert.ok(lo < hi && lo === Math.floor(Math.floor((Math.floor(Math.floor(42 * 100 * 394 / 236) / 50) + 2) * 0.85) * 1.5));
});

test('/ds: types, stats, abilities, moves, not, and your Fakémon', () => {
    const names = q => runCommand(dex, cmd('ds'), q).rows.map(r => r.title);
    assert.deepEqual(names('water'), ['Toxapex', 'Pelipper']);
    assert.deepEqual(names('water, spe > 50'), ['Pelipper']);
    assert.deepEqual(names('regenerator'), ['Toxapex']);
    assert.deepEqual(names('earthquake'), ['Garchomp']);
    assert.deepEqual(names('!water, !dragon'), ['Fizzle (yours)']);
    assert.match(runCommand(dex, cmd('ds'), 'banana').error, /not a type/);
});

test('/weakness and /coverage', () => {
    const w = runCommand(dex, cmd('weakness'), 'garchomp');
    assert.equal(w.head, 'Garchomp (Dragon/Ground)');
    assert.ok(w.lines.includes('Weak ×4: Ice'));
    assert.ok(w.lines.some(l => l.startsWith('Immune') && l.includes('Electric')));
    const c = runCommand(dex, cmd('coverage'), 'ground, ice');
    assert.match(c.lines[0], /Super effective on \d+: .*Fire.*Grass/);
    assert.match(runCommand(dex, cmd('weakness'), 'notatype').error, /Name a Pokémon/);
});

test('/learn, /dt, /randpoke, /bulk', () => {
    assert.deepEqual(runCommand(dex, cmd('learn'), 'garchomp, earthquake, surf').lines, ['Earthquake: yes', 'Surf: no']);
    assert.equal(runCommand(dex, cmd('dt'), 'leftovers').lines[0], 'Heals a little each turn.');
    assert.equal(runCommand(dex, cmd('dt'), 'surf').rows[0].kind, 'move');
    assert.match(runCommand(dex, cmd('dt'), 'grass').lines[0], /Super effective on: Water, Ground/);
    const r = runCommand(dex, cmd('randpoke'), '2', () => 0.5);
    assert.equal(r.rows.length, 2);
    assert.ok(r.rows.every(x => !x.title.includes('yours')));
    assert.match(runCommand(dex, cmd('bulk'), 'toxapex').lines[0], /physical 81,940 \(241 × 340\)/);
});

test('/calc: STAB, immunity, status moves, and bad input', () => {
    const r = runCommand(dex, cmd('calc'), 'garchomp earthquake vs toxapex');
    assert.match(r.lines[0], /×2, STAB ×1.5/);
    assert.match(r.lines[1], /% to .*% \(\d+-\d+ of \d+ HP\)/);
    assert.match(runCommand(dex, cmd('calc'), 'garchomp earthquake vs pelipper').lines[0], /immune/);
    assert.match(runCommand(dex, cmd('calc'), 'toxapex recover vs garchomp').error, /no direct damage/);
    assert.match(runCommand(dex, cmd('calc'), 'garchomp earthquake').error, /Use \/calc/);
});
