// A tier list inside a post or a chat message: its name, size and top
// tiers, and a button that opens it in the tier maker. The list is someone
// else's data, so it arrives already checked by cleanTierList.

import { Icon } from './Icon.tsx';
import { changelog, type TierList } from '../../features/tier-lists.ts';

export function TierListCard({ list, by, action = 'Open in the tier maker', onOpen }: { list: TierList; by?: string; action?: string; onOpen: () => void }) {
    const top = list.tiers.filter(t => (list.placed[t.id] || []).length).slice(0, 3);
    const changes = changelog(list).length;
    return (
        <div className="chat-tierlist">
            <span className="chat-tierlist-head"><Icon name="trophy" size={16} /><strong>{list.title}</strong></span>
            <small>{Object.keys(list.mons).length} ranked{list.format ? ` · ${list.format}` : ''}{changes ? ` · ${changes} change${changes === 1 ? '' : 's'}` : ''}{by ? ` · by ${by}` : ''}</small>
            {top.length > 0 && (
                <span className="chat-tierlist-tiers">
                    {top.map(t => (
                        <span key={t.id} className="chat-tierlist-tier">
                            <b style={{ background: t.color }}>{t.name}</b> {(list.placed[t.id] || []).slice(0, 4).map(id => list.mons[id]?.name).filter(Boolean).join(', ')}{(list.placed[t.id] || []).length > 4 ? '…' : ''}
                        </span>
                    ))}
                </span>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onOpen(); }}>{action}</button>
        </div>
    );
}
