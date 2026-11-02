// Settings, as its own page (/settings). A navigation column (search, who
// you are, the sections) beside the open section; on a phone the
// navigation is its own screen and a section slides in over it, the way
// phone settings apps work. Styles: css/settings.css. A host adds sections
// and groups of its own (js/core/extend.ts).

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, state } from '../../core/app.ts';
import { isLowEndDevice } from '../../core/device.ts';
import { Icon } from '../components/Icon.tsx';
import { useStore, useViewShown } from '../store.ts';
import { useSlide } from '../hooks.ts';
import { slideIn } from '../../core/motion.ts';
import { ext, type SettingsGroup as Group, type SettingsItem as Item, type SettingsSection as Section } from '../../core/extend.ts';
import { resetTours } from '../../features/onboarding.ts';
import { LANDING_PAGE } from '../../core/flags.ts';
import { UI_SCALE_DEFAULT, UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP, getUiScale, setUiScale } from '../../core/ui-scale.ts';

// A row: `setting` names a boolean in app.ts's BOOLEAN_SETTINGS (it gets a
// switch); otherwise `control` draws whatever sits on the right. A group is
// titled rows, or draws itself (`render`). Types: js/core/extend.ts.
type SectionKey = string;

const CORE_SECTIONS: Section[] = [
    {
        key: 'appearance', label: 'Appearance', order: 10,
        blurb: 'Theme, motion, and how your collection looks.',
        groups: [
            { id: 'theme', title: 'Theme', render: () => <ThemePicker />, keywords: 'theme dark mode light mode colors night' },
            { id: 'size', title: 'Interface size', render: () => <UiScaleGroup />, keywords: 'interface size zoom scale bigger smaller text font ui accessibility' },
            {
                id: 'effects', title: 'Motion & effects',
                desc: () => isLowEndDevice()
                    ? `This device looks low-powered, so ${LANDING_PAGE ? "the front page's paint smudge starts off and " : ''}flat sprites start on to keep things smooth. Change them whenever you like.`
                    : null,
                items: [
                    { id: 'motion', setting: 'ReduceMotion', label: 'Reduce motion', desc: 'Turn off animations and transitions across the site.' },
                    { id: 'blur', setting: 'OverlayBlur', label: 'Dim effects', desc: 'Darken the page behind the sidebar, modals, and other overlays.' },
                    { id: 'sprites', setting: 'Use2DSprites', label: 'Use 2D sprites', desc: 'Show flat sprites instead of animated 3D models. Lighter on older phones.' },
                    // the landing page's setting shows once the landing page does (js/core/flags.ts)
                    ...(!LANDING_PAGE ? [] : [{ id: 'smudge', setting: 'LandingSmudge', label: 'Paint smudge on the front page', desc: 'Your cursor picks up colors and smears paint across the landing page. Starts off on phones, tablets and low-powered devices, since it draws every frame.' }])
                ]
            },
            {
                id: 'tips', title: 'Tips',
                items: [
                    { id: 'tips-on', setting: 'ShowTips', label: 'Show first-visit tips', desc: 'The short tips that show the first time you open My Collection, the editor, the Community Hub and Events. Turn off to never see them.' },
                    { id: 'tips-reset', label: 'Take the tips again', desc: 'Forget which tips you have seen, so each one shows again the next time you open that part of the site. Turns tips back on if they were off.', control: () => <button type="button" className="btn btn-secondary btn-sm" onClick={() => resetTours()}>Take Tips Again</button> }
                ]
            },
            {
                id: 'cards', title: 'Collection cards',
                items: [
                    { id: 'date', setting: 'ShowCollectionCardDate', label: 'Show creation date on cards', desc: 'Display when each Fakémon was created on its collection card.' }
                ]
            }
        ]
    },
    {
        key: 'editor', label: 'Editor & Tools', order: 20,
        blurb: 'How the Fakémon editor and its helpers behave.',
        groups: [
            {
                id: 'editor', title: 'Editor',
                items: [
                    { id: 'fullscreen', setting: 'EditorFullscreen', label: 'Open the editor full screen', desc: "Use the whole window below the header instead of a side panel. The button in the editor's header switches it too." },
                    { id: 'fade', setting: 'FadeUselessMoves', label: 'Fade out usually useless moves', desc: 'Dim moves in the movepool that rarely see competitive use.' },
                    { id: 'cry', setting: 'AutoplayCry', label: 'Autoplay Pokémon cry', desc: "Play a Fakémon's uploaded cry automatically when you open it to edit or preview." },
                    { id: 'confirm', setting: 'ConfirmBeforeDelete', label: 'Confirm before deleting a Fakémon', desc: 'Ask "Are you sure?" before a delete goes through. Turn off to delete in one click.' }
                ]
            },
            {
                id: 'comparison', title: 'Comparison tools',
                items: [
                    { id: 'bulk', setting: 'IncludeOwnFakemonsInBulkComparison', label: 'Include your Fakémon in Bulk Comparison', desc: 'Let your own collection show up alongside official Pokémon.' },
                    { id: 'recommend', setting: 'IncludeOwnFakemonsInRecommendedMoves', label: 'Include your Fakémon in Recommended Moves', desc: 'Factor your own collection into move recommendations.' }
                ]
            }
        ]
    },
    {
        key: 'data', label: 'Data & Storage', order: 90,
        blurb: 'Your collection on this device, backups, and the safety net.',
        groups: [
            { id: 'device', title: 'This device', render: () => <DeviceGroup />, keywords: 'storage offline space saved browser persistent' },
            {
                id: 'safety', title: 'Safety & recovery',
                items: [
                    { id: 'safety-checks', setting: 'CollectionSafetyChecks', label: 'Collection safety checks', desc: 'Stop saving and warn you when your collection did not load or suddenly looks empty, so nothing overwrites Fakémon that can still be recovered. Only turn this off if the warning keeps coming back after reloading.' },
                    { id: 'lost', label: 'Check for lost Fakémon', text: 'Compares your collection against backup copies and restores anything missing.', desc: <>Compares your collection against this device&rsquo;s backup copies and restores anything missing. If nothing is missing here and you are signed in, it opens your cloud backup so you can check that too.</>, control: () => <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.manualCheckForLostFakemon()}>Check Now</button> },
                    { id: 'export', label: 'Export your collection', desc: 'Download every Fakémon you own as a backup file you can import again later.', control: () => <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.showCollection()}>Go to Collection</button> }
                ]
            }
        ]
    }
];

/** Core's sections and the host's, in order, with the host's extra groups in place. */
function allSections(): Section[] {
    return [...CORE_SECTIONS, ...ext.settingsSections].sort((a, b) => a.order - b.order).map(section => {
        const extra = ext.settingsGroups.filter(g => g.section === section.key);
        if (!extra.length) return section;
        const groups = [...section.groups];
        for (const { group, before } of extra) {
            const at = before ? groups.findIndex(g => g.id === before) : -1;
            if (at < 0) groups.push(group); else groups.splice(at, 0, group);
        }
        return { ...section, groups };
    });
}
const visibleSections = () => allSections().filter(s => !s.when || s.when());
const visibleGroups = (s: Section) => s.groups.filter(g => !g.when || g.when());

/** Phones get the navigation as its own screen; see the page comment. */
function useNarrow() {
    const query = '(max-width: 760px)';
    const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setNarrow(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return narrow;
}

export function SettingsPage() {
    useStore();
    const opened = useViewShown('settings-view');
    const narrow = useNarrow();
    const [section, setSection] = useState<SectionKey>('appearance');
    // phones: the menu, or a section on top of it
    const [inSection, setInSection] = useState(false);
    const [query, setQuery] = useState('');
    const sections = visibleSections();
    const Identity = ext.settingsIdentity;

    // every visit starts on the section it was opened with (the menu, on a
    // phone, unless one was asked for), and refetches what the server knows
    useEffect(() => {
        if (!opened) return;
        const asked = api.takeSettingsTab?.() as SectionKey | '';
        setSection(asked || 'appearance');
        setInSection(!!asked);
        setQuery('');
        for (const fn of ext.settingsOpened) fn();
    }, [opened]);

    // the Account section goes away on sign-out
    const current = sections.find(s => s.key === section) || sections[0];
    const searching = query.trim().length > 0;
    const showMain = !narrow || inSection || searching;
    const showNav = !narrow || (!inSection && !searching) || searching;

    // the section slides in from its place in the menu (up or down, beside
    // the menu), and on a phone a section comes in from the right, the menu
    // back from the left
    const main = useSlide(current.key, sections.map(s => s.key), 'y');
    const root = useRef<HTMLDivElement>(null);
    const wasIn = useRef(inSection);
    useLayoutEffect(() => {
        if (wasIn.current === inSection) return;
        wasIn.current = inSection;
        if (narrow) slideIn(root.current, inSection ? 1 : -1);
    }, [inSection]);

    const open = (key: SectionKey) => {
        setSection(key);
        setInSection(true);
        setQuery('');
        window.scrollTo({ top: 0 });
    };

    return (
        <div ref={root} className={`st${narrow ? ' st-narrow' : ''}${narrow && inSection && !searching ? ' st-in-section' : ''}`}>
            {showNav && (
                <aside className="st-nav" aria-label="Settings sections">
                    <h1 className="st-title">Settings</h1>
                    <SearchBox value={query} onChange={setQuery} />
                    {!searching && Identity && <Identity />}
                    {!searching && (
                        <nav className="st-nav-list">
                            {sections.map(s => (
                                <button key={s.key} type="button"
                                    className={`st-nav-item${!narrow && s.key === current.key ? ' is-active' : ''}`}
                                    aria-current={!narrow && s.key === current.key ? 'page' : undefined}
                                    onClick={() => open(s.key)}>
                                    <span className="st-nav-text">
                                        <span className="st-nav-label">{s.label}</span>
                                    </span>
                                    <Icon name="chevron-right" size={16} className="st-nav-chevron" />
                                </button>
                            ))}
                        </nav>
                    )}
                </aside>
            )}

            {showMain && (
                <main className="st-main" ref={narrow ? undefined : main}>
                    {searching
                        ? <SearchResults query={query} sections={sections} onOpen={open} />
                        : <SectionView key={current.key} section={current} onBack={narrow ? () => setInSection(false) : undefined} />}
                </main>
            )}
        </div>
    );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <label className="st-search">
            <Icon name="magnifying-glass" size={16} />
            <input type="search" placeholder="Search settings" value={value} autoComplete="off"
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
                aria-label="Search settings" />
            {value && <button type="button" className="st-search-clear" onClick={() => onChange('')} aria-label="Clear search"><Icon name="x-mark" size={14} /></button>}
        </label>
    );
}

function SectionView({ section, onBack }: { section: Section; onBack?: () => void }) {
    return (
        <>
            <header className="st-head">
                {onBack && <button type="button" className="btn btn-secondary btn-icon btn-sm st-back" onClick={onBack} aria-label="All settings"><Icon name="arrow-left" size={16} /></button>}
                <span className="st-head-text">
                    <h2>{section.label}</h2>
                    <p>{section.blurb}</p>
                </span>
            </header>
            {visibleGroups(section).map(g => <GroupView key={g.id} group={g} />)}
        </>
    );
}

export function GroupHead({ title, desc }: { title: string; desc?: ReactNode }) {
    return (
        <div className="st-group-head">
            <h3>{title}</h3>
            {desc && <p>{desc}</p>}
        </div>
    );
}

function GroupView({ group, items }: { group: Group; items?: Item[] }) {
    if (group.render) return <>{group.render()}</>;
    return (
        <section className="st-group">
            <GroupHead title={group.title} desc={group.desc?.()} />
            <div className="st-card">
                {(items || group.items || []).map(item => <Row key={item.id} item={item} />)}
            </div>
        </section>
    );
}

function Row({ item }: { item: Item }) {
    const labelId = useId();
    if (item.setting) {
        const on = !!api[`get${item.setting}`]?.();
        return (
            <label className={`st-row${on ? ' is-on' : ''}`}>
                <span className="st-row-text">
                    <span className="st-label" id={labelId}>{item.label}</span>
                    <span className="st-desc">{item.desc}</span>
                </span>
                <Switch checked={on} labelledBy={labelId} onChange={v => api[`set${item.setting}`]?.(v)} />
            </label>
        );
    }
    return (
        <div className={`st-row st-row-static${item.tone === 'danger' ? ' is-danger' : ''}`}>
            <span className="st-row-text">
                <span className="st-label">{item.label}</span>
                <span className="st-desc">{item.desc}</span>
            </span>
            {item.control && <span className="st-row-control">{item.control()}</span>}
        </div>
    );
}

export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (on: boolean) => void; labelledBy?: string }) {
    return (
        <span className="st-switch">
            <input type="checkbox" role="switch" checked={checked} aria-labelledby={labelledBy} onChange={e => onChange(e.target.checked)} />
            <span className="st-switch-track" aria-hidden="true" />
        </span>
    );
}

// ---- search ----

function SearchResults({ query, sections, onOpen }: { query: string; sections: Section[]; onOpen: (key: SectionKey) => void }) {
    const q = query.trim().toLowerCase();
    const hits = useMemo(() => sections.map(section => {
        const groups = visibleGroups(section).map(group => {
            const groupHit = [group.title, group.keywords].join(' ').toLowerCase().includes(q);
            if (group.render) return groupHit ? { group, items: undefined } : null;
            const items = (group.items || []).filter(i => groupHit
                || [i.label, typeof i.desc === 'string' ? i.desc : '', i.text].join(' ').toLowerCase().includes(q));
            return items.length ? { group, items } : null;
        }).filter(Boolean) as Array<{ group: Group; items?: Item[] }>;
        return { section, groups };
    }).filter(r => r.groups.length), [q, sections]);

    if (!hits.length) {
        return (
            <div className="st-empty">
                <h2>No settings match &ldquo;{query.trim()}&rdquo;</h2>
                <p>Try a shorter word, like &ldquo;dark&rdquo;, &ldquo;backup&rdquo; or &ldquo;motion&rdquo;.</p>
            </div>
        );
    }
    return (
        <>
            <header className="st-head">
                <span className="st-head-text">
                    <h2>Results for &ldquo;{query.trim()}&rdquo;</h2>
                    <p>Change them right here, or open the section they belong to.</p>
                </span>
            </header>
            {hits.map(({ section, groups }) => (
                <div key={section.key} className="st-result">
                    <button type="button" className="st-result-section" onClick={() => onOpen(section.key)}>
                        {section.label}<Icon name="chevron-right" size={14} />
                    </button>
                    {groups.map(({ group, items }) => <GroupView key={group.id} group={group} items={items} />)}
                </div>
            ))}
        </>
    );
}

// ---- appearance: theme ----

const THEMES = [
    { dark: false, label: 'Light', note: 'Bright and clean. Easy to read in daylight.' },
    { dark: true, label: 'Dark', note: 'Easy on the eyes at night.' }
];

function ThemePicker() {
    const dark = !!api.isDarkModeEnabled?.();
    return (
        <section className="st-group">
            <GroupHead title="Theme" />
            <div className="st-themes" role="radiogroup" aria-label="Theme">
                {THEMES.map(t => {
                    const selected = t.dark === dark;
                    return (
                        <button key={t.label} type="button" role="radio" aria-checked={selected}
                            className={`st-theme${selected ? ' is-selected' : ''}`} data-preview={t.dark ? 'dark' : 'light'}
                            onClick={() => { if (!selected) api.toggleDarkMode(); }}>
                            <span className="st-theme-art" aria-hidden="true">
                                <span className="mk-header"><span className="mk-logo" /><span className="mk-pill" /></span>
                                <span className="mk-body">
                                    <span className="mk-side"><span /><span /><span /></span>
                                    <span className="mk-grid">
                                        {[0, 1, 2].map(i => <span key={i} className="mk-card"><span className="mk-art" /><span className="mk-line" /><span className="mk-line mk-line-short" /></span>)}
                                    </span>
                                </span>
                            </span>
                            <span className="st-theme-caption">
                                <span className="st-radio" aria-hidden="true" />
                                <span className="st-theme-text"><strong>{t.label}</strong><small>{t.note}</small></span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

// ---- appearance: interface size ----

/** A slider for the whole site's size (js/core/ui-scale.ts). It applies when you let go, so the slider doesn't move under your finger. */
function UiScaleGroup() {
    const [value, setValue] = useState(getUiScale);
    const commit = (n: number) => { setValue(n); if (n !== getUiScale()) setUiScale(n); };
    const labelId = useId();
    const marks = [UI_SCALE_MIN, 90, UI_SCALE_DEFAULT, 110, 120, UI_SCALE_MAX];
    return (
        <section className="st-group">
            <GroupHead title="Interface size" desc="Make everything on the site bigger or smaller. Your browser's own zoom still works on top of it." />
            <div className="st-card">
                <div className="st-row st-row-static st-scale-row">
                    <span className="st-row-text">
                        <span className="st-label" id={labelId}>Size</span>
                        <span className="st-desc">Text, buttons, cards and menus all scale together.</span>
                    </span>
                    <span className="st-row-control st-scale-value">
                        <output aria-live="polite">{value}%</output>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={value === UI_SCALE_DEFAULT} onClick={() => commit(UI_SCALE_DEFAULT)}>Reset</button>
                    </span>
                </div>
                <div className="st-scale">
                    <span className="st-scale-a is-small" aria-hidden="true">A</span>
                    <input type="range" min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={UI_SCALE_STEP} value={value} aria-labelledby={labelId}
                        aria-valuetext={`${value}%`} list="st-scale-marks"
                        style={{ '--fill': `${((value - UI_SCALE_MIN) / (UI_SCALE_MAX - UI_SCALE_MIN)) * 100}%` } as React.CSSProperties}
                        onChange={e => setValue(Number(e.target.value))}
                        onPointerUp={e => commit(Number((e.target as HTMLInputElement).value))}
                        onKeyUp={e => commit(Number((e.target as HTMLInputElement).value))}
                        onBlur={e => commit(Number(e.target.value))} />
                    <span className="st-scale-a is-big" aria-hidden="true">A</span>
                    <datalist id="st-scale-marks">{marks.map(m => <option key={m} value={m} />)}</datalist>
                </div>
            </div>
        </section>
    );
}

// ---- data: this device ----

function formatBytes(n: number) {
    if (!n) return '0 MB';
    const mb = n / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** What the browser says about this site's storage. Read once per visit. */
function useStorageStatus() {
    const [status, setStatus] = useState<{ persisted: boolean | null; usage: number | null }>({ persisted: null, usage: null });
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let live = true;
        (async () => {
            const s = navigator.storage;
            const persisted = s?.persisted ? await s.persisted().catch(() => null) : null;
            const est = s?.estimate ? await s.estimate().catch(() => null) : null;
            if (live) setStatus({ persisted, usage: est?.usage ?? null });
        })();
        return () => { live = false; };
    }, [tick]);
    return { ...status, refresh: () => setTick(t => t + 1) };
}

function useOnline() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(navigator.onLine);
        window.addEventListener('online', on);
        window.addEventListener('offline', on);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
    }, []);
    return online;
}

function Status({ tone, children }: { tone: 'good' | 'wait' | 'off'; children: ReactNode }) {
    return <span className={`st-status is-${tone}`}><span className="st-status-dot" />{children}</span>;
}

function DeviceGroup() {
    const storage = useStorageStatus();
    const online = useOnline();
    const offlineReady = !!navigator.serviceWorker?.controller;
    const count = (list: unknown[] | undefined, one: string, many: string) => {
        const n = (list || []).length;
        return `${n} ${n === 1 ? one : many}`;
    };
    const saved = [
        count(state.fakemonDB, 'Fakémon', 'Fakémon'),
        count(state.customMoves, 'custom move', 'custom moves'),
        count(state.customAbilities, 'ability', 'abilities'),
        count(state.customItems, 'item', 'items')
    ].join(' · ');
    const protect = async () => {
        const granted = await api.requestPersistentStorage?.();
        storage.refresh();
        api.showToast?.(granted
            ? 'Done. Your browser will keep your collection even when space runs low.'
            : "Your browser said no for now. It usually agrees once you've used the site a few times, or after you add it to your home screen.", granted ? 'success' : 'info');
    };
    return (
        <section className="st-group">
            <GroupHead title="This device" desc="Your collection lives in this browser, not on our server." />
            <div className="st-card">
                <div className="st-row st-row-static">
                    <span className="st-row-text">
                        <span className="st-label">Saved here</span>
                        <span className="st-desc st-figures">{saved}{storage.usage != null && <> · {formatBytes(storage.usage)} used</>}</span>
                    </span>
                </div>
                <div className={`st-row st-row-static${storage.persisted ? ' is-on' : ''}`}>
                    <span className="st-row-text">
                        <span className="st-label">Protected from cleanup</span>
                        <span className="st-desc">{storage.persisted
                            ? "Your browser won't clear this site's data to free up space."
                            : 'When space runs low, some browsers clear site data, collection included. Ask yours to keep it, and export a backup now and then.'}</span>
                    </span>
                    <span className="st-row-control">
                        {storage.persisted === null ? <Status tone="off">Unknown</Status>
                            : storage.persisted ? <Status tone="good">Protected</Status>
                                : <button type="button" className="btn btn-secondary btn-sm" onClick={protect}>Protect</button>}
                    </span>
                </div>
                <div className={`st-row st-row-static${offlineReady ? ' is-on' : ''}`}>
                    <span className="st-row-text">
                        <span className="st-label">Works offline</span>
                        <span className="st-desc">{offlineReady
                            ? 'Your collection, the editor, analysis and exports all work without a connection. Community, messages and battles need one.'
                            : import.meta.env.PROD
                                ? 'Getting ready. Keep the site open for a moment while you have a connection.'
                                : 'Offline support only runs on the built site, not the development server.'}</span>
                    </span>
                    <span className="st-row-control">
                        {!online ? <Status tone="wait">You're offline</Status> : offlineReady ? <Status tone="good">Ready</Status> : <Status tone="off">Not yet</Status>}
                    </span>
                </div>
            </div>
        </section>
    );
}
