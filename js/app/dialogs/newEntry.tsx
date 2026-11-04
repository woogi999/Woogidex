// The prompt before a new move, ability, item, type or condition: a name, then
// a blank one or an existing one to start from. The Fakémon prompt uses the same
// parts. The seeds are js/features/library-templates.ts.

import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, state } from '../../core/app.ts';
import { NAME_MAX } from '../../core/data.ts';
import { slideIn } from '../../core/motion.ts';
import { buildSeed, LIBRARY_WORDS, templateChoices, type LibraryKind, type TemplateChoice } from '../../features/library-templates.ts';
import { typeBackground, customByName } from '../../features/custom-types.ts';
import { CONDITION_ICON, type ConditionKind } from '../../features/custom-conditions.ts';
import { openDialog, registerDialog, type DialogProps } from '../dialogs.tsx';
import { Icon } from '../components/Icon.tsx';
import { CategoryBadge } from '../components/MoveCategory.tsx';
import { Modal } from '../components/Modal.tsx';
import { useChunks } from '../hooks.ts';

/** One of the two ways to start: an icon, what it is, what it does. */
export function StartOption({ icon, title, note, primary = false, onClick }: { icon: string; title: string; note: string; primary?: boolean; onClick: () => void }) {
    return (
        <button type="button" className={`start-option${primary ? ' is-primary' : ''}`} onClick={onClick}>
            <span className="start-option-icon"><Icon name={icon} size={20} /></span>
            <span className="start-option-text"><strong>{title}</strong><span>{note}</span></span>
            <Icon name="chevron-right" size={16} className="start-option-arrow" />
        </button>
    );
}

/** The first step of every "new" prompt: a name and two ways to start. */
export function StartStep({ id, label, placeholder, maxLength, name, setName, onEnter, children }: {
    id: string; label: string; placeholder: string; maxLength: number; name: string; setName: (v: string) => void; onEnter: () => void; children: ReactNode;
}) {
    return (
        <>
            <div className="form-group start-name">
                <label htmlFor={id}>{label}</label>
                <input id={id} type="text" maxLength={maxLength} placeholder={placeholder} autoComplete="off" autoFocus value={name}
                    onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }} />
            </div>
            <div className="start-options">{children}</div>
        </>
    );
}

function ChoiceMeta({ kind, choice }: { kind: LibraryKind; choice: TemplateChoice }) {
    const d = choice.data;
    if (kind === 'moves') {
        const acc = d.accuracy === true || d.accuracy == null ? '-' : `${d.accuracy}%`;
        return (
            <span className="tpl-meta">
                <span className={`type-pill type-${String(d.type || 'Normal').toLowerCase()}`}>{d.type || 'Normal'}</span>
                <CategoryBadge category={d.category} />
                <span className="tpl-nums">{d.basePower || '-'} BP · {acc} · {d.pp || '-'} PP</span>
            </span>
        );
    }
    return null;
}

function ChoiceMark({ kind, choice }: { kind: LibraryKind; choice: TemplateChoice }) {
    if (kind === 'types') {
        const custom = choice.source === 'yours' ? customByName(choice.name) : null;
        return <span className={`type-pill tpl-type-mark type-${choice.name.toLowerCase()}`} style={custom ? { background: typeBackground(custom) } : undefined}>{choice.name}</span>;
    }
    if (kind === 'conditions') {
        return <span className="tpl-cond-mark" style={{ background: choice.data.color }}><Icon name={CONDITION_ICON[choice.conditionKind as ConditionKind]} size={14} /></span>;
    }
    return null;
}

export function TemplateStep({ kind, name, onPick, busy }: { kind: LibraryKind; name: string; onPick: (c: TemplateChoice) => void; busy: string }) {
    const words = LIBRARY_WORDS[kind];
    const [source, setSource] = useState<'game' | 'yours'>('game');
    const [query, setQuery] = useState('');
    const deferred = useDeferredValue(query);
    const [all] = useState(() => templateChoices(kind));
    const q = deferred.trim().toLowerCase();
    const inSource = all.filter(c => c.source === source);
    const list = q ? inSource.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)) : inSource;
    const shown = useChunks(list.length, `${kind}:${source}:${q}`);
    const yours = all.length - all.filter(c => c.source === 'game').length;
    const hideName = kind === 'types';
    return (
        <div className="tpl-step">
            <div className="tpl-tools">
                <label className="tpl-search">
                    <Icon name="magnifying-glass" size={15} />
                    <input type="search" autoFocus placeholder={`Search ${words.plural}`} aria-label={`Search ${words.plural}`} value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <div className="segmented tpl-source" role="tablist" aria-label="Where it comes from">
                    <button type="button" role="tab" aria-selected={source === 'game'} className={source === 'game' ? 'active' : ''} onClick={() => setSource('game')}>Main games</button>
                    <button type="button" role="tab" aria-selected={source === 'yours'} className={source === 'yours' ? 'active' : ''} onClick={() => setSource('yours')}>Yours{yours ? ` (${yours})` : ''}</button>
                </div>
            </div>
            <p className="tpl-count" aria-live="polite">{list.length} {list.length === 1 ? words.noun : words.plural}{name.trim() ? ` · The new one is called ${name.trim()}` : ''}</p>
            <ul className="tpl-list">
                {list.slice(0, shown).map(c => (
                    <li key={`${c.source}:${c.conditionKind || ''}:${c.id}`}>
                        <button type="button" className="tpl-row" disabled={!!busy} aria-busy={busy === c.id} onClick={() => onPick(c)}>
                            <ChoiceMark kind={kind} choice={c} />
                            <span className="tpl-row-text">
                                {!hideName && <strong>{c.name}</strong>}
                                <ChoiceMeta kind={kind} choice={c} />
                                {c.desc && kind !== 'types' && <span className="tpl-desc">{c.desc}</span>}
                            </span>
                            <span className="tpl-use">{busy === c.id ? 'Reading its code' : 'Use'}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {!list.length && (
                <p className="tpl-empty">
                    {q ? `No ${words.noun} matches "${deferred.trim()}".` : source === 'yours' ? `You have no ${words.plural} yet.` : `The main-game ${words.plural} did not load. Check your connection and try again.`}
                </p>
            )}
        </div>
    );
}

function openEditor(kind: LibraryKind, seed: any, extra: { conditionKind?: ConditionKind; sampleSetTarget?: any }) {
    if (kind === 'moves') openDialog('custom-move', { index: null as any, libraryId: '', seed });
    else if (kind === 'abilities') openDialog('custom-ability', { id: '', seed });
    else if (kind === 'items') openDialog('custom-item', { id: '', seed, sampleSetTarget: extra.sampleSetTarget || null });
    else if (kind === 'types') openDialog('custom-type', { entry: null, seed });
    else openDialog('custom-condition', { entry: null, kind: seed?.kind || extra.conditionKind || 'status', seed });
}

function NewEntryDialog({ kind, conditionKind, sampleSetTarget, close }: DialogProps<{ kind: LibraryKind; conditionKind?: ConditionKind; sampleSetTarget?: any }>) {
    const words = LIBRARY_WORDS[kind];
    const [name, setName] = useState('');
    const [step, setStep] = useState<'start' | 'pick'>('start');
    const [busy, setBusy] = useState('');
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => { if (step === 'pick') slideIn(box.current, 1); }, [step]);

    const blank = () => { const seed = name.trim() ? { name: name.trim() } : null; close(); openEditor(kind, seed, { conditionKind, sampleSetTarget }); };
    const toTemplates = async () => {
        if (kind !== 'types' && kind !== 'conditions' && !state.sdLoaded) await api.fetchShowdownData?.();
        setStep('pick');
    };
    const pick = async (choice: TemplateChoice) => {
        setBusy(choice.id);
        try {
            const seed = await buildSeed(kind, choice, name);
            close();
            openEditor(kind, seed, { conditionKind: choice.conditionKind || conditionKind, sampleSetTarget });
        } catch {
            setBusy('');
            api.showToast?.(`${choice.name} could not be read. Try again, or start blank.`, 'error');
        }
    };

    return (
        <Modal onClose={close} className={`start-modal${step === 'pick' ? ' is-picking' : ''}`} labelledBy="start-modal-title">
            <div className="modal-header">
                {step === 'pick' && <button type="button" className="modal-close start-back" onClick={() => setStep('start')} aria-label="Back"><Icon name="arrow-left" size={18} /></button>}
                <h3 id="start-modal-title">{step === 'start' ? `New ${words.noun}` : `Pick a ${words.noun} to start from`}</h3>
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            <div ref={box}>
                {step === 'start' ? (
                    <StartStep id="new-entry-name" label="Name" placeholder={words.placeholder} maxLength={kind === 'types' ? 16 : kind === 'conditions' ? 24 : NAME_MAX} name={name} setName={setName} onEnter={blank}>
                        <StartOption icon="plus" title="Start blank" note={words.blank} primary onClick={blank} />
                        <StartOption icon="document-duplicate" title={`Use a ${words.noun} as a template`} note={words.template} onClick={toTemplates} />
                    </StartStep>
                ) : (
                    <TemplateStep kind={kind} name={name} onPick={pick} busy={busy} />
                )}
            </div>
        </Modal>
    );
}

registerDialog('library-new', NewEntryDialog);
