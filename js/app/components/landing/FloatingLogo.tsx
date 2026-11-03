// The Woogidex wordmark rebuilt from its letters (logo-glyphs.ts), with the
// Joltik riding the O: each letter is its own group, so it can bob on its own,
// boing when poked, and drift apart as the hero scrolls away (css/landing.css).
// The look copies public/assets/woogidex_icon.png: a pink-to-violet fill with
// halftone dots, a thick navy outline, and a navy extrusion down and right.

import { useId, useState, type CSSProperties } from 'react';
import { LOGO_GLYPHS } from './logo-glyphs.ts';

// where each letter sits in the arch, read off the original logo:
// [x, y, rotation in degrees, scale, scroll drift x, drift y, drift turn]
const PLACE: Array<[number, number, number, number, number, number, number]> = [
    [0, 26, -9, 1.06, -60, -40, -16],
    [150, 22, -5, 0.94, -30, -70, 10],
    [304, 26, -3, 0.96, -10, -50, -12],
    [400, 0, -2, 1, 0, -90, 8],
    [534, -10, 3, 1, 10, -60, -10],
    [590, -4, 6, 1, 30, -80, 14],
    [732, 20, 8, 1, 40, -50, -8],
    [846, 18, 11, 1.08, 70, -40, 18]
];

// Joltik rides the capital O, as on the original logo (public/assets/favicon.png).
// dx nudges him sideways from the O's centre; sink is how much of him sits below the O's top
const RIDER = { letter: 1, w: 190, h: 190, dx: -6, sink: 0.48 };

export function FloatingLogo({ className = '' }: { className?: string }) {
    // ids are per instance, in case a page ever draws two
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const [boing, setBoing] = useState<Record<number, number>>({});
    const poke = (i: number) => setBoing(b => ({ ...b, [i]: (b[i] || 0) + 1 }));
    return (
        <svg className={`flogo ${className}`.trim()} viewBox="-40 -96 1080 350" role="img" aria-label="Woogidex"
            // it's a logo to poke, not an image to save: no "open image in new tab", no dragging it off
            onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
            <defs>
                <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f3a2f1" />
                    <stop offset="0.55" stopColor="#d48df6" />
                    <stop offset="1" stopColor="#a87cff" />
                </linearGradient>
                <pattern id={`${uid}-dots`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
                    <circle cx="4.5" cy="4.5" r="2.1" fill="#ffd2fb" />
                </pattern>
                {LOGO_GLYPHS.map((g, i) => <path key={i} id={`${uid}-g${i}`} d={g.d} />)}
            </defs>
            {LOGO_GLYPHS.map((g, i) => {
                const [x, y, r, s, dx, dy, dr] = PLACE[i];
                const cx = g.box[0] + g.box[2] / 2;
                const cy = g.box[1] + g.box[3] / 2;
                const ref = `#${uid}-g${i}`;
                return (
                    <g key={i} transform={`translate(${x} ${y}) rotate(${r} ${cx} ${cy}) translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`}>
                        <g className="flogo-drift" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--dr': `${dr}deg` } as CSSProperties}>
                            <g className="flogo-bob" style={{ '--i': i } as CSSProperties}>
                                <g key={boing[i] || 0} className={boing[i] ? 'flogo-letter is-boing' : 'flogo-letter'}
                                    onPointerEnter={() => poke(i)} onClick={() => poke(i)}>
                                    <use href={ref} className="flogo-extrude" transform="translate(7 10)" />
                                    <use href={ref} className="flogo-outline" />
                                    <use href={ref} fill={`url(#${uid}-fill)`} />
                                    <use href={ref} fill={`url(#${uid}-dots)`} className="flogo-dots" />
                                    {i === RIDER.letter && (
                                        <image href="assets/favicon.png" className="flogo-rider" width={RIDER.w} height={RIDER.h}
                                            x={cx - RIDER.w / 2 + RIDER.dx} y={g.box[1] - RIDER.h * (1 - RIDER.sink)} />
                                    )}
                                </g>
                            </g>
                        </g>
                    </g>
                );
            })}
        </svg>
    );
}
