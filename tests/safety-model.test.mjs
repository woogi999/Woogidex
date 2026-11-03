// Run: node --test tests/*.test.mjs (Node 23.6 or later loads the .ts module without a build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appealState, isNetworkBlock, parseHiddenWords, reportTargetLabel, screenNotice, REPORT_REASONS } from '../js/features/safety-model.ts';

test('report reasons match the server list', () => {
    assert.deepEqual(REPORT_REASONS.map(r => r.key),
        ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'art_theft', 'other']);
    assert.equal(reportTargetLabel('mon'), 'Fakémon');
});

test('hidden words: trims, lower case, no repeats, length limits', () => {
    assert.deepEqual(parseHiddenWords(' Potato,\nPOTATO , a, rare  codes\n'), ['potato', 'rare codes']);
    assert.deepEqual(parseHiddenWords('x'.repeat(61)), []);
    assert.equal(parseHiddenWords(Array.from({ length: 300 }, (_, i) => `word${i}`).join(',')).length, 200);
});

test('appeal state', () => {
    assert.equal(appealState({ can_appeal: true }), 'can');
    assert.equal(appealState({ can_appeal: false }), 'none');
    assert.equal(appealState({ appeal: { status: 'open' } }), 'open');
    assert.equal(appealState({ appeal: { status: 'upheld' } }), 'upheld');
    assert.equal(appealState({ reversed: true, can_appeal: true }), 'reversed');
});

test('VPN errors are recognised by hint or message', () => {
    assert.ok(isNetworkBlock({ hint: 'woogi_vpn' }));
    assert.ok(isNetworkBlock({ message: 'You seem to be on a VPN or proxy. Turn it off to post.' }));
    assert.ok(!isNetworkBlock({ message: 'You are muted' }));
    assert.ok(!isNetworkBlock(null));
});

test('screen notices by action', () => {
    assert.equal(screenNotice({ matches: [] }), null);
    assert.equal(screenNotice({ action: 'hide', matches: ['x'] })?.tone, 'info');
    assert.equal(screenNotice({ action: 'warn', matches: ['x'] })?.tone, 'warning');
    assert.equal(screenNotice({ action: 'block', severity: 'severe', matches: ['x'] }), null);
});
