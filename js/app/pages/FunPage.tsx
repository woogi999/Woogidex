// /fun: the Fun tab, where the playful parts of the site live together.
//   /fun/streak      the daily login streak and today's Woobux (the default)
//   /fun/shop        the Woobux shop (not open yet)
//   /fun/tier-maker  the tier maker and your saved lists
//   /fun/battle      the battle simulator (paused)
// The Fun tab in the header pings while today's reward waits
// (funPing in js/features/woobux.ts); the Streak tab pings too. Collecting
// plays the coin burst (js/app/components/coinBurst.ts). CSS: css/fun.css.

import { useEffect, useRef, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { useStore } from '../store.ts';
import { useRoute, useSlide } from '../hooks.ts';
import { countUp } from '../../core/motion.ts';
import { coinBurst } from '../components/coinBurst.ts';
import { Calendar, CouponIcon, SavePassIcon, WoobuxIcon } from '../dialogs/woobux.tsx';
import { SavedTierLists } from './ToolboxPage.tsx';
import { openTierMaker } from '../dialogs/tierMaker.tsx';
import { newTierList } from '../../features/tier-lists.ts';
import { CYCLE, claimDaily, cycleDay, dayReward, funPing, refreshWoobux, woobux, type WoobuxState } from '../../features/woobux.ts';

export type FunTab = 'streak' | 'shop' | 'tier-maker' | 'battle';
const TABS: Array<[FunTab, string, string]> = [
    ['streak', 'Streak', 'fire'],
    ['shop', 'Shop', 'shopping-bag'],
    ['tier-maker', 'Tier maker', 'trophy'],
    ['battle', 'Battle', 'swords']
];
const ORDER = TABS.map(([k]) => k);

/** The tab the address names (/fun/<tab>), Streak by default. */
export function funTabFrom(param: string): FunTab {
    const t = String(param || '').split('/')[0] as FunTab;
    return ORDER.includes(t) ? t : 'streak';
}

export function FunPage() {
    useStore();
    const route = useRoute();
    const tab = route.name === 'fun' ? funTabFrom(route.param) : 'streak';
    const body = useSlide(tab, ORDER);
    return (
        <div className="fun-page">
            <header className="page-header fun-head">
                <div className="page-heading">
                    <h1 className="page-title">Fun</h1>
                    <p className="fun-sub">Your daily Woobux, the shop, the tier maker and battles, all in one place.</p>
                </div>
                <BalanceChip />
            </header>
            <nav className="tabs fun-tabs" role="tablist" aria-label="Fun">
                {TABS.map(([key, label, icon]) => {
                    const ping = key === 'streak' && funPing();
                    return (
                        <Link key={key} to={`fun/${key}`} role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' active' : ''}`}
                            aria-label={ping ? `${label}, today’s reward is waiting` : undefined}>
                            <Icon name={icon} size={15} /><span>{label}</span>
                            {ping && <span className="fun-tab-ping" aria-hidden="true" />}
                        </Link>
                    );
                })}
            </nav>
            <div ref={body} className="fun-body" role="tabpanel">
                {tab === 'streak' && <StreakPanel />}
                {tab === 'shop' && <ShopPanel />}
                {tab === 'tier-maker' && <TierPanel />}
                {tab === 'battle' && <BattlePanel />}
            </div>
        </div>
    );
}

/** Your balance, top right. Signed out: nothing. */
function BalanceChip() {
    const w = woobux();
    if (!state.user) return null;
    return (
        <Link to="fun/streak" className="fun-balance" aria-label={w ? `${w.balance.toLocaleString()} Woobux` : 'Woobux'}>
            <WoobuxIcon size={22} />
            {w ? <strong>{w.balance.toLocaleString()}</strong> : <span className="skel skel-text" style={{ width: 48 }} />}
        </Link>
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

// ==================== streak ====================

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

function StreakPanel() {
    useStore();
    const w = woobux();
    useEffect(() => { if (state.user && !w) refreshWoobux(); }, []);
    if (!state.user) return <SignedOut what="collect Woobux every day" />;
    if (!w) return <div className="fun-streak is-loading" aria-busy="true"><div className="skel" style={{ height: 180, borderRadius: 12 }} /></div>;
    return <Streak w={w} />;
}

function Streak({ w }: { w: WoobuxState }) {
    useTicker(30_000);
    const s = w.streak;
    const [busy, setBusy] = useState(false);
    const [justGot, setJustGot] = useState(0);
    const button = useRef<HTMLButtonElement>(null);
    const hero = useRef<HTMLDivElement>(null);
    const claimed = s.claimed_today;
    // after missed days: save passes can keep the streak, or it starts over
    const canSave = !claimed && s.missed > 0 && s.held > 0 && s.save_passes >= s.missed;
    const breaking = !claimed && s.missed > 0 && s.held > 0;
    const days = claimed ? s.current : breaking ? s.held : s.current;
    const keepDay = cycleDay(s.held + 1), freshDay = breaking ? 1 : cycleDay(s.current + 1);
    const mult = w.multiplier || 1;
    const pay = (d: number) => Math.round(dayReward(d).woobux * mult);
    // the calendar: today is the day you would collect (or did)
    const calCount = claimed ? s.current : canSave ? s.held + 1 : freshDay;
    const pos = claimed ? cycleDay(s.current) : cycleDay(days);
    const next = MILESTONES.find(m => m > pos) ?? 30;
    const toNext = next - pos;

    useEffect(() => { countUp(hero.current); }, [claimed]);

    const collect = async (keep: boolean) => {
        if (busy) return;
        setBusy(true);
        const before = w.balance;
        const r = await claimDaily(keep);
        setBusy(false);
        if (!r || r.already) return;
        setJustGot(r.awarded);
        coinBurst(button.current, before, r.balance);
    };

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
                                    <button ref={button} type="button" className="btn btn-primary streak-collect" disabled={busy} onClick={() => collect(true)}>
                                        <SavePassIcon size={18} /> Keep my {s.held}-day streak (+{pay(keepDay).toLocaleString()})
                                    </button>
                                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => collect(false)}>Start over (+{pay(1).toLocaleString()})</button>
                                    <small className="streak-cost">Uses {s.missed} of your {s.save_passes} save pass{s.save_passes === 1 ? '' : 'es'}.</small>
                                </>
                            ) : (
                                <button ref={button} type="button" className="btn btn-primary streak-collect" disabled={busy} onClick={() => collect(false)}>
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

            <Calendar key={`${calCount}-${claimed}`} count={calCount} claimedToday={claimed} multiplier={mult} />
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
    if (!state.user) return <SignedOut what="shop with Woobux" />;
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
    return (
        <div className="fun-tier">
            <button type="button" className="toolbox-app" onClick={() => openTierMaker(newTierList())}>
                <span className="toolbox-app-icon"><Icon name="trophy" size={26} /></span>
                <span className="toolbox-app-text"><strong>New tier list</strong><small>Rank anything: Fakémon, Pokémon, pictures, words. Pyramids, alignment charts, brackets and more.</small></span>
                <Icon name="arrow-right" size={16} />
            </button>
            <SavedTierLists />
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
