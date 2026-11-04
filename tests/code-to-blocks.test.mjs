import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveDataFields, moveDataLines, parseStatements, readFunction, renameIdentifiers, sameCode, splitAnd, translateEntry } from '../js/editor/code-to-blocks.ts';

// A small stand-in for the real compilers in ability-blocks.ts.
const targetVar = (c, p) => (p.target === 'foe' ? c.foeVar : c.selfVar);
const compiler = {
    action(name, c, p) {
        if (name === 'boostStat') return [`this.boost({ ${p.stat}: ${p.stages} }, ${targetVar(c, p)});`];
        if (name === 'healFraction') return [`this.heal(${targetVar(c, p)}.baseMaxhp / ${p.den}, ${targetVar(c, p)});`];
        if (name === 'chainModify') return [`return this.chainModify(${p.den === 1 ? p.num : `[${p.num}, ${p.den}]`});`];
        if (name === 'stopEffect') return [p.answer === 'nothing' ? 'return;' : `return ${p.answer};`];
        if (name === 'absorbMove') return ['return null;'];
        return [];
    },
    condition(name, c, p) {
        if (name === 'moveTypeIs') return `${c.moveVar}.type === '${p.type}'`;
        if (name === 'targetsAnother') return p.left === 'self' ? `${c.selfVar} !== ${c.foeVar}` : `${c.foeVar} !== ${c.selfVar}`;
        return '';
    },
    trigger(key, params) {
        const table = {
            residual: { header: 'onResidual(pokemon) {', selfVar: 'pokemon', foeVar: 'foe', moveVar: null, preamble: 'const foe = pokemon.side.foe.active[0];' },
            moveIncoming: { header: 'onTryHit(target, source, move) {', selfVar: 'target', foeVar: 'source', moveVar: 'move' },
            movePower: { header: 'onBasePower(basePower, pokemon, target, move) {', selfVar: 'pokemon', foeVar: 'target', moveVar: 'move' },
            moveData: { header: '', selfVar: 'source', foeVar: 'target', moveVar: 'move' },
            sdHook: { header: `${params.hook}(${params.args}) {`, selfVar: 'pokemon', foeVar: 'target', moveVar: 'move' }
        };
        return table[key] || null;
    },
    conditionValue: (kind, id) => ({ brn: 'brn', par: 'par' }[id] ?? null),
    isVolatile: id => id === 'flinch',
    isFlag: id => id === 'contact'
};

test('it reads a function shape and refuses others', () => {
    assert.deepEqual(readFunction('onHit(target, source) { return 1; }'), { args: ['target', 'source'], body: ' return 1; ' });
    assert.equal(readFunction('onHit({ a }) { return 1; }'), null);
    assert.equal(readFunction('onHit(a) => 1'), null);
});

test('it cuts a body into statements and keeps if and else', () => {
    const list = parseStatements('const a = "}"; if (a) { b(); } else c(); for (const x of y) { z(x); } return a;');
    assert.deepEqual(list.map(s => s.kind), ['code', 'if', 'code', 'code']);
    assert.equal(list[1].else[0].text, 'c()');
    assert.equal(list[2].text, 'for (const x of y) { z(x); }');
});

test('it refuses a body it cannot balance', () => {
    assert.throws(() => parseStatements('if (a { b(); }'));
});

test('a mixed test stays in one piece', () => {
    assert.deepEqual(splitAnd('a && b.c(d && e)'), ['a', 'b.c(d && e)']);
    assert.deepEqual(splitAnd('a && b || c'), ['a && b || c']);
});

test('a rename skips strings and property names', () => {
    assert.equal(renameIdentifiers('p.hp + q.p + "p"', { p: 'pokemon' }), 'pokemon.hp + q.p + "p"');
});

test('code that differs only in spacing and quotes is the same', () => {
    assert.ok(sameCode("this.boost({ atk: 1 }, pokemon);", 'this.boost({atk: 1}, pokemon)'));
    assert.ok(!sameCode('this.boost({ atk: 1 })', 'this.boost({ atk: 2 })'));
});

test('a hook becomes a named event, and its blocks use the event names', () => {
    const t = translateEntry({ onResidual(holder) { this.heal(holder.baseMaxhp / 16); } }, 'item', compiler);
    const [event] = t.blocks.triggers;
    assert.equal(event.trigger, 'residual');
    assert.deepEqual(event.body[0].params, { num: 1, den: 16, target: 'self' });
    assert.deepEqual(t.stats, { blocks: 1, code: 0 });
});

test('an unknown statement stays as code, in its place', () => {
    const t = translateEntry({ onResidual(pokemon) { this.heal(pokemon.baseMaxhp / 16); strangeThing(pokemon); } }, 'item', compiler);
    const body = t.blocks.triggers[0].body;
    assert.deepEqual(body.map(b => b.action), ['healFraction', 'showdownCode']);
    assert.match(body[1].params.code, /strangeThing\(pokemon\);/);
});

test('a block that would compile to other code is not used', () => {
    // the stand-in writes a target, so a move hook with no target must stay as code
    const t = translateEntry({ onHit(target) { this.heal(target.baseMaxhp / 2); } }, 'move', compiler);
    assert.equal(t.blocks.triggers[0].trigger, 'sdHook');
    assert.equal(t.blocks.triggers[0].body[0].action, 'showdownCode');
});

test('Flash Fire reads as blocks with its if', () => {
    const t = translateEntry({
        onTryHit(target, source, move) {
            if (target !== source && move.type === 'Fire') {
                move.accuracy = true;
                return null;
            }
        }
    }, 'ability', compiler);
    const first = t.blocks.triggers[0].body[0];
    assert.equal(first.condition, 'targetsAnother');
    assert.equal(first.then[0].condition, 'moveTypeIs');
    assert.equal(first.then[0].then.at(-1).action, 'absorbMove');
});

test('a hook with an unusual name keeps its own signature', () => {
    const t = translateEntry({ onDeductPP(target, source) { return 1; } }, 'ability', compiler);
    assert.deepEqual(t.blocks.triggers[0].triggerParams, { hook: 'onDeductPP', args: 'target, source' });
});

test('move data becomes Move effect blocks and back', () => {
    const entry = {
        name: 'Test', basePower: 90, accuracy: 100,
        secondary: { chance: 10, status: 'brn' }, drain: [1, 2], self: { boosts: { spa: -2 } }, boosts: { atk: 2 },
        multihit: 3, multiaccuracy: true, target: 'normal', selfdestruct: 'always'
    };
    const t = translateEntry(entry, 'move', compiler);
    assert.equal(t.blocks.triggers[0].trigger, 'moveData');
    assert.deepEqual(t.moveFields, { multihit: 3, multiaccuracy: true, target: 'normal' });
    assert.deepEqual(moveDataFields(t.blocks), {
        secondary: { chance: 10, status: 'brn' }, drain: [1, 2], self: { boosts: { spa: -2 } }, boosts: { atk: 2 }, selfdestruct: 'always'
    });
    assert.ok(moveDataLines(t.blocks).every(line => /,$/.test(line)));
});

test('Triple Axel power becomes the move setting, not a block', () => {
    const t = translateEntry({ basePower: 20, multihit: 3, multiaccuracy: true, basePowerCallback(pokemon, target, move) { return 20 * move.hit; } }, 'move', compiler);
    assert.equal(t.moveFields.multihitStyle, 'rising');
    assert.equal(t.blocks.triggers.length, 0);
});

test('a different power rule stays a hook', () => {
    const t = translateEntry({ basePower: 20, multihit: 3, basePowerCallback(pokemon, target, move) { return 25 * move.hit; } }, 'move', compiler);
    assert.equal(t.moveFields.multihitStyle, undefined);
    assert.equal(t.blocks.triggers[0].trigger, 'sdHook');
});

test('two chances become a list', () => {
    const blocks = translateEntry({ secondaries: [{ chance: 10, status: 'brn' }, { chance: 10, volatileStatus: 'flinch' }] }, 'move', compiler).blocks;
    assert.equal(moveDataFields(blocks).secondaries.length, 2);
});

test('what no block holds goes to the code tab', () => {
    const t = translateEntry({ onBasePowerPriority: 21, condition: { duration: 2, onStart() { return 1; } } }, 'move', compiler);
    assert.match(t.rawCode, /onBasePowerPriority: 21|duration: 2/);
    assert.match(t.rawCode, /onStart\(\)/);
});

test('a bad field name in move data is left out', () => {
    const blocks = { triggers: [{ trigger: 'moveData', body: [{ action: 'moveDataRaw', params: { field: 'a}; evil(); ({b', value: '1' } }] }] };
    assert.deepEqual(moveDataFields(blocks), {});
});
