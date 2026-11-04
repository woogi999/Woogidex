// Run: node --test tests/*.test.mjs (Node 23.6 or later loads the .ts module without a build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdateFile } from '../js/features/updates.ts';

test('an old file with only bullets keeps working', () => {
    const u = parseUpdateFile('---\nversion: v1.0.0\ntitle: Old\n---\n\n- One thing.\n- Two\n  wrapped.\n', 'old.md');
    assert.equal(u.version, 'v1.0.0');
    assert.deepEqual(u.items, ['One thing.', 'Two wrapped.']);
    assert.deepEqual(u.sections, [{ title: '', items: ['One thing.', 'Two wrapped.'] }]);
    assert.deepEqual(u.intro, []);
});

test('an intro, then sections under their headings', () => {
    const u = parseUpdateFile('---\nversion: v2.0.0\n---\n\nHey, it is me.\nSecond line.\n\nNew paragraph.\n\n## New\n- A\n- B\n\n## Fixes\n- C\n\n## Empty\n');
    assert.deepEqual(u.intro, ['Hey, it is me. Second line.', 'New paragraph.']);
    assert.deepEqual(u.sections, [{ title: 'New', items: ['A', 'B'] }, { title: 'Fixes', items: ['C'] }]);
    assert.deepEqual(u.items, ['A', 'B', 'C']);
});
