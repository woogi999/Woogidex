// Run: node --test tests/*.test.mjs (Node 23.6 or later loads the .ts module without a build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../js/core/net.ts';

const fast = { backoffMs: 1, timeoutMs: 200 };

// fetch() answers from a list, one entry for each try: a status, 'throw' or 'hang'
function fakeFetch(plan) {
    const calls = [];
    globalThis.fetch = (url, init = {}) => {
        const step = plan[calls.length] ?? plan[plan.length - 1];
        calls.push(url);
        if (step === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
        if (step === 'hang') return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
        return Promise.resolve(new Response(String(step), { status: step }));
    };
    return calls;
}

test('a good answer comes back after one try', async () => {
    const calls = fakeFetch([200]);
    const res = await fetchWithRetry('https://x.test/a', {}, fast);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
});

test('no connection, then an answer: tries again', async () => {
    const calls = fakeFetch(['throw', 'throw', 200]);
    assert.equal((await fetchWithRetry('https://x.test/a', {}, fast)).status, 200);
    assert.equal(calls.length, 3);
});

test('a 5xx is tried again, and the last 5xx comes back as a Response', async () => {
    const calls = fakeFetch([503]);
    assert.equal((await fetchWithRetry('https://x.test/a', {}, fast)).status, 503);
    assert.equal(calls.length, 3);
});

test('a 404 is the real answer: no new try', async () => {
    const calls = fakeFetch([404, 200]);
    assert.equal((await fetchWithRetry('https://x.test/a', {}, fast)).status, 404);
    assert.equal(calls.length, 1);
});

test('no answer on any try rejects with a TypeError, like fetch()', async () => {
    fakeFetch(['throw']);
    await assert.rejects(fetchWithRetry('https://x.test/a', {}, fast), TypeError);
});

test('a try that hangs is stopped at the time limit and tried again', async () => {
    const calls = fakeFetch(['hang', 200]);
    assert.equal((await fetchWithRetry('https://x.test/a', {}, { ...fast, timeoutMs: 30 })).status, 200);
    assert.equal(calls.length, 2);
});

// ---- dbCall: Supabase answers { data, error, status } ----
import { dbCall } from '../js/core/net.ts';

function fakeDb(plan) {
    let n = 0;
    const run = () => {
        const step = plan[n] ?? plan[plan.length - 1];
        n++;
        return Promise.resolve(step);
    };
    return { run, tries: () => n };
}

test('dbCall: data comes back', async () => {
    const db = fakeDb([{ data: [1, 2], error: null, status: 200 }]);
    assert.deepEqual(await dbCall(db.run, fast), [1, 2]);
    assert.equal(db.tries(), 1);
});

test('dbCall: no answer (status 0), then data: tries again', async () => {
    const db = fakeDb([{ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 }, { data: 'ok', error: null, status: 200 }]);
    assert.equal(await dbCall(db.run, fast), 'ok');
    assert.equal(db.tries(), 2);
});

test('dbCall: a rule says no (403): no new try, rejects with the Supabase error', async () => {
    const err = { message: 'permission denied', code: '42501' };
    const db = fakeDb([{ data: null, error: err, status: 403 }]);
    await assert.rejects(dbCall(db.run, fast), e => e === err);
    assert.equal(db.tries(), 1);
});

test('dbCall: a 503 on every try rejects with the last error after 3 tries', async () => {
    const db = fakeDb([{ data: null, error: { message: 'busy' }, status: 503 }]);
    await assert.rejects(dbCall(db.run, fast), e => e.message === 'busy');
    assert.equal(db.tries(), 3);
});

// ---- limiter ----
import { limiter } from '../js/core/net.ts';

test('limiter: never more than n at the same time, and every task finishes', async () => {
    const limit = limiter(2);
    let running = 0, most = 0;
    const task = i => () => new Promise(resolve => { running++; most = Math.max(most, running); setTimeout(() => { running--; resolve(i); }, 5); });
    const out = await Promise.all([0, 1, 2, 3, 4].map(i => limit(task(i))));
    assert.deepEqual(out, [0, 1, 2, 3, 4]);
    assert.equal(most, 2);
});

test('limiter: a task that fails rejects, and frees its place', async () => {
    const limit = limiter(1);
    await assert.rejects(limit(() => Promise.reject(new Error('no'))), /no/);
    assert.equal(await limit(() => Promise.resolve('next')), 'next');
});
