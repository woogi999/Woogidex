// Network requests that survive a bad connection, built on Effect
// (https://effect.website). Each try gives up after a time limit, and a
// failed try is tried again after a short, growing wait. Only failures that a
// new try can fix are tried again: no connection, a time-out, a 5xx answer
// or 429 (too many requests). A 4xx answer is the server's real answer.

import { Data, Effect, Schedule, Semaphore } from 'effect';

/** An answer that a new try can fix. It carries the answer, to give back if every try fails. */
class RetryableStatus extends Data.TaggedError('RetryableStatus')<{ readonly response: Response }> {}
/** No answer at all: offline, DNS, CORS, or the time limit. */
class NoAnswer extends Data.TaggedError('NoAnswer')<{ readonly cause: unknown }> {}

export interface FetchPolicy {
    /** how long one try may wait for the answer's headers, in ms */
    timeoutMs?: number;
    /** how many more tries after the first */
    retries?: number;
    /** the first wait between tries, in ms (it doubles each time) */
    backoffMs?: number;
}

const retryable = (status: number) => status >= 500 || status === 429;

/**
 * The request as an Effect: the Response, or NoAnswer when no try got one.
 * A 5xx or 429 after the last try is still a Response, as fetch() gives it.
 */
export function fetchEffect(url: string, init: RequestInit = {}, { timeoutMs = 15000, retries = 2, backoffMs = 400 }: FetchPolicy = {}) {
    const once = Effect.tryPromise({
        // the signal aborts the request when the time limit wins
        try: signal => fetch(url, { ...init, signal }),
        catch: cause => new NoAnswer({ cause })
    }).pipe(
        Effect.flatMap(res => retryable(res.status) ? Effect.fail(new RetryableStatus({ response: res })) : Effect.succeed(res)),
        Effect.timeout(timeoutMs),
        Effect.catchTag('TimeoutError', cause => Effect.fail(new NoAnswer({ cause })))
    );
    return once.pipe(
        Effect.retry({ schedule: Schedule.exponential(backoffMs), times: retries }),
        Effect.catchTag('RetryableStatus', e => Effect.succeed(e.response))
    );
}

/** What a Supabase query or rpc() resolves to. */
export interface DbAnswer<T> { data: T | null; error: any; status?: number }

/** A Supabase error, with the HTTP status (0: no answer at all). */
class DbError extends Data.TaggedError('DbError')<{ readonly error: any; readonly status: number }> {}

/**
 * A Supabase call as an Effect: its data, or DbError. `run` gets a signal
 * for the call's .abortSignal(), so the time limit stops the request.
 * Only a call with no answer, a 5xx or 429 is tried again. A 4xx (a rule
 * said no, a bad argument) is the real answer.
 */
export function dbEffect<T>(run: (signal: AbortSignal) => PromiseLike<DbAnswer<T>>, { timeoutMs = 20000, retries = 2, backoffMs = 400 }: FetchPolicy = {}) {
    const once = Effect.tryPromise({
        try: signal => Promise.resolve(run(signal)),
        // supabase-js resolves with { error } rather than throwing; a throw is a bug or no answer
        catch: cause => new DbError({ error: cause, status: 0 })
    }).pipe(
        Effect.flatMap(({ data, error, status = 0 }) => error ? Effect.fail(new DbError({ error, status })) : Effect.succeed(data as T)),
        Effect.timeout(timeoutMs),
        Effect.catchTag('TimeoutError', cause => Effect.fail(new DbError({ error: cause, status: 0 })))
    );
    return once.pipe(Effect.retry({
        schedule: Schedule.exponential(backoffMs),
        times: retries,
        while: (e: DbError) => e.status === 0 || retryable(e.status)
    }));
}

/**
 * A Supabase call with a time limit and retries. Resolves with its data, and
 * rejects with Supabase's own error object, the one callers already check.
 */
export function dbCall<T>(run: (signal: AbortSignal) => PromiseLike<DbAnswer<T>>, policy: FetchPolicy = {}): Promise<T> {
    return Effect.runPromise(dbEffect(run, policy).pipe(Effect.catchTag('DbError', e => Effect.die(e.error))));
}

/**
 * At most `n` of these tasks run at the same time. The others wait their
 * turn in order. A task that fails frees its place too.
 */
export function limiter(n: number): <T>(task: () => Promise<T>) => Promise<T> {
    const slots = Semaphore.makeUnsafe(n);
    return task => Effect.runPromise(Effect.promise(task).pipe(Semaphore.withPermit(slots)));
}

/**
 * fetch() with a time limit and retries. It resolves the way fetch() does
 * (any Response, 5xx included) and rejects only when no try got an answer.
 */
export function fetchWithRetry(url: string, init: RequestInit = {}, policy: FetchPolicy = {}): Promise<Response> {
    return Effect.runPromise(fetchEffect(url, init, policy).pipe(
        // callers know fetch()'s TypeError, not Effect's error types
        Effect.catchTag('NoAnswer', e => Effect.die(e.cause instanceof Error ? e.cause : new TypeError('Network request failed')))
    ));
}
