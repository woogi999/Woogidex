// The "What's New" pop-up (js/features/whats-new.ts): the newest update post
// from the Woogidex account, with links to the post and to every update.

import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { RichText } from '../components/EmojiInput.tsx';
import { Link } from '../components/Link.tsx';
import { Icon } from '../components/Icon.tsx';
import type { FeedItem } from '../../features/feed-algorithm.ts';

const day = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return ''; }
};

function WhatsNewDialog({ item, close }: DialogProps<{ item: FeedItem }>) {
    return (
        <Modal onClose={close} title="What's New" className="whats-new" labelledBy="whats-new-title">
            <p className="whats-new-date"><Icon name="sparkles" size={14} />{day(item.created_at)}</p>
            <div className="whats-new-body">
                <RichText text={item.body || ''} />
                {item.truncated && <p className="whats-new-more">There is more in the full post.</p>}
            </div>
            <div className="whats-new-actions">
                <Link to="updates" className="btn btn-secondary" onClick={close}>Every update</Link>
                <Link to={`post/${encodeURIComponent(item.id)}`} className="btn btn-secondary" onClick={close}>Open the post</Link>
                <button type="button" className="btn btn-primary" onClick={close}>Got it</button>
            </div>
        </Modal>
    );
}

registerDialog('whats-new', WhatsNewDialog);
