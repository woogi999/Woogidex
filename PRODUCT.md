# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Fakemon makers: fans who design their own Pokémon-style creatures, from hobbyists sketching one creature to people running whole regions or entering contests (Pokeathlon-style events). They come to design a Fakemon from start to finish in one place, show it off, and see what other people have made. Many arrive from a shared link to someone's Fakemon or an event.

## Product Purpose

Woogidex is a fan-made, browser-based Fakemon editor, Pokédex builder and community hub. You make a Fakemon (stats, typing, abilities, moves, Dex entries, artwork), it becomes a Pokédex-style board you can export or share, and you can publish it to the Community Hub, connect it into an evolution line, or enter it in events. Success is a new visitor making their first Fakemon and seeing it turn into a board, then coming back to share and browse.

## Positioning

One place to design a Fakemon end to end, instead of bouncing between separate tools: real game-data-aware editing (learnsets, sample competitive sets, type analysis, Showdown and Essentials export, a block editor for ability effects), plus a community built around the same objects.

## Operating Context

- The collection is local-first (IndexedDB in the browser); no account is needed to design and export. An account is needed for the Community Hub, comments, events and messages.
- Sections: My Collection (with regions), the editor (a sheet over the collection), Community Hub (feed, browse, featured this week), Events and contests, Updates, Settings, profiles, messages.
- Battle is paused and still in progress; don't promote it.
- Deployed as a static Vite build behind a Cloudflare worker at dex.woogi.xyz; Supabase backs accounts and community data.

## Capabilities and Constraints

- Community artwork is shielded (masked, drawn to canvas); never show it as a plain `<img>` or bypass the art shield.
- Hand-drawn artwork is opted out of image search and AI training (robots meta, robots.txt).
- Routes: `/` opens My Collection (also at `/collection`). A landing page for `/` is built but switched off until launch (js/core/flags.ts).
- Each section gets its own short first-visit onboarding, shown once and skippable (Collection, Editor, Community, Events; not Battle).

## Brand Commitments

- Name: Woogidex. The logo is "WOoGiDeX" (capital second O) set in Pokémon Solid with a pink-to-violet gradient, halftone dots, a thick navy outline and an offset navy extrusion, with Joltik riding the O (public/assets/woogidex_icon.png; Joltik alone is public/assets/favicon.png). The landing page recreates the letters as separate SVG shapes so each can be animated.
- No AI-generated imagery anywhere on the site, including decorative art. The landing scenery is layered PNGs in public/assets/landing/ (day and night), currently painted in code by scripts/landing-painter/; the maker plans to paint over or replace them with their own art.
- Voice: casual, simple, fun, a little playful (":3"), written by a solo maker who builds it because it's fun. Not corporate.

## Evidence on Hand

- Live Community Hub posts (published_mons) with real art, likes and comments; "Featured this week" rotation.
- Feature list in README.md; release notes in public/updates/.
- No testimonials, user counts or press exist; don't invent them.

## Product Principles

1. Get people to their first Fakemon fast; everything else can wait.
2. The creatures are the stars; the interface stays out of the way.
3. Local-first and free: nothing is gated behind an account that doesn't need one.
4. Honest and casual: say what it does, don't hype what's still in progress.

## Accessibility & Inclusion

Respect reduced motion (the site has its own Reduce Motion setting plus the OS preference), visible focus states, keyboard access, and a low-end-device mode (`.low-end`) that tones effects down.
