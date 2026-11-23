// Preview mode, for the dev server only: open it with ?mock, leave it with
// ?mock=off. It stays on for the tab (sessionStorage), because the site's
// links drop the ?mock from the address.
//
// In preview mode nothing that is not live yet needs the database:
//   - Woobux and the streak run on local numbers, signed in or not, and a
//     panel (js/app/shell/MockPanel.tsx) switches the streak's situation;
//   - in any group you open, the Settings tab shows, and a new picture or
//     banner stays in this tab only (js/features/groups.ts).
// import.meta.env.DEV is false in a real build, so none of this ships.

const KEY = 'woogidex-dev-mock';

export const DEV_MOCK: boolean = (() => {
    if (!import.meta.env.DEV) return false;
    try {
        const v = new URLSearchParams(location.search).get('mock');
        if (v === 'off') { sessionStorage.removeItem(KEY); return false; }
        if (v !== null) sessionStorage.setItem(KEY, '1');
        return sessionStorage.getItem(KEY) === '1';
    } catch { return false; }
})();
