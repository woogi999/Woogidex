// Settings > About: who makes Woogidex, attributions and the disclaimer.
// It was the Credits tab of the old Updates & Credits page. Release notes
// are in the Updates dialog (js/app/dialogs/whatsNew.tsx).

import { registerSettingsSection } from '../../core/extend.ts';
import { GroupHead } from './SettingsPage.tsx';

const link = (href: string, name: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="st-about-link">{name}</a>
);

const CREDITS: Array<[string, ReturnType<typeof link> | string]> = [
    ['Created by', link('https://github.com/woogi999', 'Woogi')],
    ['Lead Backend', link('https://github.com/gghrvy', 'gghrvy')],
    ['Placeholder Art & Sprites', 'Enderwither02'],
    ['Type Icons', link('https://github.com/duiker101/pokemon-type-svg-icons', 'duiker101')]
];

function Credits() {
    return (
        <section className="st-group st-about">
            <GroupHead title="Credits" desc="The people who make Woogidex." />
            <dl className="st-about-list">
                {CREDITS.map(([role, who]) => <div key={role}><dt>{role}</dt><dd>{who}</dd></div>)}
            </dl>
        </section>
    );
}

function Legal() {
    return (
        <section className="st-group st-about">
            <GroupHead title="Attributions" />
            <p>Woogidex is a fan-made, unofficial project. Pokémon and related names, characters, and other intellectual property are owned by their respective rights holders.</p>
            <p>Woogidex is not affiliated with, endorsed by, or sponsored by Nintendo, The Pokémon Company, or Game Freak. This project is made for fan and non-commercial purposes.</p>
            <p className="st-about-foot">© 2026 Woogidex · All rights reserved to their respective owners.</p>
        </section>
    );
}

export function registerAboutSettings(): void {
    registerSettingsSection({
        key: 'about', label: 'About', order: 95,
        blurb: 'Who makes Woogidex, and the fine print.',
        groups: [
            { id: 'credits', title: 'Credits', keywords: 'credits about team who made', render: () => <Credits /> },
            { id: 'attributions', title: 'Attributions', keywords: 'attributions disclaimer copyright nintendo legal', render: () => <Legal /> }
        ]
    });
}
