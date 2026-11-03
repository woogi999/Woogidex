// The chat dock: your messages in the bottom-right corner, like Instagram on
// the web. Closed, it is a bar with your latest chats and the unread count.
// Open, it shows the list of chats or one chat, with a button to go full
// screen (/messages). Phones and the /messages page itself do not show it
// (css/messages.css). State and actions: js/features/messaging.ts.

import { useEffect } from 'react';
import { api, state } from '../../core/app.ts';
import { useStore } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { countLabel } from './Header.tsx';
import { ChatAvatar, ChatList, DockContext, KeyGate, Thread } from '../pages/MessagesPage.tsx';
import type { Conversation } from '../../features/messaging.ts';

export function MessagesDock() {
    useStore();
    const m = api.messagingState();
    const ready = m.status === 'ready';
    // the bar shows your latest chats, so it loads the list once keys are unlocked
    useEffect(() => { if (state.user && ready && !m.conversationsLoaded) api.loadConversations(); }, [state.user?.id, ready]);
    if (!state.user) return null;

    const unread: number = api.unreadMessageTotal?.() || 0;
    if (!m.dockOpen) {
        // a circle with the icon; it stretches to show who sent you unread messages
        const senders: Conversation[] = m.conversations.filter((c: Conversation) => c.unread > 0).slice(0, 4);
        return (
            <div className="msg-dock">
                <button type="button" className={`msg-dock-bar${senders.length ? ' has-faces' : ''}`} onClick={() => api.openDock()}
                    aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} title="Messages">
                    <Icon name="chat-bubble-oval-left-ellipsis" size={20} />
                    {senders.length > 0 && (
                        <span className="msg-dock-faces" aria-hidden="true">
                            {senders.map(c => <ChatAvatar key={c.id} convo={c} size="sm" />)}
                        </span>
                    )}
                    {unread > 0 && <span className="msg-dock-badge">{countLabel(unread)}</span>}
                </button>
            </div>
        );
    }

    const active: Conversation | null = m.conversations.find((c: Conversation) => c.id === m.activeId) || null;
    const windowButtons = (
        <>
            <button type="button" className="chat-icon-btn msg-dock-btn" title="Full screen" aria-label="Open messages full screen" onClick={() => api.expandDock()}>
                <Icon name="arrows-pointing-out" size={17} />
            </button>
            <button type="button" className="chat-icon-btn msg-dock-btn" title="Close" aria-label="Close messages" onClick={() => api.closeDock()}>
                <Icon name="x-mark" size={18} />
            </button>
        </>
    );
    return (
        <DockContext.Provider value={true}>
            <div className="msg-dock is-open">
                <section className="msg-dock-panel" aria-label="Messages">
                    {!ready ? (
                        <>
                            <header className="msg-dock-head"><h2>Messages</h2><div className="chat-list-actions">{windowButtons}</div></header>
                            <div className="msg-dock-gate"><KeyGate status={m.status} /></div>
                        </>
                    ) : m.activeId
                        ? <Thread key={m.activeId} conversationId={m.activeId} convo={active} actions={windowButtons} />
                        : <ChatList conversations={m.conversations} loaded={m.conversationsLoaded} activeId={null} title="Messages" actions={windowButtons} />}
                </section>
            </div>
        </DockContext.Provider>
    );
}
