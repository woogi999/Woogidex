// Icons we draw ourselves, for what Heroicons has no picture of: crossed swords,
// dice, terrain and the like. They follow Heroicons solid: a 24 x 24 box, about
// 2.25 units of margin, filled shapes, soft corners, and details cut out of the
// shape (fill-rule evenodd) or set apart by a gap of about 1.5 units.
// A name here wins over the same name in js/core/icon-data.ts.

/** A blade, a guard, a grip and a pommel, tip up on x = 12. Rotate it into place. */
const sword = (angle: number, gap = '') =>
    `<g transform="rotate(${angle} 12 12)"><path d="M10.1 ${gap ? '9.5' : '17'}V2.9a.75.75 0 0 1 .22-.53l1.15-1.15a.75.75 0 0 1 1.06 0l1.15 1.15a.75.75 0 0 1 .22.53V${gap ? '9.5' : '17'}Z"/>${gap}<rect x="7" y="16.75" width="10" height="2.75" rx="1.375"/><rect x="10.75" y="19" width="2.5" height="3.5"/><circle cx="12" cy="23" r="1.6"/></g>`;

export const CUSTOM_ICONS: Record<string, string> = {
    // one sword over the other, in an X; the lower blade stops short on each side of the upper one
    swords: `${sword(45, '<rect x="10.1" y="14.5" width="3.8" height="2.5"/>')}${sword(-45)}`,

    sword: sword(45),

    // a die, five pips
    dices: '<path fill-rule="evenodd" d="M6 2.25A3.75 3.75 0 0 0 2.25 6v12A3.75 3.75 0 0 0 6 21.75h12A3.75 3.75 0 0 0 21.75 18V6A3.75 3.75 0 0 0 18 2.25H6ZM8.25 6.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-3.75 3.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" clip-rule="evenodd"/>',

    // two peaks over the ground line
    terrain: '<path d="M9.12 4.08a1.5 1.5 0 0 1 2.52 0l3.9 6.7 1.02-1.6a1.5 1.5 0 0 1 2.53 0l2.46 4.2c.62 1.05-.1 2.37-1.3 2.37H3.25c-1.2 0-1.93-1.33-1.3-2.37L9.12 4.08Z"/><rect x="2.25" y="17.5" width="19.5" height="2.25" rx="1.125"/>',

    // a sun behind a cloud
    weather: '<path d="M9 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 9 2.25ZM3.7 4.45a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06L3.7 5.51a.75.75 0 0 1 0-1.06Zm10.6 0a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM1.5 9.75A.75.75 0 0 1 2.25 9h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Z"/><path d="M9 6a3.75 3.75 0 0 0-3.13 5.82A6 6 0 0 1 12.5 7.6 3.74 3.74 0 0 0 9 6Z"/><path d="M12 9.75a4.5 4.5 0 0 0-4.42 3.66A4.13 4.13 0 0 0 8.63 21.5h9.12a4.5 4.5 0 0 0 .86-8.92A4.5 4.5 0 0 0 12 9.75Z"/>',

    skull: '<path fill-rule="evenodd" d="M12 2.25c-5.11 0-9.25 3.8-9.25 8.5 0 3 1.7 5.64 4.25 7.15v2.1c0 .97.78 1.75 1.75 1.75h6.5c.97 0 1.75-.78 1.75-1.75v-2.1c2.55-1.5 4.25-4.14 4.25-7.15 0-4.7-4.14-8.5-9.25-8.5ZM8.5 9a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm7 0a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM12 14l-1.25 2.5h2.5L12 14Zm-2 4.5a.75.75 0 0 0-.75.75v1h1.5v-1a.75.75 0 0 0-.75-.75Zm4 0a.75.75 0 0 0-.75.75v1h1.5v-1a.75.75 0 0 0-.75-.75Z" clip-rule="evenodd"/>',

    // the Heroicons heart, with a crack cut down it
    'heart-crack': '<path fill-rule="evenodd" d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001ZM11.1 6.05 9.3 10.3l3.3 2.1-2 5.1 1.4.6 2.4-6.2-3.3-2.1 1.5-3.4-1.5-.35Z" clip-rule="evenodd"/>',

    'paw-print': '<ellipse cx="5.25" cy="10.5" rx="2.25" ry="2.75" transform="rotate(-20 5.25 10.5)"/><ellipse cx="9.5" cy="5.75" rx="2.25" ry="3" transform="rotate(-8 9.5 5.75)"/><ellipse cx="14.5" cy="5.75" rx="2.25" ry="3" transform="rotate(8 14.5 5.75)"/><ellipse cx="18.75" cy="10.5" rx="2.25" ry="2.75" transform="rotate(20 18.75 10.5)"/><path d="M12 10.5c-2.3 0-3.7 1.6-4.75 3.3-.6 1-1.75 1.5-2.25 2.7-.7 1.75.6 3.75 2.6 3.75 1.6 0 2.8-.75 4.4-.75s2.8.75 4.4.75c2 0 3.3-2 2.6-3.75-.5-1.2-1.65-1.7-2.25-2.7-1.05-1.7-2.45-3.3-4.75-3.3Z"/>',

    // a horseshoe magnet, its two tips set apart
    magnet: '<path d="M3 11.25a9 9 0 0 0 18 0V8.25h-4.5v3a4.5 4.5 0 1 1-9 0v-3H3v3Z"/><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H6a1.5 1.5 0 0 1 1.5 1.5v2.25H3V4.5Zm13.5 0A1.5 1.5 0 0 1 18 3h1.5A1.5 1.5 0 0 1 21 4.5v2.25h-4.5V4.5Z"/>',

    // a cut stone, its crown and body set apart
    gem: '<path d="M7.1 3a1.5 1.5 0 0 0-1.24.66L2.7 8.25h5.2L9.5 3H7.1Zm4 0L9.45 8.25h5.1L12.9 3h-1.8Zm3.4 0 1.6 5.25h5.2l-3.16-4.6A1.5 1.5 0 0 0 16.9 3h-2.4Z"/><path d="M2.75 9.75h5.3l2.9 9.9-8.2-9.9Zm6.87 0h4.76L12 18.1 9.62 9.75Zm6.33 0h5.3l-8.2 9.9 2.9-9.9Z"/>',

    gamepad: '<path fill-rule="evenodd" d="M6.75 6A5.25 5.25 0 0 0 1.5 11.25v3.5a3.25 3.25 0 0 0 5.9 1.88l.8-1.13h7.6l.8 1.13a3.25 3.25 0 0 0 5.9-1.88v-3.5A5.25 5.25 0 0 0 17.25 6H6.75Zm0 3a.75.75 0 0 1 .75.75V10.5h.75a.75.75 0 0 1 0 1.5H7.5v.75a.75.75 0 0 1-1.5 0V12h-.75a.75.75 0 0 1 0-1.5H6v-.75A.75.75 0 0 1 6.75 9Zm9.75.75a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Zm2.25 1.5a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Z" clip-rule="evenodd"/>',

    // the Heroicons shield, with nothing on it
    shield: '<path d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"/>',

    // two rows of dots, a handle to drag by
    'grip-vertical': '<circle cx="9" cy="5.25" r="1.75"/><circle cx="15" cy="5.25" r="1.75"/><circle cx="9" cy="12" r="1.75"/><circle cx="15" cy="12" r="1.75"/><circle cx="9" cy="18.75" r="1.75"/><circle cx="15" cy="18.75" r="1.75"/>',

    eraser: '<path d="M13.94 3.44a2.25 2.25 0 0 1 3.18 0l3.44 3.44a2.25 2.25 0 0 1 0 3.18l-5.6 5.6-6.62-6.62 5.6-5.6Z"/><path d="M7.28 10.1l-3.84 3.84a2.25 2.25 0 0 0 0 3.18l2.85 2.85c.14.14.33.22.53.22h11.43a.75.75 0 0 0 0-1.5h-5.17l1.32-1.97-6.62-6.62Z"/>',

    palette: '<path fill-rule="evenodd" d="M12 2.25c-5.52 0-9.75 4.25-9.75 9.75s4.3 9.75 9.25 9.75c1.8 0 2.75-1.1 2.75-2.5 0-.7-.3-1.2-.55-1.65-.25-.45-.45-.8-.45-1.25 0-.95.75-1.6 1.75-1.6h2.1c2.6 0 4.65-2 4.65-4.5 0-4.4-4.3-8-9.75-8ZM7.5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm2.25-3.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm2.25 3.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" clip-rule="evenodd"/>',

    // a sight: a ring, four ticks and a dot
    crosshair: '<path fill-rule="evenodd" d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" clip-rule="evenodd"/><path d="M12 1.5a.75.75 0 0 1 .75.75V7a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 12 1.5Zm0 15.75a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V18a.75.75 0 0 1 .75-.75ZM1.5 12a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 0 1.5H2.25A.75.75 0 0 1 1.5 12Zm15.75 0a.75.75 0 0 1 .75-.75h3.75a.75.75 0 0 1 0 1.5H18a.75.75 0 0 1-.75-.75Z"/><circle cx="12" cy="12" r="1.5"/>'
};

// The same drawing under the other names the site asks for it by.
for (const [alias, name] of Object.entries({ target: 'crosshair', 'gamepad-2': 'gamepad', diamond: 'gem' })) CUSTOM_ICONS[alias] = CUSTOM_ICONS[name];
