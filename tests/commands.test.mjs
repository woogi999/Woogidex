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
    assert.match(runCommand(dex, cmd('calc'), 'garchomp earthquake').error, /use \/calc <attacker>/);
    assert.equal(r.calc.rolls.length, 2);
    assert.match(r.calc.rolls[0].ko, /HKO|hits to KO/);
    assert.deepEqual(r.calc.move, { name: 'Earthquake', type: 'Ground', category: 'Physical', basePower: 100 });
});

test('/calc: plain math, like Showdown', () => {
    const math = s => runCommand(dex, cmd('calc'), s);
    assert.equal(math('2 + 2').math.value, '4');
    assert.equal(math('2 + 3 * 4').math.value, '14');
    assert.equal(math('(2 + 3) * 4').math.value, '20');
    assert.equal(math('2 ^ 3 ^ 2').math.value, '512');
    assert.equal(math('-2 ^ 2').math.value, '-4');
    assert.equal(math('10 % 4').math.value, '2');
    assert.equal(math('1 / 3').math.value, '0.333333333333');
    assert.equal(math('0x1f + 0b1').math.value, '32');
    assert.equal(math('255 in hex').math.value, '0xff');
    assert.equal(math('5 in binary').math.value, '0b101');
    assert.equal(math('2 * pi').math.value, String(Number((2 * Math.PI).toPrecision(12))));
    assert.equal(parseCommand('/calculate 1+1').cmd.name, 'calc');
    assert.match(math('1 / 0').error, /too big|divided by zero/);
    assert.match(math('(1 + 2').error, /bracket/);
    assert.match(math('2 +').error, /ends too early/);
    assert.match(math('alert(1)').error, /not a number/);
});

test('rows and matchups carry types for the palette', () => {
    const w = runCommand(dex, cmd('weakness'), 'ground/flying');
    assert.ok(w.typeGroups.some(g => g.label === 'Weak ×4' && g.types.includes('Ice')));
    const ms = runCommand(dex, cmd('dt'), 'surf').rows[0];
    assert.deepEqual([ms.types, ms.category], [['Water'], 'Special']);
    assert.deepEqual(runCommand(dex, cmd('dt'), 'garchomp').rows[0].types, ['Dragon', 'Ground']);
});

// the top of a "lo-hi of HP" range
const maxOf = line => Number(line.match(/\((\d+)-(\d+) of/)[2]);

test('/calc: EVs, items and abilities, written like Showdown', () => {
    const plain = runCommand(dex, cmd('calc'), '252+ Atk garchomp earthquake vs 252 HP / 252+ Def toxapex');
    assert.equal(plain.lines.length, 3, 'named EVs on the defender: one spread, not two');
    assert.match(plain.lines[1], /^252 HP \/ 252\+ Def: /);
    const band = runCommand(dex, cmd('calc'), '252+ Atk Choice Band garchomp earthquake vs 252 HP / 252+ Def toxapex');
    assert.match(band.head, /^252\+ Atk Choice Band Garchomp Earthquake vs Toxapex$/);
    assert.ok(maxOf(band.lines[1]) > maxOf(plain.lines[1]) * 1.4, 'Choice Band is about ×1.5');
    const scale = runCommand(dex, cmd('calc'), '252+ Atk garchomp earthquake vs 252 HP / 252+ Def multiscale toxapex');
    assert.ok(Math.abs(maxOf(scale.lines[1]) - maxOf(plain.lines[1]) / 2) <= 1, 'Multiscale halves it');
    const weak = runCommand(dex, cmd('calc'), '0- Atk garchomp earthquake vs 252 HP / 252+ Def toxapex');
    assert.ok(maxOf(weak.lines[1]) < maxOf(plain.lines[1]));
    assert.match(runCommand(dex, cmd('calc'), 'garchomp earthquake vs levitate toxapex').lines[0], /Toxapex's Levitate/);
    // an item for the other side, or one /calc does not know, is not a Pokémon name
    assert.match(runCommand(dex, cmd('calc'), 'garchomp earthquake vs choice band toxapex').error, /defender/);
});
