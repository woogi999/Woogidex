// The editor's Notes tab: how far along the Fakémon is, its tags, and a free
// notepad with doodles for lore, move plans and "fix this later". All of it
// stays private: publishing leaves it out (js/features/community.ts).

import { state } from '../../../core/app.ts';
import { editForm, form } from '../../../editor/draft.ts';
import { allTags } from '../../../features/notebook.ts';
import { NotesField, StatusPicker, TagsInput } from '../notes/NotesField.tsx';

export function NotesTab() {
    const suggestions = allTags(state.fakemonDB || []).map(([t]) => t);
    return (
        <div className="notes-tab">
            <div className="form-group">
                <label>Status</label>
                <StatusPicker status={form.status} onStatus={status => editForm({ status })} />
                <small className="field-hint">Drafts wait on the Unfinished shelf in My Collection until you mark them as done.</small>
            </div>
            <div className="form-group">
                <label>Tags</label>
                <TagsInput tags={form.tags} suggestions={suggestions} onTags={tags => editForm({ tags })} />
                <small className="field-hint">Search My Collection for <code>#tag</code> to see every Fakémon with it.</small>
            </div>
            <div className="form-group">
                <label>Notes</label>
                <NotesField notes={form.notes} doodles={form.doodles} placeholder="Lore, move plans, things to fix later… Only you see this."
                    onNotes={notes => editForm({ notes })} onDoodles={doodles => editForm({ doodles })} />
            </div>
        </div>
    );
}
