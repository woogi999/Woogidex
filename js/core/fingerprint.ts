// A device fingerprint, for abuse prevention only (js/features/auth.ts sends
// it with sign-up, sign-in and visit records; supabase/functions/record-auth-event).
//
// Two things, because each misses what the other catches:
//   * deviceId: a random id this browser keeps (localStorage and a
//     first-party cookie, so clearing one leaves the other). Exact, but gone
//     with a full wipe or a private window.
//   * fingerprint: a hash of how this device draws and sounds (canvas, WebGL
//     renderer, audio), plus its screen, time zone, languages and hardware.
//     Survives a wipe and a private window; two identical machines collide.
// Staff see which accounts share either one and can ban a device
// (banned_devices). Nothing here is used for ads or analytics, and the
// cookie notice says so (CookieNotice in js/app/shell).

const DEVICE_KEY = 'woogidex.device.v1';
const DEVICE_COOKIE = 'woogi_did';

function randomId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const validId = (v: string | null | undefined): v is string => !!v && /^[A-Za-z0-9_-]{8,64}$/.test(v);

/** This browser's device id, created on first use and kept in two places. */
export function deviceId(): string {
    let id: string | null = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch { /* storage blocked */ }
    if (!validId(id)) id = document.cookie.split('; ').find(c => c.startsWith(DEVICE_COOKIE + '='))?.split('=')[1] || null;
    if (!validId(id)) id = randomId();
    try { localStorage.setItem(DEVICE_KEY, id); } catch { /* storage blocked */ }
    // two years; first-party, never sent anywhere but this site
    document.cookie = `${DEVICE_COOKIE}=${id}; max-age=${60 * 60 * 24 * 730}; path=/; samesite=lax; secure`;
    return id;
}

async function sha256(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function canvasPrint(): string {
    try {
        const c = document.createElement('canvas');
        c.width = 280; c.height = 60;
        const g = c.getContext('2d');
        if (!g) return '';
        g.textBaseline = 'top';
        g.font = "16px 'Arial'";
        g.fillStyle = '#f60'; g.fillRect(100, 1, 62, 20);
        g.fillStyle = '#069'; g.fillText('Woogidex \u{1F409} fakemon 0.123', 2, 15);
        g.fillStyle = 'rgba(102, 204, 0, 0.7)'; g.fillText('Woogidex \u{1F409} fakemon 0.123', 4, 17);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = 'rgb(255,0,255)'; g.beginPath(); g.arc(50, 30, 25, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgb(0,255,255)'; g.beginPath(); g.arc(80, 30, 25, 0, Math.PI * 2); g.fill();
        return c.toDataURL();
    } catch { return ''; }
}

function webglInfo(): { vendor: string; renderer: string } {
    try {
        const c = document.createElement('canvas');
        const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return { vendor: '', renderer: '' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
        const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return { vendor: vendor.slice(0, 120), renderer: renderer.slice(0, 160) };
    } catch { return { vendor: '', renderer: '' }; }
}

async function audioPrint(): Promise<string> {
    try {
        const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (!Ctx) return '';
        const ctx = new Ctx(1, 5000, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle'; osc.frequency.value = 10000;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12; comp.attack.value = 0; comp.release.value = 0.25;
        osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
        const buf: AudioBuffer = await Promise.race([ctx.startRendering(), new Promise<never>((_, no) => setTimeout(() => no(new Error('slow')), 1000))]);
        const data = buf.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
        return sum.toFixed(6);
    } catch { return ''; }
}

export interface DevicePrint { fingerprint: string; deviceId: string; info: Record<string, unknown>; }

let cached: Promise<DevicePrint | null> | null = null;

/** The fingerprint, worked out once per page load; null where the browser can't (no crypto.subtle). */
export function devicePrint(): Promise<DevicePrint | null> {
    if (!cached) cached = (async () => {
        if (!crypto?.subtle) return null;
        const nav = navigator as any;
        const gl = webglInfo();
        const info = {
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            langs: (navigator.languages || [navigator.language]).slice(0, 4),
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}@${Math.round((devicePixelRatio || 1) * 100) / 100}`,
            platform: String(nav.userAgentData?.platform || navigator.platform || '').slice(0, 40),
            mobile: !!nav.userAgentData?.mobile || /Mobi/i.test(navigator.userAgent),
            cores: navigator.hardwareConcurrency || 0,
            memory: nav.deviceMemory || 0,
            touch: navigator.maxTouchPoints || 0,
            gpu: gl.renderer
        };
        // what goes into the hash: things that stay put on one device, not the
        // browser version (which changes every few weeks)
        const stable = JSON.stringify({ ...info, vendor: gl.vendor, canvas: await sha256(canvasPrint()), audio: await audioPrint() });
        return { fingerprint: await sha256(stable), deviceId: deviceId(), info };
    })().catch(() => null);
    return cached;
}
