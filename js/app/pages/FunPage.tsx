// /fun: the Fun tab, where the playful parts of the site live together.
//   /fun                 a bento grid of tools and widgets
//   /fun/streak          the daily login streak and today's Woobux
//   /fun/shop            the Woobux shop (not open yet)
//   /fun/tier-maker      the tier maker's saved lists (the editor: /fun/tier-maker/edit)
//   /fun/battle          the battle simulator (paused)
// A click on a block turns the grid into a sidebar: the blocks move into the
// sidebar's rows (GSAP Flip, matched by data-flip-id) and the tool opens
// beside it. "All of Fun" turns it back. The Fun tab in the header pings
// while today's reward waits (funPing in js/features/woobux.ts), and so do
// the Streak block and row. Collecting plays the coin burst
// (js/app/components/coinBurst.ts). CSS: css/fun.css.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { api } from '../../core/app.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { useStore } from '../store.ts';
import { useRoute } from '../hooks.ts';
import { countUp, reducedMotion } from '../../core/motion.ts';
import { coinBurst } from '../components/coinBurst.ts';
import { Calendar, CouponIcon, SavePassIcon, WoobuxIcon } from '../dialogs/woobux.tsx';
import { openTierMaker } from '../dialogs/tierMaker.tsx';
import { deleteTierList, newTierList, savedTierLists } from '../../features/tier-lists.ts';
import { CYCLE, claimDaily, cycleDay, dayReward, funPing, refreshWoobux, woobux, woobuxOn, type WoobuxState } from '../../features/woobux.ts';

gsap.registerPlugin(Flip);

export type FunTool = 'streak' | 'shop' | 'tier-maker' | 'battle';
const TOOLS: Array<[FunTool, string, string]> = [
    ['streak', 'Streak', 'fire'],
    ['shop', 'Shop', 'shopping-bag'],
    ['tier-maker', 'Tier maker', 'trophy'],
    ['battle', 'Battle', 'swords']
];
const KEYS = TOOLS.map(([k]) => k);

/** The open tool the address names (/fun/<tool>), or null for the grid. */
export function funToolFrom(param: string): FunTool | null {
    const t = String(param || '').split('/')[0] as FunTool;
    return KEYS.includes(t) ? t : null;
}

export function FunPage() {
    useStore();
    const route = useRoute();
    const tool = route.name === 'fun' ? funToolFrom(route.param) : null;
    const open = tool !== null;
    const root = useRef<HTMLDivElement>(null);
    const before = useRef<Flip.FlipState | null>(null);
    const wasOpen = useRef(open);

    // the blocks' places just before a click changes the layout
    const capture = () => {
        if (root.current) before.current = Flip.getState(root.current.querySelectorAll('[data-flip-id]'));
    };
    // ...and the move from there to their new places (grid <-> sidebar)
    useLayoutEffect(() => {
        const state = before.current;
        before.current = null;
        const changed = wasOpen.current !== open;
        wasOpen.current = open;
        if (!changed || !state || !root.current || reducedMotion()) return;
        const tl = Flip.from(state, {
            targets: root.current.querySelectorAll('[data-flip-id]'),
            duration: 0.55, ease: 'power3.inOut', absolute: true, nested: true,
            onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.35, delay: 0.2 })
        });
        return () => { tl.progress(1).kill(); };
    }, [open]);

    useEffect(() => { if (woobuxOn() && !woobux()) refreshWoobux(); }, []);

    return (
        <div className={`fun-page${open ? ' is-open' : ' is-home'}`} ref={root} onClickCapture={capture}>
            <header className="page-header fun-head">
                <div className="page-heading">
                    <h1 className="page-title">Fun</h1>
                    <p className="fun-sub">Your daily Woobux, the shop, the tier maker and battles.</p>
                </div>
                <BalanceChip />
            </header>
            {open ? (
                <div className="fun-split">
                    <nav className="fun-side" aria-label="Fun">
                        <Link to="fun" className="fun-side-home"><Icon name="squares-2x2" size={16} /><span>All of Fun</span></Link>
                        {TOOLS.map(([key, label, icon]) => (
                            <Link key={key} to={`fun/${key}`} data-flip-id={key} className={`fun-block fun-side-item${tool === key ? ' is-active' : ''}`}
                                aria-current={tool === key ? 'page' : undefined}>
                                <span className={`fun-block-icon is-${key}`}><Icon name={icon} size={18} /></span>
                                <span className="fun-side-text"><strong>{label}</strong><small>{sideNote(key)}</small></span>
                                {key === 'streak' && funPing() && <span className="fun-ping" aria-label="Today’s reward is waiting" />}
                            </Link>
                        ))}
                    </nav>
                    <section className="fun-tool" key={tool} aria-label={TOOLS.find(t => t[0] === tool)?.[1]}>
                        {tool === 'streak' && <StreakPanel />}
                        {tool === 'shop' && <ShopPanel />}
                        {tool === 'tier-maker' && <TierPanel />}
                        {tool === 'battle' && <BattlePanel />}
                    </section>
                </div>
            ) : <Bento />}
        </div>
    );
}

/** The short line under each sidebar row. */
function sideNote(key: FunTool): string {
    const w = woobux();
    if (key === 'streak') return w ? (w.streak.claimed_today ? `${w.streak.current} days · collected` : 'Reward ready') : 'Daily Woobux';
    if (key === 'shop') return w ? `${w.balance.toLocaleString()} Woobux` : 'Opens soon';
    if (key === 'tier-maker') { const n = savedTierLists().length; return n ? `${n} saved list${n === 1 ? '' : 's'}` : 'Rank anything'; }
    return 'Paused';
}

/** Your balance, top right. Signed out: nothing. */
function BalanceChip() {
    const w = woobux();
    if (!woobuxOn()) return null;
    return (
        <Link to="fun/streak" className="fun-balance" aria-label={w ? `${w.balance.toLocaleString()} Woobux` : 'Woobux'}>
            <WoobuxIcon size={22} />
            {w ? <strong>{w.balance.toLocaleString()}</strong> : <span className="skel skel-text" style={{ width: 48 }} />}
        </Link>
    );
}

// ==================== the grid ====================
// Each block is a "stretched link" (the whole block opens its tool) with
// its own buttons above it, so a widget's button (Collect) works in place.

function Bento() {
    const w = woobux();
    const lists = savedTierLists().length;
    return (
        <div className="fun-bento">
            <div className="fun-block fun-tile is-streak" data-flip-id="streak">
                <Link to="fun/streak" className="fun-tile-link" aria-label="Open the streak" />
                <StreakWidget w={w} />
            </div>

            <div className="fun-block fun-tile is-shop" data-flip-id="shop">
                <Link to="fun/shop" className="fun-tile-link" aria-label="Open the shop" />
                <CouponIcon size={84} className="fun-tile-art" />
                <div className="fun-tile-text">
                    <span className="fun-tile-kicker">Shop</span>
                    <strong>Spend your Woobux</strong>
                    <small>{w ? <>You have <b>{w.balance.toLocaleString()}</b>. The shop opens soon.</> : 'The shop opens soon.'}</small>
                </div>
            </div>

            <div className="fun-block fun-tile is-tier" data-flip-id="tier-maker">
                <Link to="fun/tier-maker" className="fun-tile-link" aria-label="Open the tier maker" />
                <span className="fun-block-icon is-tier-maker"><Icon name="trophy" size={22} /></span>
                <div className="fun-tile-text">
                    <strong>Tier maker</strong>
                    <small>{lists ? `${lists} saved list${lists === 1 ? '' : 's'}` : 'Rank anything'}</small>
                </div>
            </div>

            <div className="fun-block fun-tile is-battle" data-flip-id="battle">
                <Link to="fun/battle" className="fun-tile-link" aria-label="Open battles" />
                <span className="fun-block-icon is-battle"><Icon name="swords" size={22} /></span>
                <div className="fun-tile-text">
                    <strong>Battle</strong>
                    <small>Taking a break</small>
                </div>
            </div>

            <div className="fun-tile is-week">
                <Link to="fun/streak" className="fun-tile-link" aria-label="Open the streak calendar" />
                <WeekWidget w={w} />
            </div>

            <div className="fun-tile is-soon">
                <span className="fun-block-icon"><Icon name="sparkles" size={20} /></span>
                <div className="fun-tile-text">
                    <strong>More soon</strong>
                    <small>Tell me what you want next in <Link to="settings/about" className="fun-tile-inline">feedback</Link>.</small>
                </div>
            </div>
        </div>
    );
}

/** The Streak block: the flame, the count, and Collect right there. */
function StreakWidget({ w }: { w: WoobuxState | null }) {
    if (!woobuxOn()) {
        return (
            <div className="fun-streak-mini">
                <Flame level={0} />
                <div className="fun-tile-text">
                    <span className="fun-tile-kicker">Login streak</span>
                    <strong>Woobux every day</strong>
                    <small>Sign in and come back daily. The reward grows each day you keep it going.</small>
                    <button type="button" className="btn btn-primary fun-tile-btn" onClick={() => api.openAuthModal?.('signin')}>Sign in</button>
                </div>
            </div>
        );
    }
    if (!w) return <div className="skel" style={{ height: '100%', minHeight: 200, borderRadius: 'var(--panel-r)' }} />;
    return <StreakMini w={w} />;
}

function StreakMini({ w }: { w: WoobuxState }) {
    const m = useStreak(w);
    const btn = useRef<HTMLButtonElement>(null);
    return (
        <div className={`fun-streak-mini heat-${heat(m.days)}${m.claimed ? ' is-claimed' : ' is-ready'}`}>
            <Flame level={heat(m.days)} />
            <div className="fun-tile-text">
                <span className="fun-tile-kicker">Login streak {funPing() && <span className="fun-ping" aria-label="Today’s reward is waiting" />}</span>
                <strong className="fun-streak-mini-count">{m.days} day{m.days === 1 ? '' : 's'}</strong>
                <small>{m.claimed ? <>Collected. Next reward in <b>{untilNextDay()}</b>.</> : m.breaking ? `You missed ${m.s.missed} day${m.s.missed > 1 ? 's' : ''}. Open it to choose.` : `Day ${m.freshDay} of ${CYCLE} is ready.`}</small>
                {!m.claimed && !m.breaking && (
                    <button ref={btn} type="button" className="btn btn-primary fun-tile-btn streak-collect" disabled={m.busy} onClick={() => m.collect(false, btn.current)}>
                        <WoobuxIcon size={18} /> Collect {m.pay(m.freshDay).toLocaleString()}
                    </button>
                )}
            </div>
        </div>
    );
}

/** The next seven days of the cycle, with today marked. */
function WeekWidget({ w }: { w: WoobuxState | null }) {
    const mult = w?.multiplier || 1;
    const s = w?.streak;
    // the first day shown: today's (not collected yet) or tomorrow's
    const start = !s ? 1 : s.claimed_today ? cycleDay(s.current + 1) : s.missed > 0 ? 1 : cycleDay(s.current + 1);
    return (
        <div className="fun-week">
            <span className="fun-tile-kicker">{s?.claimed_today ? 'Coming up' : 'This week'}</span>
            <ol className="fun-week-days">
                {Array.from({ length: 7 }, (_, i) => {
                    const d = ((start - 1 + i) % CYCLE) + 1;
                    const r = dayReward(d);
                    return (
                        <li key={i} className={`${i === 0 && s && !s.claimed_today ? 'is-today' : ''}${r.passes ? ' is-bonus' : ''}`}>
                            <small>{i === 0 ? (s?.claimed_today ? 'Tmrw' : 'Today') : `Day ${d}`}</small>
                            <WoobuxIcon size={18} />
                            <b>{Math.round(r.woobux * mult)}</b>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

function SignedOut({ what }: { what: string }) {
    return (
        <div className="fun-empty">
            <WoobuxIcon size={56} className="fun-empty-coin" />
            <h2>Sign in to {what}</h2>
            <p>Woobux and the login streak need a free account. Everything else on the site works without one.</p>
            <button type="button" className="btn btn-primary" onClick={() => api.openAuthModal?.('signin')}>Sign in</button>
        </div>
    );
}

// ==================== the streak ====================

const MILESTONES = [7, 14, 21, 30];

/** How hot the flame burns: a step for each part of the cycle. */
const heat = (days: number) => (days <= 0 ? 0 : days < 7 ? 1 : days < 14 ? 2 : days < 21 ? 3 : days < 30 ? 4 : 5);

/** Time left until the next day starts (12:00 am Philippine time, UTC+8). */
function untilNextDay(): string {
    const now = Date.now();
    const manila = new Date(now + 8 * 3600_000);
    const next = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate() + 1) - 8 * 3600_000;
    const mins = Math.max(1, Math.ceil((next - now) / 60_000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
}

function useTicker(ms: number) {
    const [, set] = useState(0);
    useEffect(() => { const t = setInterval(() => set(n => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** Where the streak stands and how to collect: shared by the Streak block and the Streak tool. */
function useStreak(w: WoobuxState) {
    useTicker(30_000);
    const s = w.streak;
    const [busy, setBusy] = useState(false);
    const [justGot, setJustGot] = useState(0);
    const claimed = s.claimed_today;
    // after missed days: save passes can keep the streak, or it starts over
    const canSave = !claimed && s.missed > 0 && s.held > 0 && s.save_passes >= s.missed;
    const breaking = !claimed && s.missed > 0 && s.held > 0;
    const days = claimed ? s.current : breaking ? s.held : s.current;
    const keepDay = cycleDay(s.held + 1), freshDay = breaking ? 1 : cycleDay(s.current + 1);
    const mult = w.multiplier || 1;
    const pay = (d: number) => Math.round(dayReward(d).woobux * mult);
    const collect = async (keep: boolean, from: Element | null) => {
        if (busy) return;
        setBusy(true);
        const before = w.balance;
        const r = await claimDaily(keep);
        setBusy(false);
        if (!r || r.already) return;
        setJustGot(r.awarded);
        coinBurst(from, before, r.balance);
    };
    return { s, busy, justGot, claimed, canSave, breaking, days, keepDay, freshDay, mult, pay, collect };
}

function StreakPanel() {
    useStore();
    const w = woobux();
    if (!woobuxOn()) return <SignedOut what="collect Woobux every day" />;
    if (!w) return <div className="fun-streak is-loading" aria-busy="true"><div className="skel" style={{ height: 180, borderRadius: 12 }} /></div>;
    return <Streak w={w} />;
}

function Streak({ w }: { w: WoobuxState }) {
    const { s, busy, justGot, claimed, canSave, breaking, days, keepDay, freshDay, mult, pay, collect } = useStreak(w);
    const button = useRef<HTMLButtonElement>(null);
    const hero = useRef<HTMLDivElement>(null);
    // the calendar: today is the day you would collect (or did)
    const calCount = claimed ? s.current : canSave ? s.held + 1 : freshDay;
    const pos = claimed ? cycleDay(s.current) : cycleDay(days);
    const next = MILESTONES.find(m => m > pos) ?? 30;
    const toNext = next - pos;

    useEffect(() => { countUp(hero.current); }, [claimed]);

    return (
        <div className="fun-streak">
            <section className={`streak-hero heat-${heat(days)}${claimed ? ' is-claimed' : ' is-ready'}`} ref={hero}>
                <Flame level={heat(days)} />
                <div className="streak-hero-text">
                    <p className="streak-count"><strong data-count={days}>{days}</strong><span>day{days === 1 ? '' : 's'} in a row</span></p>
                    <p className="streak-line">
                        {claimed
                            ? <>You collected today{justGot ? <> (<strong>+{justGot.toLocaleString()}</strong>)</> : null}. The next reward opens in <strong>{untilNextDay()}</strong>.</>
                            : breaking
                                ? <>You missed {s.missed} day{s.missed > 1 ? 's' : ''}. {canSave ? 'Save passes can keep your streak alive.' : 'Not enough save passes this time, so the streak starts over.'}</>
                                : <>Today is day <strong>{freshDay}</strong> of {CYCLE}. Collect before the day ends to keep the flame going.</>}
                    </p>
                    {!claimed && (
                        <div className="streak-actions">
                            {canSave ? (
                                <>
                                    <button ref={button} type="button" className="btn btn-primary streak-collect" disabled={busy} onClick={() => collect(true, button.current)}>
                                        <SavePassIcon size={18} /> Keep my {s.held}-day streak (+{pay(keepDay).toLocaleString()})
                                    </button>
                                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={e => collect(false, e.currentTarget)}>Start over (+{pay(1).toLocaleString()})</button>
                                    <small className="streak-cost">Uses {s.missed} of your {s.save_passes} save pass{s.save_passes === 1 ? '' : 'es'}.</small>
                                </>
                            ) : (
                                <button ref={button} type="button" className="btn btn-primary streak-collect" disabled={busy} onClick={() => collect(false, button.current)}>
                                    <WoobuxIcon size={20} /> Collect {pay(freshDay).toLocaleString()} Woobux
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <section className="streak-track" aria-label="The 30-day cycle">
                <div className="streak-track-head">
                    <span>{pos >= 30 && claimed ? 'Cycle complete! A new one starts tomorrow.' : <>
                        <strong>{toNext} day{toNext === 1 ? '' : 's'}</strong> to the day {next} bonus: +{pay(next).toLocaleString()} and {dayReward(next).passes} save pass{dayReward(next).passes > 1 ? 'es' : ''}
                    </>}</span>
                    <span className="streak-track-count">{pos}/{CYCLE}</span>
                </div>
                <div className="streak-bar" style={{ ['--fill' as any]: `${(pos / CYCLE) * 100}%` }}>
                    <span className="streak-bar-fill" />
                    {MILESTONES.map(m => (
                        <span key={m} className={`streak-mark${pos >= m ? ' is-reached' : ''}`} style={{ left: `${(m / CYCLE) * 100}%` }} title={`Day ${m}`}>
                            <SavePassIcon size={m === 30 ? 22 : 18} />
                        </span>
                    ))}
                </div>
            </section>

            <dl className="wbx-stats">
                <div><dt>Balance</dt><dd><WoobuxIcon size={18} /><span>{w.balance.toLocaleString()}</span></dd></div>
                <div><dt>Best streak</dt><dd><Icon name="fire" size={16} />{s.best}</dd></div>
                <div><dt>Save passes</dt><dd><SavePassIcon size={18} />{s.save_passes}/5</dd></div>
                <div><dt>Multiplier</dt><dd>×{mult % 1 ? mult.toFixed(2).replace(/0$/, '') : mult}</dd></div>
            </dl>

            <Calendar key={`${calCount}-${claimed}-${mult}`} count={calCount} claimedToday={claimed} multiplier={mult} />
            <p className="wbx-note">A new day starts at 12:00 am Philippine time. Days 7, 14, 21 and 30 pay a bonus and give save passes (you hold up to 5). A save pass covers one missed day.{mult > 1 ? ` Your role multiplies every reward by ${mult}.` : ''}</p>
        </div>
    );
}

/** The streak's flame: four layers, taller and brighter as the streak grows. */
function Flame({ level }: { level: number }) {
    return (
        <div className={`streak-flame lvl-${level}`} aria-hidden="true">
            <svg viewBox="0 0 64 80" width="64" height="80">
                <path className="fl-outer" d="M32 2c4 12 18 20 22 36 4 17-6 36-22 38C14 78 4 62 8 45c2-9 8-13 9-22 7 6 7 13 7 13S27 20 32 2Z" />
                <path className="fl-mid" d="M33 22c3 9 13 15 15 27 2 13-5 23-16 24-11 0-18-10-15-21 1-6 5-9 6-15 4 4 5 9 5 9s1-14 5-24Z" />
                <path className="fl-core" d="M32 42c2 6 8 9 9 16 1 8-4 13-9 13s-10-5-9-12c1-6 5-8 6-13 1 2 2 4 2 4s0-4 1-8Z" />
                <ellipse className="fl-glow" cx="32" cy="66" rx="14" ry="5" />
            </svg>
        </div>
    );
}

// ==================== shop ====================

function ShopPanel() {
    useStore();
    const w = woobux();
    if (!woobuxOn()) return <SignedOut what="shop with Woobux" />;
    return (
        <div className="fun-shop">
            <div className="fun-shop-hero">
                <CouponIcon size={120} className="fun-shop-coupon" />
                <div>
                    <h2>The shop is not open yet</h2>
                    <p>Keep collecting. Your Woobux stay safe until it opens{w ? <>, and you have <strong>{w.balance.toLocaleString()}</strong> so far</> : null}.</p>
                    <Link to="fun/streak" className="btn btn-secondary"><WoobuxIcon size={18} /> Collect today’s Woobux</Link>
                </div>
            </div>
        </div>
    );
}

// ==================== tier maker ====================

function TierPanel() {
    useStore();
    const lists = savedTierLists();
    return (
        <div className="fun-tier">
            <button type="button" className="fun-tier-new" onClick={() => openTierMaker(newTierList())}>
                <span className="fun-block-icon is-tier-maker"><Icon name="plus" size={22} /></span>
                <span className="fun-tile-text"><strong>New tier list</strong><small>Rank anything: Fakémon, Pokémon, pictures, words. Pyramids, alignment charts, brackets and more.</small></span>
                <Icon name="arrow-right" size={16} />
            </button>
            <section className="fun-tier-saved">
                <h2>Your tier lists</h2>
                {!lists.length && <p className="fun-tier-empty">Nothing saved on this device yet. Make one above.</p>}
                {lists.map(l => (
                    <div key={l.id} className="tm-saved-row">
                        <button type="button" className="tm-saved-open" onClick={() => openTierMaker(l)}>
                            <strong>{l.title}</strong><small>{Object.keys(l.mons).length} in it · {new Date(l.updatedAt).toLocaleDateString()}</small>
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Delete ${l.title}`} onClick={() => deleteTierList(l.id)}><Icon name="trash-2" size={14} /></button>
                    </div>
                ))}
            </section>
        </div>
    );
}

// ==================== battle ====================

function BattlePanel() {
    return (
        <div className="fun-empty fun-battle">
            <span className="fun-battle-icon"><Icon name="swords" size={30} /></span>
            <h2>Battles are taking a break</h2>
            <p>The current battle simulator is too buggy to be fun, so it is switched off. A better one is being built from the ground up, and battles come back here when it is ready.</p>
        </div>
    );
}
