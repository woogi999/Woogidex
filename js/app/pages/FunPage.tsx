// /fun: the Fun tab, where the playful parts of the site live together.
// A sidebar is always there; the main area shows:
//   /fun                 the main menu: a bento grid of tools and widgets
//   /fun/streak          the daily login streak and today's Woobux
//   /fun/shop            the Woobux shop (not open yet)
//   /fun/tier-maker      the tier maker's saved lists (the editor: /fun/tier-maker/edit)
// Battle is paused: its row and block open the "taking a break" window
// (api.openBattle) instead of a page. The Fun tab in the header pings while
// today's reward waits (funPing in js/features/woobux.ts), and so do the
// Streak block and row. Collecting plays the coin burst
// (js/app/components/coinBurst.ts). CSS: css/fun.css.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../core/app.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { useStore } from '../store.ts';
import { usePhone, useRoute, useSlide } from '../hooks.ts';
import { countUp } from '../../core/motion.ts';
import { coinBurst } from '../components/coinBurst.ts';
import { StreakFire, fireLevel } from '../components/fire/StreakFire.tsx';
import { Calendar, SavePassIcon, ShopIcon, WoobuxIcon } from '../dialogs/woobux.tsx';
import { openTierMaker } from '../dialogs/tierMaker.tsx';
import { deleteTierList, newTierList, savedTierLists } from '../../features/tier-lists.ts';
import { CYCLE, claimDaily, cycleDay, dayReward, funPing, refreshWoobux, woobux, woobuxOn, type WoobuxState } from '../../features/woobux.ts';

export type FunTool = 'streak' | 'shop' | 'tier-maker';
const TOOLS: Array<[FunTool, string, string]> = [
    ['streak', 'Streak', 'fire'],
    ['shop', 'Shop', 'shopping-cart'],
    ['tier-maker', 'Tier maker', 'trophy']
];
const KEYS = TOOLS.map(([k]) => k);

/** The open tool the address names (/fun/<tool>), or null for the main menu. */
export function funToolFrom(param: string): FunTool | null {
    const t = String(param || '').split('/')[0] as FunTool;
    return KEYS.includes(t) ? t : null;
}

const openBattle = () => api.openBattle?.();
const SLIDE_ORDER = ['home', ...KEYS];

export function FunPage() {
    useStore();
    const route = useRoute();
    const tool = route.name === 'fun' ? funToolFrom(route.param) : null;
    // the main area slides from the side of the row you picked (down the sidebar: from below)
    const main = useSlide(tool || 'home', SLIDE_ORDER, usePhone() ? 'x' : 'y');
    useEffect(() => { if (woobuxOn() && !woobux()) refreshWoobux(); }, []);
    // an old /fun/battle address: the window, over the main menu
    useEffect(() => { if (route.name === 'fun' && String(route.param || '').startsWith('battle')) openBattle(); }, [route.param]);

    return (
        <div className="fun-page">
            <header className="page-header fun-head">
                <div className="page-heading">
                    <h1 className="page-title">Fun</h1>
                    <p className="fun-sub">Your daily Woobux, the shop, the tier maker and battles.</p>
                </div>
                <BalanceChip />
            </header>
            <div className="fun-split">
                <nav className="fun-side" aria-label="Fun">
                    <Link to="fun" className={`fun-side-item${tool === null ? ' is-active' : ''}`} aria-current={tool === null ? 'page' : undefined}>
                        <span className="fun-side-icon"><Icon name="squares-2x2" size={20} /></span>
                        <span className="fun-side-text"><strong>Home</strong><small>Everything in Fun</small></span>
                    </Link>
                    {TOOLS.map(([key, label, icon]) => (
                        <Link key={key} to={`fun/${key}`} className={`fun-side-item${tool === key ? ' is-active' : ''}`}
                            aria-current={tool === key ? 'page' : undefined}>
                            <span className={`fun-side-icon is-${key}`}><Icon name={icon} size={20} /></span>
                            <span className="fun-side-text"><strong>{label}</strong><small>{sideNote(key)}</small></span>
                            {key === 'streak' && funPing() && <span className="fun-ping" aria-label="Today’s reward is waiting" />}
                        </Link>
                    ))}
                    <button type="button" className="fun-side-item" onClick={openBattle} aria-haspopup="dialog">
                        <span className="fun-side-icon is-battle"><Icon name="swords" size={20} /></span>
                        <span className="fun-side-text"><strong>Battle</strong><small>Taking a break</small></span>
                    </button>
                </nav>
                <section className="fun-main" ref={main} aria-label={tool ? TOOLS.find(t => t[0] === tool)?.[1] : 'Fun'}>
                    {tool === null && <Bento />}
                    {tool === 'streak' && <StreakPanel />}
                    {tool === 'shop' && <ShopPanel />}
                    {tool === 'tier-maker' && <TierPanel />}
                </section>
            </div>
        </div>
    );
}

/** The short line under each sidebar row. */
function sideNote(key: FunTool): string {
    const w = woobux();
    if (key === 'streak') return w ? (w.streak.claimed_today ? `${w.streak.current} days · collected` : 'Reward ready') : 'Daily Woobux';
    if (key === 'shop') return w ? `${w.balance.toLocaleString()} Woobux` : 'Opens soon';
    const n = savedTierLists().length;
    return n ? `${n} saved list${n === 1 ? '' : 's'}` : 'Rank anything';
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

// ==================== the main menu ====================
// Each block is a "stretched link" (the whole block opens its tool) with
// its own buttons above it, so a widget's button (Collect) works in place.

function Bento() {
    const w = woobux();
    const lists = savedTierLists().length;
    // (the blocks arrive one after another with the main area's slide, useSlide in FunPage)
    return (
        <div className="fun-bento">
            <div className="fun-tile is-streak">
                <Link to="fun/streak" className="fun-tile-link" aria-label="Open the streak" />
                <StreakWidget w={w} />
            </div>

            <div className="fun-tile is-shop">
                <Link to="fun/shop" className="fun-tile-link" aria-label="Open the shop" />
                <ShopIcon size={84} className="fun-tile-art" />
                <div className="fun-tile-text">
                    <strong>Shop</strong>
                    <small>{w ? <>You have <b>{w.balance.toLocaleString()}</b> Woobux. The shop opens soon.</> : 'The shop opens soon.'}</small>
                </div>
            </div>

            <div className="fun-tile is-tier">
                <Link to="fun/tier-maker" className="fun-tile-link" aria-label="Open the tier maker" />
                <Icon name="trophy" size={28} className="fun-tile-icon is-tier-maker" />
                <div className="fun-tile-text">
                    <strong>Tier maker</strong>
                    <small>{lists ? `${lists} saved list${lists === 1 ? '' : 's'}` : 'Rank anything'}</small>
                </div>
            </div>

            <div className="fun-tile is-battle">
                <button type="button" className="fun-tile-link" aria-label="Battle: taking a break" aria-haspopup="dialog" onClick={openBattle} />
                <Icon name="swords" size={28} className="fun-tile-icon is-battle" />
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
                <Icon name="sparkles" size={26} className="fun-tile-icon" />
                <div className="fun-tile-text">
                    <strong>More soon</strong>
                    <small>Tell me what you want next in <button type="button" className="fun-tile-inline" onClick={() => api.openFeedbackModal?.()}>feedback</button>.</small>
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
                <StreakFire days={0} size={110} />
                <div className="fun-tile-text">
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
        <div className={`fun-streak-mini heat-${fireLevel(m.days)}${m.claimed ? ' is-claimed' : ' is-ready'}`}>
            <StreakFire days={m.days} size={120} />
            <div className="fun-tile-text">
                <strong className="fun-streak-mini-count">{m.days} day{m.days === 1 ? '' : 's'} {funPing() && <span className="fun-ping" aria-label="Today’s reward is waiting" />}</strong>
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
            <strong className="fun-week-title">{s?.claimed_today ? 'Coming up' : 'This week'}</strong>
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
    // after missed days: streak savers can keep the streak, or it starts over
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
            <section className={`streak-hero heat-${fireLevel(days)}${claimed ? ' is-claimed' : ' is-ready'}`} ref={hero}>
                <StreakFire days={days} size={150} />
                <div className="streak-hero-text">
                    <p className="streak-count"><strong data-count={days}>{days}</strong><span>day{days === 1 ? '' : 's'} in a row</span></p>
                    <p className="streak-line">
                        {claimed
                            ? <>You collected today{justGot ? <> (<strong>+{justGot.toLocaleString()}</strong>)</> : null}. The next reward opens in <strong>{untilNextDay()}</strong>.</>
                            : breaking
                                ? <>You missed {s.missed} day{s.missed > 1 ? 's' : ''}. {canSave ? 'Streak savers can keep your streak alive.' : 'Not enough streak savers this time, so the streak starts over.'}</>
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
                                    <small className="streak-cost">Uses {s.missed} of your {s.save_passes} streak saver{s.save_passes === 1 ? '' : 's'}.</small>
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
                        <strong>{toNext} day{toNext === 1 ? '' : 's'}</strong> to the day {next} bonus: +{pay(next).toLocaleString()} and {dayReward(next).passes} streak saver{dayReward(next).passes > 1 ? 's' : ''}
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
                <div><dt>Streak savers</dt><dd><SavePassIcon size={18} />{s.save_passes}/5</dd></div>
                <div><dt>Multiplier</dt><dd>×{mult % 1 ? mult.toFixed(2).replace(/0$/, '') : mult}</dd></div>
            </dl>

            <Calendar key={`${calCount}-${claimed}-${mult}`} count={calCount} claimedToday={claimed} multiplier={mult} />
            {mult > 1 && <p className="wbx-note">Your role multiplies every reward by {mult}.</p>}
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
                <ShopIcon size={120} className="fun-shop-art" />
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
                <Icon name="plus" size={24} className="fun-tile-icon is-tier-maker" />
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

