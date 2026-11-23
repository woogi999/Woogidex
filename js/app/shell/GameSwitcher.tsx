// The game picker at the top left of the header. Woogidex is for Pokémon
// today. Temtem and Roco Kingdom are listed for later: picking one shows a
// "coming soon" window and nothing else changes. The icons are in
// public/assets/games/. The Temtem and Roco Kingdom ones are stand-ins: put
// the official logos there (same names, or change `icon` below).

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../dialogs.tsx';

const GAMES = [
    { key: 'pokemon', name: 'Pokémon', icon: 'assets/games/pokemon.svg', ready: true },
    { key: 'temtem', name: 'Temtem', icon: 'assets/games/temtem.svg', ready: false },
    { key: 'roco', name: 'Roco Kingdom', icon: 'assets/games/roco-kingdom.svg', ready: false }
];

function ComingSoon({ close, game }: DialogProps<{ game: string }>) {
    const g = GAMES.find(x => x.key === game) || GAMES[1];
    return (
        <Modal onClose={close} title={`${g.name} is coming soon`} className="game-soon">
            <div className="game-soon-body">
                <img src={g.icon} alt="" width={56} height={56} />
                <p>We want Woogidex to work for {g.name} too: your own creatures, regions and tier lists, the same as for Pokémon. It isn’t ready yet. Stay tuned!</p>
            </div>
            <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={close}>OK</button></div>
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
            <button type="button" className="game-switcher-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)} title="Game">
                <img src={current.icon} alt="" width={20} height={20} />
                <span className="game-switcher-name">{current.name}</span>
                <Icon name="chevron-down" size={14} />
            </button>
            {open && (
                <div className="game-switcher-menu" role="menu">
                    {GAMES.map(g => (
                        <button key={g.key} type="button" role="menuitem" className={g.key === current.key ? 'is-current' : ''}
                            onClick={() => { setOpen(false); if (!g.ready) openDialog('game-coming-soon', { game: g.key }); }}>
                            <img src={g.icon} alt="" width={20} height={20} />
                            <span>{g.name}</span>
                            {g.key === current.key ? <Icon name="check" size={14} /> : <small>Soon</small>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
