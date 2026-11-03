// Run: node --test tests/*.test.mjs (Node 23.6 or later loads the .ts module without a build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, countPayload, isEmptyPayload, mergeLists, movableSetting, newSettings, payloadProblem, MOVE_MAX_ITEMS } from '../js/features/data-move-model.ts';

const FROM = 'https://dex.woogi.xyz';
const ID = 'move-1234567890';

test('settings: the sign-in and this site\'s own counters never move', () => {
    assert.equal(movableSetting('sb-dex-auth-token'), false);
    assert.equal(movableSetting('woogidex.sessionVisit.abc'), false);
    assert.equal(movableSetting('woogidex.collection.count.v1'), false);
    assert.equal(movableSetting('woogidex.move.id.v1'), false);
    assert.equal(movableSetting('fakemonDB_v4'), false);
    assert.equal(movableSetting('woogidex-dark-mode'), true);
    assert.equal(movableSetting('woogidex.device.v1'), true);
});

test('build: every list is there, settings are filtered', () => {
    const p = buildPayload(ID, FROM, { fakemonDB: [{ id: 1, name: 'A' }] }, { 'woogidex-dark-mode': 'true', 'sb-dex-auth-token': 'secret' });
    assert.deepEqual(countPayload(p).fakemonDB, 1);
    assert.deepEqual(p.lists.folders, []);
    assert.deepEqual(p.settings, { 'woogidex-dark-mode': 'true' });
    assert.equal(payloadProblem(p, FROM), '');
    assert.equal(isEmptyPayload(p), false);
    assert.equal(isEmptyPayload(buildPayload(ID, FROM, {}, {})), true);
});

test('validate: wrong sender, format, version, ids, shapes and size are refused', () => {
    const good = buildPayload(ID, FROM, { fakemonDB: [{ id: 'a' }] }, {});
    assert.match(payloadProblem(good, 'https://woogidex.com'), /old Woogidex address/);
    assert.match(payloadProblem({ ...good, format: 'x' }, FROM), /not a Woogidex move/);
    assert.match(payloadProblem({ ...good, version: 2 }, FROM), /another version/);
    assert.match(payloadProblem({ ...good, id: 'x' }, FROM), /move ID/);
    assert.match(payloadProblem({ ...good, lists: { ...good.lists, folders: 'no' } }, FROM), /"folders"/);
    assert.match(payloadProblem({ ...good, lists: { ...good.lists, fakemonDB: [{ name: 'no id' }] } }, FROM), /no ID/);
    assert.match(payloadProblem({ ...good, settings: { 'sb-x-auth-token': 'x' } }, FROM), /may not move/);
    const big = { ...good, lists: { ...good.lists, fakemonDB: Array.from({ length: MOVE_MAX_ITEMS + 1 }, (_, i) => ({ id: i })) } };
    assert.match(payloadProblem(big, FROM), /too large/);
    assert.match(payloadProblem(null, FROM), /not readable/);
});

test('merge into an empty collection: everything is added as it is', () => {
    const moved = buildPayload(ID, FROM, { fakemonDB: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], folders: [{ id: 'f' }] }, {}).lists;
    const r = mergeLists({}, moved, () => 'new');
    assert.deepEqual(r.lists.fakemonDB, moved.fakemonDB);
    assert.equal(r.added, 3);
    assert.equal(r.same + r.copied, 0);
});

test('merge: nothing here is lost or overwritten, a clash becomes a copy', () => {
    const here = { fakemonDB: [{ id: 1, name: 'A' }, { id: 2, name: 'B here' }, { id: 9, name: 'only here' }] };
    const moved = buildPayload(ID, FROM, { fakemonDB: [{ id: 1, name: 'A' }, { id: 2, name: 'B old' }, { id: 3, name: 'C' }] }, {}).lists;
    const r = mergeLists(here, moved, () => 'copy-id');
    assert.deepEqual(r.lists.fakemonDB.map(f => [f.id, f.name]), [[1, 'A'], [2, 'B here'], [9, 'only here'], ['copy-id', 'B old'], [3, 'C']]);
    assert.deepEqual([r.added, r.same, r.copied], [1, 1, 1]);
});

test('merge is safe to repeat: the second time adds nothing', () => {
    const moved = buildPayload(ID, FROM, { fakemonDB: [{ id: 1, name: 'A' }] }, {}).lists;
    const once = mergeLists({}, moved, () => 'x').lists;
    const twice = mergeLists(once, moved, () => 'x');
    assert.equal(twice.lists.fakemonDB.length, 1);
    assert.deepEqual([twice.added, twice.same, twice.copied], [0, 1, 0]);
});

test('settings: a setting already here is never replaced', () => {
    const here = { 'woogidex-dark-mode': 'false' };
    const out = newSettings({ 'woogidex-dark-mode': 'true', 'woogidex-tips-seen': '[]' }, k => here[k] ?? null);
    assert.deepEqual(out, { 'woogidex-tips-seen': '[]' });
});
