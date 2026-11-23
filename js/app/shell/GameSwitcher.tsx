// The game picker at the top left of the header. Woogidex is for Pokémon
// today. Temtem, Roco Kingdom and Palworld are listed for later: picking one
// shows a "coming soon" window (drawn like the Battle one, battlePaused.tsx)
// and nothing else changes. The icons in public/assets/games/ are each
// game's own app icon from Steam.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../dialogs.tsx';

const GAMES = [
    { key: 'pokemon', name: 'Pokémon', icon: 'assets/games/pokemon.svg', ready: true, what: '' },
    { key: 'temtem', name: 'Temtem', icon: 'assets/games/temtem.png', ready: false, what: 'Temtem' },
    { key: 'roco', name: 'Roco Kingdom', icon: 'assets/games/roco-kingdom.png', ready: false, what: 'creatures' },
    { key: 'palworld', name: 'Palworld', icon: 'assets/games/palworld.png', ready: false, what: 'Pals' }
];

function ComingSoon({ close, game }: DialogProps<{ game: string }>) {
    const g = GAMES.find(x => x.key === game) || GAMES[1];
    return (
        <Modal onClose={close} className="confirm-dialog game-soon" overlayClassName="confirm-dialog-overlay" labelledBy="game-soon-title">
            <div className="confirm-dialog-icon game-soon-icon" aria-hidden="true"><img src={g.icon} alt="" width={44} height={44} /></div>
            <h3 id="game-soon-title">{g.name} is coming soon</h3>
            <p>I want Woogidex to work for {g.name} too. Stuff like your own {g.what}, regions and tier lists, and much more! It isn’t ready yet, so stay tuned ;)</p>
            <div className="confirm-dialog-actions">
                <button type="button" className="btn btn-primary" onClick={close}>Got it</button>
            </div>
        </Modal>
    );
}
registerDialog('game-coming-soon', ComingSoon);

export function GameSwitcher() {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('click', away);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
    }, [open]);
    const current = GAMES[0];
    return (
        <div className="game-switcher" ref={box}>
            <button type="button" className="game-switcher-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)} title="Game" aria-label={`Game: ${current.name}`}>
                <img src={current.icon} alt="" width={16} height={16} />
                <span className="game-switcher-name">{current.name}</span>
                <Icon name="chevron-down" size={12} />
            </button>
            {open && (
                <div className="game-switcher-menu" role="menu">
                    {GAMES.map(g => (
                        <button key={g.key} type="button" role="menuitem" className={g.key === current.key ? 'is-current' : ''}
                            onClick={() => { setOpen(false); if (!g.ready) openDialog('game-coming-soon', { game: g.key }); }}>
                            <img src={g.icon} alt="" width={18} height={18} loading="lazy" />
                            <span>{g.name}</span>
                            {g.key === current.key ? <Icon name="check" size={12} /> : <small>Soon</small>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
