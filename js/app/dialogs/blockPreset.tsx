// Presets in the block editor: put an existing move, ability, item or condition
// on the board as a starting base. Its numbers stay as they are: a preset only
// brings the battle code.

import { useState } from 'react';
import { api } from '../../core/app.ts';
import { confirmDialog } from '../../core/confirm-dialog.ts';
import { applyBlocksToBoard } from '../../editor/ability-blocks.ts';
import { buildSeed, LIBRARY_WORDS, type LibraryKind, type TemplateChoice } from '../../features/library-templates.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { TemplateStep } from './newEntry.tsx';

const LIBRARY_OF: Record<string, LibraryKind> = { move: 'moves', ability: 'abilities', item: 'items', condition: 'conditions' };

function BlockPresetDialog({ kind, hasBlocks, close }: DialogProps<{ kind: 'move' | 'ability' | 'item' | 'condition'; hasBlocks: boolean }>) {
    const library = LIBRARY_OF[kind];
    const [busy, setBusy] = useState('');
    const pick = async (choice: TemplateChoice) => {
        if (hasBlocks && !await confirmDialog({ title: 'Replace these blocks?', message: `The blocks from ${choice.name} replace the ones on the board. Nothing is saved until you press Save.`, confirmLabel: 'Replace' })) return;
        setBusy(choice.id);
        try {
            const seed = await buildSeed(library, choice, '');
            if (!seed.blocks && !seed.rawCode) {
                setBusy('');
                api.showToast?.(seed.translated === false ? `The code of ${choice.name} did not load. Try again.` : `${choice.name} has no battle code to copy.`, 'info');
                return;
            }
            applyBlocksToBoard(seed.blocks, seed.rawCode);
            close();
            api.showToast?.(`The blocks from ${choice.name} are on the board.`, 'success');
        } catch {
            setBusy('');
            api.showToast?.(`${choice.name} could not be read. Try again.`, 'error');
        }
    };
    return (
        <Modal onClose={close} title={`Start from a ${LIBRARY_WORDS[library].noun}`} className="start-modal is-picking" labelledBy="block-preset-title">
            <TemplateStep kind={library} name="" onPick={pick} busy={busy} />
        </Modal>
    );
}

registerDialog('block-preset', BlockPresetDialog);
