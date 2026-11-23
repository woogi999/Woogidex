// The Woobux pictures (public/assets/, drawn by scripts/coin-art.mjs) and
// the 30-day reward calendar. The calendar lives
// on Fun > Streak (js/app/pages/FunPage.tsx): nothing about the streak pops
// up any more.

import { useEffect, useRef } from 'react';
import { staggerIn } from '../../core/motion.ts';
import { CYCLE, cycleDay, dayReward } from '../../features/woobux.ts';

/** The Woobux coin (public/assets/woobux.svg, after the owner's reference). */
export function WoobuxIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <img src="assets/woobux.svg" width={size} height={size} alt="" className={`woobux-icon ${className}`.trim()} draggable={false} />;
}

/** A save pass: a blue and white ticket (public/assets/save-pass.svg). */
export function SavePassIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <img src="assets/save-pass.svg" width={size} height={size} alt="" className={`woobux-icon ${className}`.trim()} draggable={false} />;
}

/** The shop: a cart in the coin's gold (public/assets/shop-cart.svg). */
export function ShopIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <img src="assets/shop-cart.svg" width={size} height={size} alt="" className={`woobux-icon ${className}`.trim()} draggable={false} />;
}

/** The 30 days of the cycle: done, today, still to come. `multiplier` scales the shown amounts (a role's). */
export function Calendar({ count, claimedToday, multiplier = 1 }: { count: number; claimedToday: boolean; multiplier?: number }) {
    const at = cycleDay(count);
    const grid = useRef<HTMLOListElement>(null);
    useEffect(() => { staggerIn(Array.from(grid.current?.children || [])); }, []);
    return (
        <ol className="wbx-calendar" ref={grid} aria-label="The 30-day reward calendar">
            {Array.from({ length: CYCLE }, (_, i) => {
                const d = i + 1;
                const r = dayReward(d);
                const amount = Math.round(r.woobux * multiplier);
                const done = d < at || (d === at && claimedToday);
                const today = d === at;
                return (
                    <li key={d} className={`wbx-day${done ? ' is-done' : ''}${today ? ' is-today' : ''}${r.passes ? ' is-milestone' : ''}`}
                        aria-label={`Day ${d}: ${amount} Woobux${r.passes ? ` and ${r.passes} save pass${r.passes > 1 ? 'es' : ''}` : ''}${done ? ', collected' : ''}`}>
                        <span className="wbx-day-n">{d}</span>
                        <WoobuxIcon size={d === 30 ? 26 : 20} />
                        <strong>{amount}</strong>
                        {r.passes > 0 && <span className="wbx-day-pass"><SavePassIcon size={12} />×{r.passes}</span>}
                    </li>
                );
            })}
        </ol>
    );
}
