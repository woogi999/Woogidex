// Quick search: Ctrl+K (⌘K on a Mac) opens a search box in the middle of the
// screen from anywhere, even from inside a text field. It searches what the
// header's box searches (js/features/search.ts) and runs the picked result.
// The right-click menu opens it too (js/app/components/ContextMenu.tsx), with
// the selected text already typed in.
//
// Text that starts with "/" is a quick command instead (js/features/commands.ts):
// "/" alone lists them, and a command's result shows as you type. The "/" key
// opens the box with the "/" already typed.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { state } from '../../core/app.ts';
import { log } from '../../core/log.ts';
import { reducedMotion } from '../../core/motion.ts';
import { openSearchPage } from '../../features/global-search.ts';
import { COMMUNITY_DROPDOWN_LIMIT, PEOPLE_DROPDOWN_LIMIT, communityResults, localGroups, peopleResults, quickResults, type SearchResult } from '../../features/search.ts';
import { Icon } from '../components/Icon.tsx';
import { SearchRow } from '../components/SearchRow.tsx';
import { MOD_KEY, setQuickSearch } from '../components/ContextMenu.tsx';
import { api } from '../../core/app.ts';
import { parseCommand, runInput, suggest } from '../../features/commands.ts';
import type { Result, Row } from '../../features/commands-model.ts';
import { COMMAND_ICONS, CommandBody, CommandRow } from './CommandResult.tsx';

const LIMIT = 6;
const COMMUNITY_DEBOUNCE_MS = 250;

type Group = [string, SearchResult[]];

export function QuickSearch() {
    const [open, setOpen] = useState(false);
    const [seed, setSeed] = useState('');
    const opener = useRef<Element | null>(null);

    useEffect(() => {
        const show = (text = '') => {
            opener.current = document.activeElement;
            setSeed(text);
            setOpen(true);
        };
        setQuickSearch(show);
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(was => { if (!was) { opener.current = document.activeElement; setSeed(''); } return !was; });
            }
        };
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('keydown', onKey); setQuickSearch(null); };
    }, []);

    if (!open) return null;
    return <Palette seed={seed} onClose={() => {
        setOpen(false);
        // back to where the keyboard was, unless the picked result moved it
        const el = opener.current;
        if (el instanceof HTMLElement && el.isConnected && document.activeElement === document.body) el.focus({ preventScroll: true });
    }} />;
}

function Palette({ seed, onClose }: { seed: string; onClose: () => void }) {
    const layer = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const closing = useRef(false);
    const [text, setText] = useState(seed);
    const [active, setActive] = useState(0);
    const [community, setCommunity] = useState<{ query: string; list: SearchResult[]; people: SearchResult[]; status: string }>({ query: '', list: [], people: [], status: '' });
    const query = text.trim();

    // in: the page dims and the box drops into place
    useLayoutEffect(() => {
        input.current?.focus();
        input.current?.select();
        document.body.classList.add('quick-search-open');
        if (reducedMotion()) gsap.fromTo(layer.current, { opacity: 0 }, { opacity: 1, duration: 0.14 });
        else {
            gsap.timeline()
                .fromTo(layer.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0)
                .fromTo(panel.current, { y: -18, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: 'expo.out', clearProps: 'transform' }, 0);
        }
        return () => document.body.classList.remove('quick-search-open');
    }, []);

    /** Plays the exit, then unmounts. `then` runs straight away, under the exit. */
    function close(then?: () => void) {
        if (closing.current) return;
        closing.current = true;
        then?.();
        if (reducedMotion()) { onClose(); return; }
        gsap.timeline({ onComplete: onClose })
            .to(panel.current, { y: -8, scale: 0.98, opacity: 0, duration: 0.16, ease: 'power2.in' }, 0)
            .to(layer.current, { opacity: 0, duration: 0.18, ease: 'power1.in' }, 0.02);
    }

    // Community Hub posts and people, a moment after typing stops; signed in only
    useEffect(() => {
        if (!query || !state.user) return;
        let live = true;
        const timer = setTimeout(async () => {
            const [mons, people] = await Promise.allSettled([communityResults(query, COMMUNITY_DROPDOWN_LIMIT), peopleResults(query, PEOPLE_DROPDOWN_LIMIT)]);
            let status = '';
            if (mons.status === 'rejected' || people.status === 'rejected') {
                log.warn('SEARCH', 'Quick search: community search failed', { error: String((mons as any).reason || (people as any).reason) });
                status = 'The Community Hub could not be searched right now.';
            }
            if (live) setCommunity({ query, status, list: mons.status === 'fulfilled' ? mons.value : [], people: people.status === 'fulfilled' ? people.value : [] });
        }, COMMUNITY_DEBOUNCE_MS);
        return () => { live = false; clearTimeout(timer); };
    }, [query]);

    useEffect(() => { setActive(0); }, [query]);

    // ---- quick commands ----
    const isCommand = query.startsWith('/');
    const commandList = isCommand ? suggest(query) : [];
    const [result, setResult] = useState<{ input: string; out: Result | null; busy: boolean }>({ input: '', out: null, busy: false });
    useEffect(() => {
        if (!isCommand || commandList.length && !/\s/.test(query)) return;
        let live = true;
        setResult(r => ({ ...r, busy: true }));
        const timer = setTimeout(() => {
            runInput(query).then(out => { if (live) setResult({ input: query, out, busy: false }); })
                .catch(err => { log.error('COMMANDS', 'Command failed', err); if (live) setResult({ input: query, out: { error: 'That command failed. Try again.' }, busy: false }); });
        }, 200);
        return () => { live = false; clearTimeout(timer); };
    }, [query]);

    /** A result row: a move or ability opens its popup, a Pokémon shows its data. */
    function openRow(row: Row) {
        if (row.kind === 'move') close(() => api.showMoveDetail?.(row.title));
        else if (row.kind === 'ability') close(() => api.showAbilityDetail?.(row.title));
        else if (row.kind === 'mon') setText(`/${row.title.startsWith('Weaknesses of ') ? 'weakness' : 'dt'} ${row.title.replace(/^Weaknesses of /, '').replace(/ \(yours\)$/, '')}`);
    }

    if (isCommand) {
        const out = result.input === query ? result.out : null;
        const rows = commandList.length && !/\s/.test(query) ? [] : (out?.rows || []);
        const pick = (i: number) => {
            if (commandList.length && !/\s/.test(query)) { const c = commandList[i]; if (c) setText(`/${c.name} `); return; }
            if (rows[i]) openRow(rows[i]);
        };
        const count = commandList.length && !/\s/.test(query) ? commandList.length : rows.length;
        const sel = Math.min(active, Math.max(0, count - 1));
        const onCmdKey = (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!count) return;
                const next = (sel + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
                setActive(next);
                document.getElementById(`qs-opt-${next}`)?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter' || (e.key === 'Tab' && commandList.length)) { e.preventDefault(); pick(sel); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        return (
            <div ref={layer} className="qs-layer" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
                <div ref={panel} className="qs-panel" role="dialog" aria-modal="true" aria-label="Quick commands" onKeyDown={onCmdKey}>
                    <div className="qs-field">
                        <Icon name="command-line" size={20} />
                        <input ref={input} type="search" placeholder="/ms fire, physical" autoComplete="off" spellCheck={false}
                            role="combobox" aria-expanded="true" aria-controls="qs-results" aria-autocomplete="list" aria-label="Quick command"
                            aria-activedescendant={count ? `qs-opt-${sel}` : undefined}
                            value={text} onChange={e => setText(e.target.value)} />
                        <kbd className="qs-esc" onClick={() => close()}>Esc</kbd>
                    </div>
                    <div ref={list} className="qs-results" id="qs-results" role="listbox" aria-label="Commands" aria-live="polite">
                        {commandList.length > 0 && !/\s/.test(query) ? (
                            <>
                                <div className="gs-group-label">Commands</div>
                                {commandList.map((c, i) => (
                                    <button key={c.name} type="button" id={`qs-opt-${i}`} role="option" aria-selected={i === sel}
                                        className={`gs-item qs-cmd${i === sel ? ' is-active' : ''}`} onClick={() => pick(i)}>
                                        <span className="qs-cmd-icon"><Icon name={COMMAND_ICONS[c.name] || 'command-line'} size={18} /></span>
                                        <span className="gs-text"><span className="gs-title">/{c.name}</span><span className="gs-sub">{c.help}</span><code className="qs-usage">{c.usage}</code></span>
                                    </button>
                                ))}
                            </>
                        ) : (
                            <>
                                {result.busy && !out && <div className="gs-status">Working…</div>}
                                {out?.error && <div className="gs-status qs-cmd-error" role="alert">{out.error}</div>}
                                {out?.head && !out.calc && <div className="gs-group-label">{out.head}</div>}
                                {out && !out.error && <CommandBody out={out} />}
                                {rows.map((r, i) => (
                                    <button key={`${r.title}-${i}`} type="button" id={`qs-opt-${i}`} role="option" aria-selected={i === sel}
                                        className={`gs-item qs-result${i === sel ? ' is-active' : ''}`} onClick={() => pick(i)}>
                                        <CommandRow row={r} />
                                    </button>
                                ))}
                                {!parseCommand(query) && <div className="gs-empty">Type a command, like /dt garchomp or /calc 2 + 2.</div>}
                            </>
                        )}
                    </div>
                    <div className="qs-foot">
                        <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
                        <span><kbd>Enter</kbd> to {commandList.length && !/\s/.test(query) ? 'pick' : 'open'}</span>
                        <button type="button" className="link-btn" onClick={() => setText('')}>Search instead</button>
                    </div>
                </div>
            </div>
        );
    }

    let groups: Group[];
    let status = '';
    if (!query) groups = [['Go to', quickResults()]];
    else {
        const g = localGroups(query, LIMIT);
        const local: Group[] = [['Your Fakémon', g.fakemon], ['Your library', g.library], ['Pages and actions', g.pages]];
        if (!state.user) groups = local;
        else {
            const mine = community.query === query ? community : { list: [], people: [], status: 'Searching the Community Hub…' };
            groups = [local[0], local[1], ['People', mine.people], ['Community Hub', mine.list], local[2]];
            status = mine.status;
        }
    }
    const flat = groups.flatMap(([, rows]) => rows);
    const current = Math.min(active, Math.max(0, flat.length - 1));

    function run(r: SearchResult | undefined, viaLink = false) {
        if (!r) return;
        if (viaLink) { close(() => {}); return; }
        close(() => {
            try { r.run(); } catch (err) { log.error('SEARCH', 'Quick search: result action failed', { title: r.title, error: String(err) }); }
        });
    }

    function onKeyDown(e: React.KeyboardEvent) {
        const move = (to: number) => {
            e.preventDefault();
            if (!flat.length) return;
            const next = (to + flat.length) % flat.length;
            setActive(next);
            document.getElementById(`qs-opt-${next}`)?.scrollIntoView({ block: 'nearest' });
        };
        if (e.key === 'ArrowDown') move(current + 1);
        else if (e.key === 'ArrowUp') move(current - 1);
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey || !flat.length) { if (query) close(() => openSearchPage(text)); }
            else run(flat[current]);
        }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Tab') e.preventDefault();
    }

    let index = 0;
    return (
        <div ref={layer} className="qs-layer" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
            <div ref={panel} className="qs-panel" role="dialog" aria-modal="true" aria-label="Quick search" onKeyDown={onKeyDown}>
                <div className="qs-field">
                    <Icon name="magnifying-glass" size={20} />
                    <input ref={input} type="search" placeholder="Search Fakémon, pages, people… or type / for commands" autoComplete="off" spellCheck={false}
                        role="combobox" aria-expanded="true" aria-controls="qs-results" aria-autocomplete="list" aria-label="Quick search"
                        aria-activedescendant={flat.length ? `qs-opt-${current}` : undefined}
                        value={text} onChange={e => setText(e.target.value)} />
                    <kbd className="qs-esc" onClick={() => close()}>Esc</kbd>
                </div>
                <div ref={list} className="qs-results" id="qs-results" role="listbox" aria-label="Results">
                    {groups.map(([label, rows]) => rows.length > 0 && (
                        <Fragment key={label}>
                            <div className="gs-group-label">{label}</div>
                            {rows.map(r => {
                                const i = index++;
                                return <SearchRow key={`${label}-${i}`} id={`qs-opt-${i}`} result={r} query={query} active={i === current} onPick={(_, viaLink) => run(r, viaLink)} />;
                            })}
                        </Fragment>
                    ))}
                    {status && <div className="gs-status">{status}</div>}
                    {query && !flat.length && !status && <div className="gs-empty">Nothing matches “{query}”.</div>}
                    {query && !state.user && <div className="gs-status">Sign in to search people and Community Hub posts too.</div>}
                </div>
                <div className="qs-foot">
                    <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
                    <span><kbd>Enter</kbd> to open</span>
                    {query && <button type="button" className="link-btn" onClick={() => close(() => openSearchPage(text))}>All results <kbd>{MOD_KEY}+Enter</kbd></button>}
                </div>
            </div>
        </div>
    );
}
