// The line at the top of an editor that started from a template.

import { seedSummary } from '../../../features/library-templates.ts';
import { Icon } from '../Icon.tsx';

export function TemplateNote({ seed }: { seed?: any }) {
    const text = seedSummary(seed);
    if (!text) return null;
    return <p className="lib-note"><Icon name="document-duplicate" size={15} />{text}</p>;
}
