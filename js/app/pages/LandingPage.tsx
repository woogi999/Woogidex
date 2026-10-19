// The landing page (/), for everyone; My Collection lives at /collection.
// The floating logo and one line sit on the page, then the painting fades in
// as a band across it (LandingArt: day, or night in the dark theme) with the
// buttons on it, and fades back out into an ordinary page built from the
// site's own pieces: a few Fakémon from the Community Hub as landing cards,
// the four things you can do, a short "good to know", and the footer.
// Styles: css/landing.css.
//
// Scrolling stays the browser's: sections fade in as they arrive
// (IntersectionObserver). Nothing listens to the wheel.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { api, state } from '../../core/app.ts';
import { useStore, useViewShown } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { LandingCard, type FeedRow } from '../components/community.tsx';
import { FloatingLogo } from '../components/landing/FloatingLogo.tsx';
import { LandingArt } from '../components/landing/LandingArt.tsx';
import { PaintSmudge } from '../components/landing/PaintSmudge.tsx';

// ---- actions ----
async function makeFakemon() {
    await api.showCollection();
    api.createNewFakemon();
}
const openHub = () => api.openCommunityHub();
const openEvents = () => api.openEvents?.();
const openCollection = () => api.showCollection();

function openPost(row: FeedRow) {
    api.navigateRoute(`community/${row.id}`);
    api.handleCommunityRoute?.(row.id);
}

// ---- the showcase: real Fakémon from the Hub ----
// Signed in, it's the Hub's own "Featured this week", only the ones with
// artwork. Signed out the Hub is closed, so it asks landing_showcase() for a
// few Fakémon their authors made open
// (supabase/migrations/20261020000000_landing_showcase.sql); without that,
// it says what's there and offers a sign-in.
type ShowStatus = 'loading' | 'ready' | 'empty' | 'locked' | 'error';
const SHOW_COUNT = 6;

function useShowcase(): { status: ShowStatus; rows: FeedRow[] } {
    useStore();
    const shown = useViewShown('landing-view') > 0;
    const userId = state.user?.id || '';
    const [show, setShow] = useState<{ status: ShowStatus; rows: FeedRow[] }>({ status: 'loading', rows: [] });
    useEffect(() => {
        if (!shown) return;
        let live = true;
        setShow(s => (s.rows.length ? s : { status: 'loading', rows: [] }));
        (async () => {
            if (userId) {
                await api.fetchCommunityFeed({ quiet: true });
                const cs = api.communityState();
                const mons = cs.mons || [];
                const picks: FeedRow[] = api.featuredThisWeek(mons, SHOW_COUNT * 2);
                const art = await Promise.all(picks.map(r => api.requestCardArtwork?.(r.id).catch(() => '')));
                const rows = picks.filter((_, i) => !!art[i]).slice(0, SHOW_COUNT);
                if (live) setShow({ status: rows.length ? 'ready' : !cs.fetchedAt ? 'error' : 'empty', rows });
                return;
            }
            try {
                const client = await api.getClient();
                const { data, error } = await client.rpc('landing_showcase', { p_limit: SHOW_COUNT });
                if (error) throw error;
                const rows: FeedRow[] = (data || []).map((r: any) => ({
                    id: r.id, user_id: '', published_at: r.activity_at, author_name: r.author_name, open: true,
                    fakemon_data: { name: r.name, number: r.number, type1: r.type1, type2: r.type2, thumbnail: r.thumbnail }
                }));
                if (live) setShow({ status: rows.length ? 'ready' : 'locked', rows });
            } catch {
                if (live) setShow({ status: 'locked', rows: [] });
            }
        })().catch(() => { if (live) setShow({ status: 'error', rows: [] }); });
        return () => { live = false; };
    }, [shown, userId]);
    return show;
}

// sections fade in as they arrive; visible by default if this never runs
function useReveals(root: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const el = root.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        el.classList.add('lp-js');
        const io = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                e.target.classList.add('is-in');
                io.unobserve(e.target);
            }
        }, { threshold: 0.15 });
        el.querySelectorAll('.lp-reveal:not(.is-in)').forEach(n => io.observe(n));
        return () => io.disconnect();
    });
}

// the header's own logo hides while the big one is on screen (css/landing.css .lp-at-top)
function useHeaderLogoAside() {
    useEffect(() => {
        const update = () => {
            if (document.body.dataset.page !== 'landing-view') { document.body.classList.remove('lp-at-top'); return; }
            const logo = document.querySelector('.lp-logo')?.getBoundingClientRect();
            // not laid out yet (at boot the view is still hidden until storage loads): leave it as
            // index.html set it, or the header's logo would flash in and then slide away again
            if (!logo?.height) return;
            const header = document.querySelector('.header')?.getBoundingClientRect().height || 52;
            document.body.classList.toggle('lp-at-top', logo.bottom > header);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        // and whenever the page changes, since arriving here needn't involve a scroll
        const pageWatch = new MutationObserver(() => requestAnimationFrame(update));
        pageWatch.observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            pageWatch.disconnect();
            // the class is left as it is: it only acts on the landing page (css/landing.css), and
            // taking it off here (StrictMode runs this cleanup once at boot) flashed the header's logo
        };
    }, []);
}

export function LandingPage() {
    useStore();
    useHeaderLogoAside();
    const root = useRef<HTMLDivElement>(null);
    const show = useShowcase();
    const visit = useViewShown('landing-view');
    useReveals(root);
    return (
        <div className="lp" ref={root}>
            {/* a fresh sheet of paper every visit: keyed on it, so the old paint goes with the page */}
            {api.getLandingSmudge?.() && <PaintSmudge key={visit} root={root} />}
            <Hero />
            <LandingArt><Actions /></LandingArt>
            <ScrollCue />
            <div className="lp-body">
                <Showcase show={show} />
                <Steps />
                <GoodToKnow />
            </div>
            <Footer />
        </div>
    );
}

function Hero() {
    return (
        <section className="lp-hero" aria-labelledby="lp-title">
            <h1 id="lp-title" className="lp-logo"><FloatingLogo /></h1>
            <p className="lp-tagline">lets you create Fakémon and regions for free.</p>
        </section>
    );
}

function Actions() {
    const count = state.fakemonDB.length;
    return (
        <div className="lp-actions">
            {count > 0 ? (
                <>
                    <button type="button" className="lp-cta" onClick={openCollection}><Icon name="library" />Open my collection</button>
                    <button type="button" className="lp-cta lp-cta-alt" onClick={makeFakemon}><Icon name="plus" />New Fakémon</button>
                </>
            ) : (
                <>
                    <button type="button" className="lp-cta" onClick={makeFakemon}><Icon name="plus" />Make a Fakémon</button>
                    <button type="button" className="lp-cta lp-cta-alt" onClick={openHub}><Icon name="users" />Browse the Hub</button>
                </>
            )}
        </div>
    );
}

/** A little arrow at the foot of the painting, saying there's more below. Gone once you've scrolled. */
function ScrollCue() {
    // once you've scrolled, it's done its job: it doesn't come back this visit
    const [gone, setGone] = useState(false);
    useEffect(() => {
        if (gone) return;
        const onScroll = () => { if (window.scrollY > 80) setGone(true); };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [gone]);
    const go = () => {
        const target = document.querySelector('.lp-body');
        const reduced = document.documentElement.classList.contains('reduce-motion') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    };
    // pinned to the bottom of the screen, so it lives on <body>: the page's enter
    // animation leaves a transform behind, which would pin it to the page instead
    return createPortal(
        <button type="button" className={`lp-scroll${gone ? ' is-gone' : ''}`} onClick={go} aria-label="Scroll down" tabIndex={gone ? -1 : 0}>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 9l7 7 7-7" />
            </svg>
        </button>,
        document.body
    );
}

function Showcase({ show }: { show: { status: ShowStatus; rows: FeedRow[] } }) {
    const signedIn = !!state.user;
    return (
        <section className="panel lp-section lp-reveal" aria-labelledby="lp-show-title">
            <div className="lp-section-head">
                <div>
                    <h2 id="lp-show-title" className="lp-section-title">Fresh from the Community Hub</h2>
                    <p className="lp-section-sub">{signedIn ? 'Featured this week.' : 'Made by people on Woogidex.'}</p>
                </div>
                <button type="button" className="link-btn lp-more" onClick={openHub}>Browse the Hub<Icon name="arrow-right" size={14} /></button>
            </div>
            {show.status === 'loading' && (
                <div className="lp-grid" aria-busy="true">
                    {Array.from({ length: SHOW_COUNT }, (_, i) => (
                        <div className="community-landing-card skel-card" key={i}>
                            <span className="community-landing-art skel" />
                            <span className="skel skel-text" />
                        </div>
                    ))}
                </div>
            )}
            {show.status === 'ready' && (
                <div className="lp-grid">
                    {show.rows.map(row => <LandingCard key={row.id} row={row} onOpen={row.open ? () => openPost(row) : undefined} />)}
                </div>
            )}
            {show.status === 'locked' && (
                <div className="lp-empty">
                    <Icon name="users" size={22} />
                    <p>The Hub is for members. Sign in (it's free) to see what everyone's making.</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => api.openAuthModal('signin')}>Sign In</button>
                </div>
            )}
            {show.status === 'empty' && (
                <div className="lp-empty">
                    <Icon name="sparkles" size={22} />
                    <p>Nothing featured this week yet. Yours could be first.</p>
                </div>
            )}
            {show.status === 'error' && (
                <div className="lp-empty">
                    <Icon name="exclamation-triangle" size={22} />
                    <p>Couldn't reach the Community Hub just now.</p>
                </div>
            )}
        </section>
    );
}

// the four things you can do; every one names something the site really does
const STEPS: Array<{ icon: string; title: string; text: string; action?: [string, () => void] }> = [
    {
        icon: 'pencil-square', title: 'Make a Fakémon',
        text: 'Stats, typing, abilities, moves, Dex entries, art. It can even suggest moves and build a sample set.',
        action: ['Start one', makeFakemon]
    },
    {
        icon: 'squares-2x2', title: 'Get a Pokédex board',
        text: 'It all lands on a board, live. Save it as a PNG or export it for Showdown and Essentials.'
    },
    {
        icon: 'users', title: 'Share it on the Hub',
        text: 'Publish a Fakémon or a whole evolution line for people to react to and comment on.',
        action: ['Browse the Hub', openHub]
    },
    {
        icon: 'trophy', title: 'Enter contests',
        text: 'Community-run events: send an entry, vote, see who won.',
        action: ['See events', openEvents]
    }
];

function Steps() {
    return (
        <section className="panel lp-section lp-reveal" aria-labelledby="lp-steps-title">
            <h2 id="lp-steps-title" className="lp-section-title">What you can do</h2>
            <ul className="lp-steps">
                {STEPS.map(s => (
                    <li key={s.title} className="lp-step">
                        <span className="lp-step-icon"><Icon name={s.icon} size={18} /></span>
                        <span className="lp-step-text">
                            <strong>{s.title}</strong>
                            <span>{s.text}</span>
                        </span>
                        {s.action && <button type="button" className="btn btn-secondary btn-sm" onClick={s.action[1]}>{s.action[0]}</button>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

const NOTES: Array<[string, string]> = [
    ['computer-desktop', 'Your collection lives in your browser. Back it up now and then.'],
    ['shield-check', 'Hub artwork is shielded, and the site asks AI crawlers to keep out.'],
    ['gift', 'Free, and making stuff needs no account.']
];

function GoodToKnow() {
    return (
        <section className="lp-notes lp-reveal" aria-label="Good to know">
            {NOTES.map(([icon, text]) => (
                <p key={icon} className="lp-notice"><Icon name={icon} size={15} /><span>{text}</span></p>
            ))}
        </section>
    );
}

const FOOTER: Array<[string, Array<[string, () => void]>]> = [
    ['Make', [['My Collection', openCollection], ['New Fakémon', makeFakemon], ['Settings', () => api.openSettings()]]],
    ['Community', [['Community Hub', openHub], ['Events', openEvents], ['Updates & credits', () => api.openUpdatesPage()]]],
    ['Help', [['Feedback & bugs', () => api.openFeedbackModal()], ['Community rules', () => api.openCommunityRulesModal()], ['Terms', () => api.openTermsPage()], ['Privacy', () => api.openPrivacyPage()]]]
];

function Footer() {
    return (
        <footer className="lp-foot">
            <div className="lp-foot-inner">
                <div className="lp-foot-brand">
                    <img src="assets/woogidex_logo.png" alt="Woogidex" width="285" height="96" draggable={false} />
                    <p>A free Fakémon maker and community hub. Have fun making weird Pokémon :3</p>
                </div>
                {FOOTER.map(([title, links]) => (
                    <nav key={title} className="lp-foot-col" aria-label={title}>
                        <h3>{title}</h3>
                        <ul>{links.map(([label, run]) => <li key={label}><button type="button" onClick={() => run()}>{label}</button></li>)}</ul>
                    </nav>
                ))}
            </div>
            <div className="lp-foot-bar">
                <span>© {new Date().getFullYear()} Woogidex</span>
                <span>A fan project, not affiliated with Nintendo, Game Freak or The Pokémon Company.</span>
            </div>
        </footer>
    );
}
