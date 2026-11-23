// Pieces of a trainer's profile: their published Fakémon, the comments on
// their page, the badge picker, and the hover card shown over a name.
// Skeletons live beside the real content so the two can't drift in shape.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../core/app.ts';
import { Avatar } from './Avatar.tsx';
import { BadgeIcon, BadgeRow, badgeDefinition } from './Badge.tsx';
import { ArtLoader, ShieldedArt } from './ShieldedArt.tsx';
import { Link, monPath } from './Link.tsx';

export interface PublishedRow { id: string; user_id?: string; published_at?: string; fakemon_data?: { name?: string; type1?: string; type2?: string; artwork?: string }; }

// ==================== published Fakemon ====================

/** Artwork fetched once the card nears the screen (the list query carries none). */
function MonArt({ row }: { row: PublishedRow }) {
    const mon = row.fakemon_data || {};
    // the same batched, cached, masked path as the Community Hub's cards (js/features/community.ts)
    return (
        <ArtLoader as="div" className="profile-mon-art" src={mon.artwork || ''} loadKey={row.id}
            load={() => api.requestCardArtwork ? api.requestCardArtwork(row.id) : Promise.resolve('')}
            alt={`${mon.name || 'Fakémon'} artwork`}
            fallback={<img className="no-art-placeholder" src="assets/no_art_placeholder.png" alt="No artwork" draggable={false} />} />
    );
}

export function TypeBadges({ type1, type2 }: { type1?: string; type2?: string }) {
    return (
        <div className="card-types">
            {type1 && <span className={`type-badge type-${String(type1).toLowerCase()}`}>{type1}</span>}
            {type2 && <span className={`type-badge type-${String(type2).toLowerCase()}`}>{type2}</span>}
        </div>
    );
}

export function ProfileMons({ mons, loading = false, owner = false }: { mons?: PublishedRow[]; loading?: boolean; owner?: boolean }) {
    if (loading) {
        return (
            <>
                {Array.from({ length: 4 }, (_, i) => (
                    <div className="profile-mon-card skel-card" key={i}>
                        <div className="profile-mon-art skel" />
                        <strong className="skel skel-text" style={{ margin: '10px 12px 5px', width: '70%' }} />
                        <div className="card-types"><span className="skel skel-pill" /><span className="skel skel-pill" /></div>
                    </div>
                ))}
            </>
        );
    }
    if (!mons?.length) return <div className="profile-empty">No published Fakemon yet.</div>;
    return (
        <>
            {mons.map(row => {
                const mon = row.fakemon_data || {};
                const card = (
                    <Link key={row.id} to={monPath(row.id)} className="profile-mon-card">
                        <MonArt row={row} />
                        <strong>{mon.name || 'Fakemon'}</strong>
                        <TypeBadges type1={mon.type1} type2={mon.type2} />
                    </Link>
                );
                if (!owner) return card;
                // your own: manage it here (the hub's "My uploads" used to do this)
                return (
                    <div key={row.id} className="profile-mon-owned">
                        {card}
                        <div className="profile-mon-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.openCommunityUpdateModalFor(row.id)}>Update</button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => api.unpublishMon(row.id)}>Unpublish</button>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

// ==================== which badges to show ====================
// Earned badges and displayed badges are different things; this picks the display set.

export function BadgePicker({ owned, selected, onChange }: { owned: string[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
    if (!owned.length) return <div className="profile-badges-empty">You do not have any badges yet.</div>;
    return (
        <>
            {owned.map(key => {
                const b = badgeDefinition(key);
                if (!b) return null;     // a key this copy of the site doesn't know
                return (
                    <label className="profile-badge-option" key={key}>
                        <input type="checkbox" checked={selected.has(key)} onChange={e => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(key); else next.delete(key);
                            onChange(next);
                        }} />
                        <span className="profile-badge-option-icon">
                            <BadgeIcon badge={b} size={24} className="" style={{ color: b.color || 'var(--accent)' }} />
                        </span>
                        <span className="profile-badge-option-copy">
                            <strong>{b.label || key}</strong>
                            <small>{b.tooltip || ''}</small>
                        </span>
                    </label>
                );
            })}
        </>
    );
}

// ==================== banner ====================

// banner presets: name -> CSS background. Stored as "preset:<name>".
export const BANNER_PRESETS: Record<string, string> = {
    sunset: 'linear-gradient(120deg, #ff5f6d, #ffc371)',
    ocean: 'linear-gradient(120deg, #2193b0, #6dd5ed)',
    aurora: 'linear-gradient(120deg, #00c9a7, #845ec2 55%, #d65db1)',
    ember: 'linear-gradient(120deg, #7a1f1f, #e2574c 50%, #f9c74f)',
    forest: 'linear-gradient(120deg, #134e5e, #71b280)',
    cosmic: 'linear-gradient(120deg, #0f0c29, #302b63 50%, #24243e)',
    candy: 'linear-gradient(120deg, #f8a5c2, #a29bfe)',
    stellar: 'linear-gradient(100deg, #f06a8e, #f5a55a 28%, #e8d35a 48%, #6cc8a0 68%, #5d8fe8 88%, #9a6cf0)'
};

/** A profile's banner as a CSS background: a preset, a hex colour, or '' (the caller's default). */
export function bannerBackground(p: any): string {
    const c = String(p?.banner_color || '');
    if (c.startsWith('preset:')) return BANNER_PRESETS[c.slice(7)] || '';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    return '';
}

// ==================== hover card ====================
// A preview of someone without leaving the page, laid out like Discord's
// profile pop-out: the banner, the picture over its lower edge, the badges
// in a strip at the right, the name, then About me and Member since.
// Contents only; js/features/auth.ts positions it against the name.

const safeHex = (v: any) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '');

export function UserHoverCard({ profile = null, loading = false }: { profile?: any; loading?: boolean }) {
    if (loading || !profile) {
        return (
            <div className="uhc">
                <div className="uhc-banner skel" />
                <div className="uhc-avatar-wrap"><div className="uhc-avatar skel skel-circle" /></div>
                <div className="uhc-body">
                    <strong className="skel skel-text" style={{ width: 120, height: 18 }} />
                    <span className="skel skel-text" style={{ width: 80, marginTop: 6 }} />
                    <div className="uhc-section">
                        <span className="skel skel-text" style={{ width: '100%' }} />
                        <span className="skel skel-text" style={{ width: '70%' }} />
                    </div>
                </div>
            </div>
        );
    }
    const name = profile.display_name || profile.username || 'Trainer';
    const accent = safeHex(profile.accent_color);
    const banner = bannerBackground(profile) || accent || '';
    const badges: string[] = Array.isArray(profile.display_badges) ? profile.display_badges : [];
    const since = profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    return (
        <div className="uhc" style={accent ? { ['--uhc-accent' as any]: accent } : undefined}>
            <div className={`uhc-banner${profile.banner_url ? ' has-image' : ''}`} style={banner ? { background: banner } : undefined}>
                {profile.banner_url && <ShieldedArt src={profile.banner_url} className="avatar-art" />}
            </div>
            <div className="uhc-avatar-wrap">
                <div className="uhc-avatar">
                    <Avatar userId={profile.id} url={profile.avatar_url} name={name} className="profile-avatar-img" />
                </div>
                {badges.length > 0 && <div className="uhc-badges"><BadgeRow badgeKeys={badges} size={18} /></div>}
            </div>
            <div className="uhc-body">
                <strong className="uhc-name">{name}</strong>
                <span className="uhc-handle">@{profile.username || ''}{profile.pronouns ? <> · {profile.pronouns}</> : null}</span>
                {profile.bio && (
                    <div className="uhc-section">
                        <h4>About me</h4>
                        <p className="uhc-bio">{profile.bio}</p>
                    </div>
                )}
                {since && (
                    <div className="uhc-section">
                        <h4>Member since</h4>
                        <p>{since}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
