// The tier maker's game modes, on screen (the rules are js/features/tier-modes.ts).
// A mode takes the place of the board's tools while it runs. Blind ranking
// places straight into the list; the others end with "Put it in the list".

import { useMemo, useState } from 'react';
import { Icon } from '../Icon.tsx';
import { ItemArt } from './TierBoard.tsx';
import { UNRANKED, moveMonTo, rowCapacity, type TierList } from '../../../features/tier-lists.ts';
import {
    MODES, applyOrder, bracketDone, bracketOrder, bracketPair, bracketPick, faceOffOrder, faceOffPick, ktcAnswer, ktcDone, ktcList,
    newBracket, newFaceOff, newKtc, newSnake, newVersus, shuffle, snakeDone, snakeList, snakePick, snakeWho, versusAnswer, versusDone, versusPair,
    type ModeKey
} from '../../../features/tier-modes.ts';

function Card({ list, id, onClick, big = false }: { list: TierList; id: string; onClick?: () => void; big?: boolean }) {
    const m = list.mons[id];
    if (!m) return null;
    const inner = <><span className="tm-mode-pic"><ItemArt m={m} /></span><strong>{m.name}</strong></>;
    return onClick
        ? <button type="button" className={`tm-mode-card${big ? ' is-big' : ''}`} onClick={onClick}>{inner}</button>
        : <div className={`tm-mode-card${big ? ' is-big' : ''}`}>{inner}</div>;
}

const Done = ({ text, onApply, label = 'Put it in the list' }: { text: string; onApply: () => void; label?: string }) => (
    <div className="tm-mode-done">
        <p>{text}</p>
        <button type="button" className="btn btn-primary" onClick={onApply}><Icon name="check" size={16} />{label}</button>
    </div>
);

/** Blind ranking: the next item, and where it goes. The board is locked while it runs. */
function Blind({ list, onChange, onDone }: { list: TierList; onChange: (l: TierList) => void; onDone: () => void }) {
    const [queue, setQueue] = useState(() => shuffle((list.placed[UNRANKED] || []).filter(id => list.mons[id])));
    // an item placed on the chart (quadrant) by hand leaves the queue too
    const id = queue.find(x => (list.placed[UNRANKED] || []).includes(x));
    if (!id) return <Done text="All placed, no take-backs. How did it turn out?" onApply={onDone} label="Done" />;
    const cols = list.columns?.length ? list.columns : null;
    const place = (tierId: string, colId: string | null) => { onChange(moveMonTo(list, id, tierId, colId)); setQueue(q => q.filter(x => x !== id)); };
    const left = queue.filter(x => (list.placed[UNRANKED] || []).includes(x)).length;
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count">{left} to go. Once it is placed, it stays.</p>
            <Card list={list} id={id} big />
            {list.layout === 'quadrant'
                ? <p className="tm-mode-hint">Drag it onto the chart.</p>
                : (
                    <div className="tm-mode-choices">
                        {list.tiers.flatMap((t, i) => {
                            const full = (list.placed[t.id] || []).length >= rowCapacity(list, i);
                            return cols
                                ? cols.map(c => <button key={`${t.id}${c.id}`} type="button" className="tm-mode-choice" style={{ ['--c' as any]: t.color }} onClick={() => place(t.id, c.id)}>{t.name} · {c.name}</button>)
                                : [<button key={t.id} type="button" className="tm-mode-choice" disabled={full} style={{ ['--c' as any]: t.color }} onClick={() => place(t.id, null)}>{t.name}</button>];
                        })}
                    </div>
                )}
        </div>
    );
}

function Bracket({ list, ids, onApply }: { list: TierList; ids: string[]; onApply: (l: TierList) => void }) {
    const [b, setB] = useState(() => newBracket(ids));
    const pair = bracketPair(b);
    const roundsLeft = Math.log2(b.rounds[b.round].length);
    if (bracketDone(b)) {
        const order = bracketOrder(b);
        return (
            <div className="tm-mode-stage">
                <p className="tm-mode-count">The champion</p>
                <Card list={list} id={order[0]} big />
                <Done text="The rest go in by the round they went out in." onApply={() => onApply(applyOrder(list, order))} />
            </div>
        );
    }
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count">{roundsLeft === 1 ? 'The final' : roundsLeft === 2 ? 'Semi-final' : `Round ${b.round + 1}`}, match {b.match + 1}</p>
            <div className="tm-mode-vs">
                <Card list={list} id={pair![0]!} onClick={() => setB(bracketPick(b, pair![0]!))} big />
                <span className="tm-mode-vs-word">VS</span>
                <Card list={list} id={pair![1]!} onClick={() => setB(bracketPick(b, pair![1]!))} big />
            </div>
        </div>
    );
}

function Versus({ list, ids, onApply }: { list: TierList; ids: string[]; onApply: (l: TierList) => void }) {
    const [v, setV] = useState(() => newVersus(ids));
    const pair = versusPair(v);
    if (versusDone(v)) return <div className="tm-mode-stage"><Done text={`Sorted ${v.sorted.length} in ${v.asked} questions.`} onApply={() => onApply(applyOrder(list, v.sorted))} /></div>;
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count">Which is better? {v.queue.length} left to sort.</p>
            <div className="tm-mode-vs">
                <Card list={list} id={pair![0]} onClick={() => setV(versusAnswer(v, true))} big />
                <span className="tm-mode-vs-word">VS</span>
                <Card list={list} id={pair![1]} onClick={() => setV(versusAnswer(v, false))} big />
            </div>
        </div>
    );
}

function FaceOff({ list, ids, onApply }: { list: TierList; ids: string[]; onApply: (l: TierList) => void }) {
    const [f, setF] = useState(() => newFaceOff(ids));
    const top = faceOffOrder(f).slice(0, 5);
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count">{f.rounds} picks so far. Stop whenever you like.</p>
            {f.pair && (
                <div className="tm-mode-vs">
                    <Card list={list} id={f.pair[0]} onClick={() => setF(faceOffPick(f, f.pair![0]))} big />
                    <span className="tm-mode-vs-word">VS</span>
                    <Card list={list} id={f.pair[1]} onClick={() => setF(faceOffPick(f, f.pair![1]))} big />
                </div>
            )}
            <ol className="tm-mode-standings">{top.map(id => <li key={id}>{list.mons[id]?.name} <small>{Math.round(f.rating[id])}</small></li>)}</ol>
            {f.rounds > 0 && <Done text="The scores so far, best first." onApply={() => onApply(applyOrder(list, faceOffOrder(f)))} />}
        </div>
    );
}

function Ktc({ list, ids, onApply }: { list: TierList; ids: string[]; onApply: (l: TierList) => void }) {
    const [k, setK] = useState(() => newKtc(ids));
    const [picks, setPicks] = useState<Record<string, 'keep' | 'trade' | 'cut'>>({});
    if (ktcDone(k)) return <div className="tm-mode-stage"><Done text={`Kept ${k.keep.length}, traded ${k.trade.length}, cut ${k.cut.length}.`} onApply={() => onApply(ktcList(list, k))} /></div>;
    const group = k.groups[k.at];
    const next = ktcAnswer(k, picks);
    const ready = next !== k;
    // one of each: picking a word takes it from whoever had it
    const choose = (id: string, p: 'keep' | 'trade' | 'cut') => setPicks(cur => {
        const out = Object.fromEntries(Object.entries(cur).filter(([, v]) => group.length < 3 || v !== p));
        return { ...out, [id]: p };
    });
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count">Group {k.at + 1} of {k.groups.length}{group.length === 3 ? ': keep one, trade one, cut one' : ''}</p>
            <div className="tm-mode-ktc">
                {group.map(id => (
                    <div key={id} className="tm-mode-ktc-col">
                        <Card list={list} id={id} big />
                        <div className="segmented">
                            {(['keep', 'trade', 'cut'] as const).map(p => (
                                <button key={p} type="button" className={picks[id] === p ? 'active' : ''} onClick={() => choose(id, p)}>{p === 'keep' ? 'Keep' : p === 'trade' ? 'Trade' : 'Cut'}</button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => { setK(next); setPicks({}); }}>Next</button>
        </div>
    );
}

function Snake({ list, ids, onApply }: { list: TierList; ids: string[]; onApply: (l: TierList) => void }) {
    const [names, setNames] = useState('Player 1\nPlayer 2');
    const [picks, setPicks] = useState(3);
    const [s, setS] = useState<ReturnType<typeof newSnake> | null>(null);
    if (!s) {
        return (
            <div className="tm-mode-stage tm-mode-setup">
                <label>Players, one a line (2 to 8)<textarea rows={4} value={names} onChange={e => setNames(e.target.value)} /></label>
                <label>Picks each<input type="number" min={1} max={20} value={picks} onChange={e => setPicks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
                <button type="button" className="btn btn-primary" disabled={names.split('\n').filter(n => n.trim()).length < 2}
                    onClick={() => setS(newSnake(ids, names.split('\n'), picks))}>Start the draft</button>
            </div>
        );
    }
    if (snakeDone(s)) return <div className="tm-mode-stage"><Done text="The draft is over. Each player gets a column." onApply={() => onApply(snakeList(list, s))} /></div>;
    const who = snakeWho(s);
    return (
        <div className="tm-mode-stage">
            <p className="tm-mode-count"><strong>{s.players[who]}</strong> picks (pick {Math.floor(s.turn / s.players.length) + 1} of {s.picks})</p>
            <div className="tm-mode-pool">{s.pool.map(id => <Card key={id} list={list} id={id} onClick={() => setS(snakePick(s, id))} />)}</div>
            <div className="tm-mode-teams">
                {s.players.map((p, i) => <div key={p + i} className={i === who ? 'is-now' : ''}><strong>{p}</strong><small>{s.teams[i].map(id => list.mons[id]?.name).join(', ') || 'No picks yet'}</small></div>)}
            </div>
        </div>
    );
}

/** The mode that is running, over the board's place. `onApply` hands back the finished list. */
export function ModePanel({ list, mode, onChange, onApply, onClose }: { list: TierList; mode: ModeKey; onChange: (l: TierList) => void; onApply: (l: TierList) => void; onClose: () => void }) {
    // every item takes part, placed or not (blind ranking only places the unranked ones)
    const ids = useMemo(() => Object.keys(list.mons), [mode]);
    const [title, hint] = (MODES.find(m => m[0] === mode) || MODES[0]).slice(1) as [string, string];
    const few = mode !== 'blind' && ids.length < (mode === 'ktc' ? 3 : 2);
    return (
        <section className="tm-mode" aria-label={title}>
            <header className="tm-mode-head">
                <div><h3>{title}</h3><small>{hint}</small></div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{mode === 'blind' ? 'Stop' : 'Cancel'}</button>
            </header>
            {few ? <p className="tm-mode-hint">Add a few more items first.</p>
                : mode === 'blind' ? <Blind list={list} onChange={onChange} onDone={onClose} />
                    : mode === 'bracket' ? <Bracket list={list} ids={ids} onApply={onApply} />
                        : mode === 'vs' ? <Versus list={list} ids={ids} onApply={onApply} />
                            : mode === 'faceoff' ? <FaceOff list={list} ids={ids} onApply={onApply} />
                                : mode === 'ktc' ? <Ktc list={list} ids={ids} onApply={onApply} />
                                    : <Snake list={list} ids={ids} onApply={onApply} />}
        </section>
    );
}
