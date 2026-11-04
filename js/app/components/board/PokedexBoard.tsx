// The Pokédex board: one Fakémon laid out like a page of the Pokédex. The
// editor's Preview tab, the quick preview, the Community Hub page and the
// PNG export all draw it; it lays itself out by its own width (container
// queries in css/pokedex-board.css), never the window's, so all of them agree.
//
// The board is given a model (boardModel() in js/editor/editor-core.ts) and
// the parts that differ between its homes: how artwork is drawn (the
// Community Hub shields it), the evolution chain, the forme tabs, and a line
// under the title (who published it).

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { setPreviewArtIndex, setPreviewArtSet, type ArtImage, type ArtKind } from '../../../editor/art-sets.ts';
import { ArtViewer, artFrames } from './ArtViewer.tsx';
import { Link, profilePath } from '../Link.tsx';

export interface BoardModel {
    name: string; species: string; type1: string; type2: string; number: string;
    stats: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>; bst: number;
    facts: Array<[string, string]>;
    gender: { genderless: boolean; male: number; female: number; label: string };
    abilities: Array<{ name: string; role: string; isCustom: boolean; desc: string; art: string }>;
    dexEntries: string[];
    moves: Record<'physical' | 'special' | 'status', Array<{ name: string; category: string; faded: boolean; art: string }>>;
    customMoves: Array<{ index: number; name: string; type: string; desc: string; stats: string; flags: string[] }>;
    sets: Array<{ name: string; text: string }>;
    artwork: string; shinyArtwork: string; cry: string; artCredit: string;
    artMode: 'normal' | 'shiny';
    /** how the main artwork scales (css/protect.css); each gallery set has its own */
    artScaling: 'pixel' | 'smooth';
    /** every artwork set with a picture in it, the main one first (js/editor/art-sets.ts) */
    gallery: Array<{ id: string; kind: ArtKind; title: string; scaling: 'pixel' | 'smooth'; images: ArtImage[] }>;
    /** the set shown, and which of its concept images */
    artSet: string;
    artIndex: number;
}

const STAT_ROWS: Array<[keyof BoardModel['stats'], string]> = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
const CATEGORY_TITLE: Record<string, string> = { physical: 'Physical', special: 'Special', status: 'Status' };

/** One credit: a URL in it is a link (it shows its own address), an @name links to that profile. */
function CreditText({ credit }: { credit: string }) {
    const parts: ReactNode[] = [];
    // the same @name rule the server's mentions use (mentioned_names)
    const re = /(https?:\/\/[^\s]+)|(^|[^A-Za-z0-9_@/])@([A-Za-z0-9_]{3,20})/gi;
    let at = 0, m: RegExpExecArray | null;
    while ((m = re.exec(credit))) {
        if (m[1]) {
            parts.push(credit.slice(at, m.index));
            const label = m[1].replace(/^https?:\/\//i, '').replace(/\/$/, '');
            parts.push(<a key={m.index} href={m[1]} target="_blank" rel="noopener noreferrer">{label}</a>);
        } else {
            const start = m.index + m[2].length;
            parts.push(credit.slice(at, start));
            parts.push(<Link key={m.index} to={profilePath(m[3])} className="board-credit-mention">@{m[3]}</Link>);
        }
        at = re.lastIndex;
    }
    parts.push(credit.slice(at));
    return <>{parts}</>;
}

/** The credits of what is on screen, each one time. */
function ArtCredits({ images }: { images: ArtImage[] }) {
    const credits = [...new Set(images.map(i => i.credit || '').filter(Boolean))];
    if (!credits.length) return null;
    return (
        <p className="board-artwork-credit">
            <Icon name="paint-brush" size={13} />
            <span>{credits.map((c, i) => <span key={c}>{i > 0 && ' · '}<CreditText credit={c} /></span>)}</span>
        </p>
    );
}

const SHINY_OF: Record<string, string> = { normal: 'shiny', front: 'shinyFront', back: 'shinyBack' };

/**
 * The artwork corner: the chosen set, a shiny and a cry button, the set
 * switcher when there is more than one set, and the credits of what shows.
 */
function BoardArt({ m, renderArt, onToggleShiny }: { m: BoardModel; renderArt?: (src: string, alt: string) => ReactNode; onToggleShiny: () => void }) {
    const set = m.gallery.find(g => g.id === m.artSet) || m.gallery[0];
    const kind: ArtKind = set?.kind || 'official';
    const hasShiny = !!set?.images.some(i => Object.values(SHINY_OF).includes(i.slot));
    const shiny = m.artMode === 'shiny' && hasShiny;
    const pick = (slot: string) => (shiny && set?.images.find(i => i.slot === SHINY_OF[slot])) || set?.images.find(i => i.slot === slot);
    const draw = (img: ArtImage | undefined, alt: string) => img ? (renderArt ? renderArt(img.src, alt) : <img src={img.src} alt={alt} />) : null;
    const index = set ? Math.min(m.artIndex, set.images.length - 1) : 0;
    // a sprite set shows one side at a time; the turn button flips it
    const [backSide, setBackSide] = useState(false);
    useEffect(() => { setBackSide(false); }, [set?.id]);
    const hasBothSides = kind === 'sprites' && !!pick('front') && !!pick('back');
    // the art viewer (./ArtViewer.tsx): open on the picture that shows
    const [viewing, setViewing] = useState<number | null>(null);
    const side = kind !== 'sprites' ? '' : (backSide && pick('back')) || !pick('front') ? 'back' : 'front';
    let shown: ArtImage[] = [];
    let body: ReactNode;
    const frames = artFrames(m.gallery);
    // the viewer's picture for what the board shows (its shiny goes with its normal one)
    const openAt = (img: ArtImage) => Math.max(0, frames.findIndex(f => f.image === img || f.shiny === img));
    if (!set) {
        body = <img className="no-art-placeholder" src="assets/no_art_placeholder.png" alt="No artwork" />;
    } else if (kind === 'sprites') {
        const img = pick(side);
        shown = img ? [img] : [];
        body = draw(img, `${m.name}${shiny ? ' shiny' : ''} ${side} sprite`);
    } else if (kind === 'concept') {
        shown = set.images[index] ? [set.images[index]] : [];
        body = draw(set.images[index], `${m.name} concept art`);
    } else if (kind === 'icon') {
        const img = pick('icon');
        shown = img ? [img] : [];
        body = draw(img, `${m.name} icon`);
    } else {
        // the main set can hold only a shiny: show it rather than an empty frame
        const img = pick('normal') || set.images[0];
        shown = img ? [img] : [];
        body = draw(img, `${m.name}${shiny ? ' shiny' : ''} artwork`);
    }
    return (
        <div className="board-artwork-left">
            <div className={`board-artwork-frame board-art-${kind}`}>
                {(hasShiny || m.cry || hasBothSides) && (
                    <div className="board-artwork-mode" aria-label="Preview controls">
                        {hasShiny && (
                            <button type="button" className={`collection-shiny-toggle board-artwork-shiny-toggle${shiny ? ' active' : ''}`} aria-pressed={shiny}
                                title={shiny ? 'Show normal' : 'Show shiny'} aria-label={shiny ? 'Show normal' : 'Show shiny'}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleShiny(); }}>
                                <Icon name="sparkles" />
                            </button>
                        )}
                        {hasBothSides && (
                            <button type="button" className={`collection-shiny-toggle board-artwork-shiny-toggle${side === 'back' ? ' active' : ''}`} aria-pressed={side === 'back'}
                                title={side === 'back' ? 'Show the front' : 'Show the back'} aria-label={side === 'back' ? 'Show the front sprite' : 'Show the back sprite'}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setBackSide(b => !b); }}>
                                <Icon name="arrow-path" />
                            </button>
                        )}
                        {m.cry && (
                            <button type="button" className="collection-shiny-toggle board-artwork-shiny-toggle board-artwork-cry-toggle" title="Play Pokemon cry" aria-label="Play Pokemon cry"
                                onClick={e => api.playPokemonCry(e)}>
                                <Icon name="volume-2" />
                            </button>
                        )}
                    </div>
                )}
                {/* keyed by what shows, so a switch replays the crossfade (css/pokedex-board.css).
                    A click opens the art viewer. */}
                {set && shown.length
                    ? <div key={`${set.id}:${shiny}:${index}:${side}`} className="board-artwork-image is-viewable" data-scaling={set.scaling || m.artScaling}
                        role="button" tabIndex={0} aria-label={`View ${m.name}'s artwork larger`} title="View larger"
                        onClick={() => setViewing(openAt(shown[0]))}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(openAt(shown[0])); } }}>{body}</div>
                    : <div key={`${set?.id}:${shiny}:${index}:${side}`} className="board-artwork-image" data-scaling={set?.scaling || m.artScaling}>{body}</div>}
            </div>
            {kind === 'concept' && set && set.images.length > 1 && (
                <div className="board-art-thumbs" role="group" aria-label="Concept art">
                    {set.images.map((img, i) => (
                        <button key={i} type="button" className={`board-art-thumb${i === index ? ' active' : ''}`}
                            aria-label={`Concept art ${i + 1}`} aria-pressed={i === index} onClick={() => setPreviewArtIndex(i)}>
                            {draw(img, '')}
                        </button>
                    ))}
                </div>
            )}
            {m.gallery.length > 1 && (
                <div className="board-art-sets" role="group" aria-label="Artwork sets">
                    {m.gallery.map(g => (
                        <button key={g.id} type="button" className={`board-art-set${g.id === set?.id ? ' active' : ''}`} aria-pressed={g.id === set?.id}
                            onClick={() => setPreviewArtSet(g.id)}>{g.title}</button>
                    ))}
                </div>
            )}
            <ArtCredits images={shown} />
            {shown.filter(i => i.description).map(i => <p key={i.slot + i.src.length} className="board-artwork-description">{i.description}</p>)}
            {viewing !== null && (
                <ArtViewer name={m.name} frames={frames} start={viewing} startShiny={shiny} onClose={() => setViewing(null)}
                    draw={(src, alt) => (renderArt ? renderArt(src, alt) : <img src={src} alt={alt} draggable={false} />)} />
            )}
        </div>
    );
}

function TypeBadge({ type }: { type: string }) {
    return type ? <span className={`type-badge type-${type.toLowerCase()}`}>{type}</span> : null;
}

export function PokedexBoard({ model: m, id, renderArt, underTitle, formeTabs, evolution, onToggleShiny, onMove, onCustomMove }: {
    model: BoardModel;
    id?: string;
    /** how the artwork itself is drawn; a plain <img> by default */
    renderArt?: (src: string, alt: string) => ReactNode;
    underTitle?: ReactNode;
    formeTabs?: ReactNode;
    evolution?: ReactNode;
    onToggleShiny: () => void;
    onMove?: (name: string) => void;
    onCustomMove?: (index: number, name: string) => void;
}) {
    const hasMoves = m.moves.physical.length + m.moves.special.length + m.moves.status.length + m.customMoves.length > 0;
    const moveClick = onMove || ((name: string) => api.showMoveDetail(name));
    return (
        <article className="pokedex-board" id={id}>
            {formeTabs}
            <header className="board-head">
                <div className="board-title">
                    <h2 className="board-name">{m.name}</h2>
                    {m.species && <p className="board-species">{m.species}</p>}
                    {underTitle}
                    <div className="board-types"><TypeBadge type={m.type1} /><TypeBadge type={m.type2} /></div>
                </div>
                <div className="board-number">{m.number || '#???'}</div>
            </header>

            <div className="board-main">
                <BoardArt m={m} renderArt={renderArt} onToggleShiny={onToggleShiny} />
                <section className="board-block board-facts">
                    <h3 className="board-section-title">Profile</h3>
                    {m.facts.length > 0 && (
                        <dl className="board-facts-grid">
                            {m.facts.map(([k, v]) => <div className="board-data-row" key={k}><dt className="label">{k}</dt><dd className="value">{v}</dd></div>)}
                        </dl>
                    )}
                    <div className="board-gender-compact">
                        <span className="label">Gender</span>
                        <div className="gender-bar">
                            {m.gender.genderless
                                ? <div className="genderless" style={{ width: '100%' }} />
                                : <>{m.gender.male > 0 && <div className="male" style={{ width: `${m.gender.male}%` }} />}{m.gender.female > 0 && <div className="female" style={{ width: `${m.gender.female}%` }} />}</>}
                        </div>
                        <span className="gender-label">{m.gender.label}</span>
                    </div>
                </section>
                {m.abilities.length > 0 && (
                    <section className="board-block board-abilities">
                        <h3 className="board-section-title">Abilities</h3>
                        <div className="board-ability-list">
                            {m.abilities.map(a => (
                                <div key={a.name} className={`board-ability-item${a.isCustom ? ' board-ability-custom' : ''}`}>
                                    <div className="board-ability-name-row">
                                        <span className="ability-name">{a.name}</span>
                                        {a.role && <span className={`board-ability-role ${a.role.toLowerCase()}`}>{a.role}</span>}
                                    </div>
                                    {a.desc && <span className="ability-desc">{a.desc}</span>}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {m.dexEntries.length > 0 && (
                    <section className="board-block board-dex">
                        <h3 className="board-section-title">Pokédex Entries</h3>
                        <div className="dex-entries">{m.dexEntries.map((d, i) => <p className="dex-entry" key={i}>{d}</p>)}</div>
                    </section>
                )}
            </div>

            <div className="board-lower-row">
                <section className="board-section board-stats-narrow">
                    <h3 className="board-section-title">Base Stats</h3>
                    {STAT_ROWS.map(([k, label]) => (
                        <div className="stat-bar-container" key={k}>
                            <span className="stat-label">{label}</span>
                            <span className="stat-value">{m.stats[k]}</span>
                            <div className="stat-bar-bg"><div className={`stat-bar-fill ${k}`} style={{ width: `${Math.min((m.stats[k] / 255) * 100, 100)}%` }} /></div>
                        </div>
                    ))}
                    <div className="board-bst-display"><span className="label">Total</span><span className="value">{m.bst}</span></div>
                </section>
                <div className="board-learnset-slot">
                    {hasMoves && (
                        // category labels are text only: the icons are pokemondb.net images,
                        // which the PNG export can't read cross-origin, so they came out blank
                        <section className="board-section board-learnset-col">
                            <h3 className="board-section-title">Learnset</h3>
                            {(['physical', 'special', 'status'] as const).filter(c => m.moves[c].length).map(c => (
                                <div className={`move-category ${c}`} key={c}>
                                    <div className="move-category-title">{CATEGORY_TITLE[c]}</div>
                                    <div className="move-list">
                                        {m.moves[c].map(t => (
                                            <span key={t.name} className={`move-tag ${c}${t.faded ? ' low-value' : ''}`} onClick={() => moveClick(t.name)}>
                                                {t.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {m.customMoves.map(cm => (
                                <div key={cm.index} className="board-custom-move-item board-custom-move-inline" onClick={() => (onCustomMove ? onCustomMove(cm.index, cm.name) : api.handlePreviewCustomMove(cm.index))}>
                                    <span className={`cm-type type-${cm.type.toLowerCase()}`}>{cm.type}</span>
                                    <div className="cm-body">
                                        <div className="cm-name">{cm.name}</div>
                                        <div className="cm-stats">{cm.stats}</div>
                                        {cm.desc && <div className="cm-desc">{cm.desc}</div>}
                                        {cm.flags.length > 0 && <div className="cm-flags">{cm.flags.map(f => <span className="flag-tidbit" key={f}>{f}</span>)}</div>}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                    {evolution}
                </div>
                {m.sets.length > 0 && (
                    <div className="board-sets-slot">
                        <section className="board-section board-sets-col">
                            <h3 className="board-section-title">Sample Sets</h3>
                            {m.sets.map((set, i) => (
                                <div className="board-set" key={i}>
                                    <div className="board-set-name">{set.name}</div>
                                    <div className="sample-set-output">
                                        <button type="button" className="sample-set-copy" title="Copy to clipboard" aria-label="Copy to clipboard" onClick={() => api.copySampleSetText(set.text)}>
                                            <Icon name="copy" size={14} />
                                        </button>
                                        <span className="sample-set-output-text">{set.text}</span>
                                    </div>
                                </div>
                            ))}
                        </section>
                    </div>
                )}
            </div>
        </article>
    );
}
