// The data move (js/features/data-move.ts). On dex.woogi.xyz this is the
// whole site: what this browser holds, and a button to move it. On
// woogidex.com (/move) it is the tab that takes the data in.

import { useEffect } from 'react';
import { useStore } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { isOldSite, moveIn, moveOut, newAddress, outCounts, startMoveIn, startMoveOut, applyMoveIn, NEW_ORIGIN, OLD_ORIGIN } from '../../features/data-move.ts';
import { countPayload, type MoveList } from '../../features/data-move-model.ts';

const LABELS: Array<[MoveList, string, string]> = [
    ['fakemonDB', 'Fakémon', 'Fakémon'],
    ['folders', 'folder or region', 'folders and regions'],
    ['customMoves', 'custom move', 'custom moves'],
    ['customAbilities', 'custom ability', 'custom abilities'],
    ['customItems', 'custom item', 'custom items'],
    ['battleTeams', 'battle team', 'battle teams'],
    ['customMoveFlags', 'move flag', 'move flags']
];

function Counts({ counts }: { counts: Record<MoveList, number> }) {
    const rows = LABELS.filter(([key]) => counts[key] > 0);
    if (!rows.length) return <p className="move-muted">Nothing to move.</p>;
    return (
        <ul className="move-counts">
            {rows.map(([key, one, many]) => <li key={key}><strong>{counts[key]}</strong> {counts[key] === 1 ? one : many}</li>)}
        </ul>
    );
}

const host = (origin: string) => origin.replace(/^https?:\/\//, '');

export function MovePage() {
    useStore();
    return <section className="move-page" aria-labelledby="move-title">{isOldSite() ? <MoveOut /> : <MoveIn />}</section>;
}

function MoveOut() {
    const s = moveOut;
    return (
        <>
            <img className="move-logo" src="assets/woogidex_icon.png" alt="Woogidex" width="72" height="72" />
            <h1 id="move-title">Woogidex is now at {host(NEW_ORIGIN)}</h1>
            <p>Your browser keeps this collection for this address only. Move it once, and it is on {host(NEW_ORIGIN)} too. This copy stays here as it is.</p>
            <h2 className="move-sub">In this browser</h2>
            <Counts counts={outCounts()} />
            {s.step === 'done' ? (
                <div className="move-result" role="status">
                    <p><Icon name="check-circle" size={18} /> Done. Your data is on {host(NEW_ORIGIN)}.</p>
                    <a className="btn btn-primary" href={newAddress()}>Open {host(NEW_ORIGIN)}</a>
                </div>
            ) : (
                <div className="move-actions">
                    <button type="button" className="btn btn-primary" onClick={startMoveOut} disabled={s.step === 'waiting'}>
                        {s.step === 'waiting' ? 'Finish in the new tab…' : s.step === 'error' ? 'Try again' : 'Move my data'}
                    </button>
                    <a className="btn btn-secondary" href={newAddress()}>Go to {host(NEW_ORIGIN)} without it</a>
                </div>
            )}
            {s.step === 'waiting' && <p className="move-muted" role="status">A {host(NEW_ORIGIN)} tab opened. Check what it shows, then confirm there.</p>}
            {s.step === 'error' && <p className="move-error" role="alert">{s.error}</p>}
            <p className="move-muted">Signed in? Sign in again on {host(NEW_ORIGIN)}. To read your messages there, unlock them with your message PIN.</p>
        </>
    );
}

function MoveIn() {
    useEffect(() => { startMoveIn(); }, []);
    const s = moveIn;
    return (
        <>
            <h1 id="move-title">Move your data here</h1>
            {s.step === 'no-opener' && (
                <>
                    <p>Start the move from the old address, in the browser that has your collection.</p>
                    <a className="btn btn-primary" href={`${OLD_ORIGIN}/`}>Open {host(OLD_ORIGIN)}</a>
                </>
            )}
            {s.step === 'waiting' && <p className="move-muted" role="status">Waiting for {host(OLD_ORIGIN)}…</p>}
            {(s.step === 'confirm' || s.step === 'moving') && s.payload && (
                <>
                    <p>{host(OLD_ORIGIN)} sent this:</p>
                    <Counts counts={countPayload(s.payload)} />
                    {s.already
                        ? <p>This move is already here. Confirm to finish, nothing is added twice.</p>
                        : <p>It is added to what is on this site. Nothing here is replaced or removed. An item that is here already with other content comes in as a copy.</p>}
                    <div className="move-actions">
                        <button type="button" className="btn btn-primary" onClick={applyMoveIn} disabled={s.step === 'moving'}>{s.step === 'moving' ? 'Moving…' : 'Move it here'}</button>
                        <button type="button" className="btn btn-secondary" onClick={() => window.close()} disabled={s.step === 'moving'}>Cancel</button>
                    </div>
                </>
            )}
            {s.step === 'done' && (
                <div className="move-result" role="status">
                    <p><Icon name="check-circle" size={18} /> Done.{s.result && ` ${s.result.added} added${s.result.same ? `, ${s.result.same} already here` : ''}${s.result.copied ? `, ${s.result.copied} added as copies` : ''}.`}</p>
                    <a className="btn btn-primary" href="/collection">Open my collection</a>
                </div>
            )}
            {s.step === 'error' && <p className="move-error" role="alert">{s.error}</p>}
        </>
    );
}
