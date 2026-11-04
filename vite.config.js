import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { woogidexConfig } from './vite.shared.js';

// The Woogidex site. See vite.shared.js for the build itself.

const config = woogidexConfig({
    react,
    loadEnv,
    inputs: { admin: resolve(import.meta.dirname, 'admin.html') },
    // /sb is the same-origin Supabase proxy (the Worker, in Woogidex-DB);
    // the dev server stands in for it locally. scripts/site.mjs sets
    // WOOGIDEX_SUPABASE to point it at the mock backend or another project.
    supabase: process.env.WOOGIDEX_SUPABASE || 'https://qstbascfeolkyxtrqqwv.supabase.co'
});

// A local Supabase (scripts/local-db.mjs) has its own public key. The site
// always sends the live one, so the dev proxy swaps it on the way through:
// the apikey header, an Authorization that carries the key (signed out), and
// Realtime's ?apikey=. A signed-in user's own token passes unchanged.
const localKey = process.env.WOOGIDEX_SUPABASE_KEY;
if (localKey) {
    // dev and preview share one proxy object: wrap it one time
    for (const proxy of new Set([config.server?.proxy?.['/sb'], config.preview?.proxy?.['/sb']])) {
        if (!proxy) continue;
        const rewrite = proxy.rewrite;
        proxy.rewrite = path => rewrite(path).replace(/([?&]apikey=)[^&]*/, `$1${encodeURIComponent(localKey)}`);
        proxy.configure = server => server.on('proxyReq', req => {
            if (req.getHeader('apikey')) req.setHeader('apikey', localKey);
            if (/^Bearer sb_publishable_/i.test(String(req.getHeader('authorization') || ''))) req.setHeader('authorization', `Bearer ${localKey}`);
        });
    }
}

export default defineConfig(config);
