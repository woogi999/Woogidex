// /toolbox: Woogidex's apps, like Facebook's games and widgets. Every app
// works on its own here, inside a group (its Toolbox tab), in a chat, and in
// a post. The first app is the tier maker (its own page, /toolbox/tier-maker,
// js/app/pages/TierMakerPage.tsx). Below the apps: a box to join someone's
// live tier list, and the tier lists saved on this device.

import { useState } from 'react';
import { api } from '../../core/app.ts';
import { useStore } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { openTierMaker } from '../dialogs/tierMaker.tsx';
import { deleteTierList, newTierList, savedTierLists } from '../../features/tier-lists.ts';
import { liveCodeOk } from '../../features/tier-live.ts';

const APPS = [
    {
        key: 'tier-maker', name: 'Tier maker', icon: 'trophy',
        blurb: 'Rank anything: Fakémon, Pokémon, pictures, words. Any tiers you like ("Who would fly the plane?"), or a format’s Showdown tiers. Pyramids, alignment charts, brackets, live voting and more.',
        open: () => openTierMaker(newTierList())
    }
];

export function ToolboxPage() {
    useStore();
    const lists = savedTierLists();
    const [code, setCode] = useState('');
    const join = () => { if (liveCodeOk(code)) api.openPath?.(`toolbox/live/${code.toUpperCase()}`); };
    return (
        <div className="toolbox-page">
            <header className="page-header">
                <div className="page-heading">
                    <h1 className="page-title">Toolbox</h1>
                    <p className="toolbox-sub">Apps for your Fakémon, your groups and your chats. Each group has its own Toolbox tab, too.</p>
                </div>
            </header>
            <section className="toolbox-apps" aria-label="Apps">
                {APPS.map(app => (
                    <button key={app.key} type="button" className="toolbox-app" onClick={app.open}>
                        <span className="toolbox-app-icon"><Icon name={app.icon} size={26} /></span>
                        <span className="toolbox-app-text"><strong>{app.name}</strong><small>{app.blurb}</small></span>
                        <Icon name="arrow-right" size={16} />
                    </button>
                ))}
                <div className="toolbox-app is-soon" aria-disabled="true">
                    <span className="toolbox-app-icon"><Icon name="sparkles" size={26} /></span>
                    <span className="toolbox-app-text"><strong>More apps soon</strong><small>Tell us what you want next in <Link to="settings/about">feedback</Link>.</small></span>
                </div>
            </section>
            <form className="toolbox-join" onSubmit={e => { e.preventDefault(); join(); }}>
                <label htmlFor="toolbox-live-code"><Icon name="signal" size={16} />Join a live tier list</label>
                <input id="toolbox-live-code" value={code} maxLength={6} placeholder="Code, like K7QX2M" autoComplete="off"
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!liveCodeOk(code)}>Join</button>
            </form>
            <section className="toolbox-saved">
                <h2>Your tier lists</h2>
                {!lists.length && <p className="toolbox-empty">Nothing saved on this device yet. Make one with the tier maker.</p>}
                {lists.map(l => (
                    <div key={l.id} className="tm-saved-row">
                        <button type="button" className="tm-saved-open" onClick={() => openTierMaker(l)}>
                            <strong>{l.title}</strong><small>{Object.keys(l.mons).length} in it · {new Date(l.updatedAt).toLocaleDateString()}</small>
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Delete ${l.title}`} onClick={() => deleteTierList(l.id)}><Icon name="trash-2" size={14} /></button>
                    </div>
                ))}
            </section>
        </div>
    );
}
