// The one way the site shows artwork that other people made: Fakémon on the
// Community Hub, profiles, search, battles and event entries. The picture is
// drawn onto a canvas rather than shown as an <img> (js/core/art-shield.ts),
// and it takes every form artwork comes in: a data: URI, the masked envelope
// the server sends (wgx1|...), or a URL.
//
// ShieldedArt draws a source you already have. ArtLoader fetches the source
// when its box comes near the screen, tries again when the network fails,
// and shows `fallback` until there is a picture.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { paintShieldedCanvas } from '../../core/art-shield.ts';

export function ShieldedArt({ src, alt = '', className = '' }: { src: string; alt?: string; className?: string }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (ref.current && src) paintShieldedCanvas(ref.current, src);
    }, [src]);
    if (!src) return null;
    return <canvas ref={ref} className={`shielded-art ${className}`.trim()} role="img" aria-label={alt} />;
}

// a failed load waits this long before the next try; after the last, the fallback stays
const RETRY_MS = [1500, 5000, 15000];

/**
 * Loads artwork when it nears the screen, then draws it shielded.
 * `load` resolves to the source, or '' when there is no picture. It rejects
 * (or throws) when the network failed, and then ArtLoader tries again.
 * `loadKey` names what is loaded: a new key loads again.
 */
export function ArtLoader({ src = '', load, loadKey, alt = '', className = '', fallback = null, as: Tag = 'span', scaling, children }: {
    src?: string; load?: () => Promise<string>; loadKey?: string; alt?: string; className?: string;
    fallback?: ReactNode; as?: 'span' | 'div'; children?: ReactNode;
    /** 'pixel' or 'smooth': how the canvas scales (CSS reads data-scaling) */
    scaling?: string;
}) {
    const [art, setArt] = useState(src);
    const box = useRef<HTMLElement>(null);
    useEffect(() => { setArt(src); }, [src, loadKey]);
    useEffect(() => {
        if (art || !load) return;
        let live = true;
        let timer: any = null;
        const attempt = (n: number) => {
            Promise.resolve().then(load).then(found => { if (live && found) setArt(found); }, () => {
                if (live && n < RETRY_MS.length) timer = setTimeout(() => attempt(n + 1), RETRY_MS[n]);
            });
        };
        const el = box.current;
        if (!el || typeof IntersectionObserver === 'undefined') { attempt(0); return () => { live = false; clearTimeout(timer); }; }
        const io = new IntersectionObserver(seen => {
            if (!seen.some(s => s.isIntersecting)) return;
            io.disconnect();
            attempt(0);
        }, { rootMargin: '300px' });
        io.observe(el);
        return () => { live = false; clearTimeout(timer); io.disconnect(); };
    }, [art, loadKey]);
    return (
        <Tag className={className || undefined} ref={box as any} data-scaling={scaling}>
            {art ? <ShieldedArt src={art} alt={alt} /> : fallback}
            {children}
        </Tag>
    );
}
