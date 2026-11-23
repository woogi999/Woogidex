// The preview panel (dev server only, js/core/dev-mock.ts): a small panel in
// the corner that puts the streak in each situation, sets a role
// multiplier, replays the coin animation, and jumps to the screens that are
// new in this release. Nothing here reaches the database or a real build.

import { useEffect, useState } from 'react';
import { api } from '../../core/app.ts';
import { Icon } from '../components/Icon.tsx';
import { useStore } from '../store.ts';
import { coinBurst } from '../components/coinBurst.ts';
import { MOCK_SCENARIOS, setMockScenario, woobux, type MockScenario } from '../../features/woobux.ts';

const PLACES: Array<[string, string]> = [
    ['fun', 'Fun (the grid)'],
    ['fun/streak', 'Fun > Streak'],
    ['fun/shop', 'Fun > Shop'],
    ['fun/tier-maker', 'Fun > Tier maker'],
    ['settings/appearance', 'Settings > Header bar'],
    ['settings/notifications', 'Settings > Pings'],
    ['groups', 'Groups (open one > Settings)']
];

export function MockPanel() {
    useStore();
    const [open, setOpen] = useState(true);
    const [scenario, setScenario] = useState<MockScenario>('ready');
    const [mult, setMult] = useState(1);
    const w = woobux();
    const pick = (s: MockScenario, m = mult) => { setScenario(s); setMult(m); setMockScenario(s, m); };
    // the local numbers load at once, signed in or not
    useEffect(() => { setMockScenario('ready', 1); }, []);
    if (!open) {
        return <button type="button" className="mock-chip" onClick={() => setOpen(true)}><Icon name="eye" size={14} /> Preview</button>;
    }
    return (
        <aside className="mock-panel" aria-label="Preview mode">
            <header>
                <strong><Icon name="eye" size={15} /> Preview mode</strong>
                <button type="button" className="mock-x" aria-label="Fold the preview panel" onClick={() => setOpen(false)}><Icon name="minus" size={14} /></button>
            </header>
            <p>Dev server only. Woobux run on local numbers and group pictures stay in this tab. Nothing is saved.</p>

            <h4>Streak</h4>
            <div className="mock-grid">
                {(Object.keys(MOCK_SCENARIOS) as MockScenario[]).map(k => (
                    <button key={k} type="button" className={scenario === k ? 'is-on' : ''} onClick={() => pick(k)}>{MOCK_SCENARIOS[k]}</button>
                ))}
            </div>

            <h4>Role multiplier</h4>
            <div className="mock-row">
                {[1, 1.5, 2, 3].map(m => (
                    <button key={m} type="button" className={mult === m ? 'is-on' : ''} onClick={() => pick(scenario, m)}>×{m}</button>
                ))}
            </div>

            <h4>Moments</h4>
            <div className="mock-row">
                <button type="button" onClick={e => coinBurst(e.currentTarget, w?.balance ?? 1240, (w?.balance ?? 1240) + 170)}>Play the coin burst</button>
                <button type="button" onClick={() => api.openWhatsNew?.()}>Update pop-up</button>
            </div>

            <h4>Go to</h4>
            <div className="mock-links">
                {PLACES.map(([to, label]) => <button key={to} type="button" onClick={() => api.openPath?.(to)}>{label}</button>)}
            </div>

            <a className="mock-leave" href="/?mock=off">Leave preview mode</a>
        </aside>
    );
}
