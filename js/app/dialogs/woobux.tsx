// The Woobux window (js/features/woobux.ts): your balance, the login streak
// and its 30-day reward calendar. It opens three ways:
//   'claimed'  after today's reward was paid: how much, and the calendar;
//   'save'     after missed days, when save passes can keep the streak;
//   'view'     from the account menu.

import { useEffect, useRef, useState } from 'react';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { useStore } from '../store.ts';
import { countUp, staggerIn } from '../../core/motion.ts';
import { CYCLE, claimDaily, cycleDay, dayReward, woobux, type ClaimResult } from '../../features/woobux.ts';

/** The Woobux coin (public/assets/woobux.svg, after the owner's reference). */
export function WoobuxIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <img src="assets/woobux.svg" width={size} height={size} alt="" className={`woobux-icon ${className}`.trim()} draggable={false} />;
}

export function SavePassIcon({ size = 16 }: { size?: number }) {
    return <img src="assets/save-pass.svg" width={size} height={size} alt="" className="woobux-icon" draggable={false} />;
}

/** The 30 days of the cycle: done, today, still to come. */
function Calendar({ count, claimedToday }: { count: number; claimedToday: boolean }) {
    const at = cycleDay(count);
    const grid = useRef<HTMLOListElement>(null);
    useEffect(() => { staggerIn(Array.from(grid.current?.children || [])); }, []);
    return (
        <ol className="wbx-calendar" ref={grid} aria-label="The 30-day reward calendar">
            {Array.from({ length: CYCLE }, (_, i) => {
                const d = i + 1;
                const r = dayReward(d);
                const done = d < at || (d === at && claimedToday);
                const today = d === at;
                return (
                    <li key={d} className={`wbx-day${done ? ' is-done' : ''}${today ? ' is-today' : ''}${r.passes ? ' is-milestone' : ''}`}
                        aria-label={`Day ${d}: ${r.woobux} Woobux${r.passes ? ` and ${r.passes} save pass${r.passes > 1 ? 'es' : ''}` : ''}${done ? ', collected' : ''}`}>
                        <span className="wbx-day-n">{d}</span>
                        <WoobuxIcon size={d === 30 ? 26 : 20} />
                        <strong>{r.woobux}</strong>
                        {r.passes > 0 && <span className="wbx-day-pass"><SavePassIcon size={12} />×{r.passes}</span>}
                    </li>
                );
            })}
        </ol>
    );
}

function WoobuxDialog({ close, mode: start = 'view', result: given = null }: DialogProps<{ mode?: 'claimed' | 'save' | 'view'; result?: ClaimResult | null }>) {
    useStore();
    const [mode, setMode] = useState(start);
    const [result, setResult] = useState<ClaimResult | null>(given);
    const [busy, setBusy] = useState(false);
    const head = useRef<HTMLDivElement>(null);
    const w = woobux();
    useEffect(() => { countUp(head.current); }, [mode, result?.awarded]);
    if (!w) return null;
    const s = w.streak;

    const decide = async (keep: boolean) => {
        setBusy(true);
        const r = await claimDaily(keep);
        setBusy(false);
        if (r) { setResult(r); setMode('claimed'); }
    };

    if (mode === 'save') {
        return (
            <Modal onClose={close} className="confirm-dialog wbx-save" overlayClassName="confirm-dialog-overlay" labelledBy="wbx-save-title">
                <div className="confirm-dialog-icon wbx-icon-spot" aria-hidden="true"><SavePassIcon size={44} /></div>
                <h3 id="wbx-save-title">Keep your {s.held}-day streak?</h3>
                <p>You missed {s.missed} day{s.missed > 1 ? 's' : ''}. Use {s.missed} save pass{s.missed > 1 ? 'es' : ''} (you have {s.save_passes}) to keep it going, or start over from day 1.</p>
                <div className="confirm-dialog-actions">
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => decide(false)}>Start over</button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>Use {s.missed > 1 ? `${s.missed} passes` : 'a pass'}</button>
                </div>
            </Modal>
        );
    }

    const count = s.current || s.held;
    return (
        <Modal onClose={close} title={mode === 'claimed' ? 'Daily reward' : 'Woobux'} className="wbx-dialog" labelledBy="wbx-title">
            <div className="wbx-head" ref={head}>
                {mode === 'claimed' && result ? (
                    <div className="wbx-claim">
                        <WoobuxIcon size={56} className="wbx-claim-coin" />
                        <div>
                            <strong className="wbx-claim-amount">+<span data-count={result.awarded}>{result.awarded.toLocaleString()}</span> Woobux</strong>
                            <small>
                                Day {result.cycle_day || cycleDay(count)} of {CYCLE}{count > 1 ? `, a ${count}-day streak` : ''}
                                {result.passes_used ? `. You used ${result.passes_used} save pass${result.passes_used > 1 ? 'es' : ''}` : ''}
                                {result.passes_awarded ? `. +${result.passes_awarded} save pass${result.passes_awarded > 1 ? 'es' : ''}!` : '.'}
                            </small>
                        </div>
                    </div>
                ) : null}
                <dl className="wbx-stats">
                    <div><dt>Balance</dt><dd><WoobuxIcon size={18} /><span data-count={w.balance}>{w.balance.toLocaleString()}</span></dd></div>
                    <div><dt>Streak</dt><dd>{count} day{count === 1 ? '' : 's'}</dd></div>
                    <div><dt>Best</dt><dd>{s.best}</dd></div>
                    <div><dt>Save passes</dt><dd><SavePassIcon size={18} />{s.save_passes}/5</dd></div>
                </dl>
            </div>
            <Calendar count={count} claimedToday={s.claimed_today} />
            <p className="wbx-note">Sign in each day for more Woobux. A new day starts at 12:00 am Philippine time. A save pass covers one missed day. Woobux will buy profile looks soon.</p>
            <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={close}>Nice</button></div>
        </Modal>
    );
}

registerDialog('woobux-streak', WoobuxDialog);
