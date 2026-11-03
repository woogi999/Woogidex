// Paints both themes at the sizes the landing page expects and lists every
// layer as a WebP to download (see index.html). window.landingPainted resolves
// to { "day/sky.webp": dataURL, ... } for scripted exports.

import { paintScene, SCENE_LAYERS, type SceneTheme } from './painter.ts';

// must match the images css/landing.css expects (.lp-layer)
export const SCENE_W = 2400, SCENE_H = 1350;

// the quality the shipped files were made at
const WEBP_QUALITY = 0.82;

async function toWebp(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
    if ('toDataURL' in canvas) return canvas.toDataURL('image/webp', WEBP_QUALITY);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
    return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
    });
}

async function paintAll(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const out = document.getElementById('out')!;
    for (const theme of ['day', 'night'] as SceneTheme[]) {
        const layers = paintScene(theme, SCENE_W, SCENE_H, 1, 1);
        const named: Array<[string, HTMLCanvasElement | OffscreenCanvas]> = SCENE_LAYERS.map(l => [`${l}.webp`, layers[l]]);
        for (const [name, canvas] of named) {
            const url = await toWebp(canvas);
            const path = `${theme}/${name}`;
            files[path] = url;
            const fig = document.createElement('figure');
            fig.innerHTML = `<a href="${url}" download="${theme}-${name}"><img src="${url}" alt=""></a><figcaption><span>${path}</span><a href="${url}" download="${theme}-${name}">Download</a></figcaption>`;
            out.appendChild(fig);
        }
    }
    document.querySelector('p')!.textContent = 'Done. Save each file into public/assets/landing/<theme>/<name>.';
    return files;
}

(window as any).landingPainted = paintAll();
