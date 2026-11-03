// The big red "STOP" in the browser console, like most sites have. People get
// talked into pasting code here ("paste this to get free badges") that runs
// as them: it can read their session and post, message or delete things in
// their name. Production only; during development the console is ours.

const STOP = [
    '███████╗████████╗ ██████╗ ██████╗ ',
    '██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗',
    '███████╗   ██║   ██║   ██║██████╔╝',
    '╚════██║   ██║   ██║   ██║██╔═══╝ ',
    '███████║   ██║   ╚██████╔╝██║     ',
    '╚══════╝   ╚═╝    ╚═════╝ ╚═╝     '
].join('\n');

let shown = false;

export function showConsoleWarning(): void {
    if (shown || !import.meta.env.PROD) return;
    shown = true;
    console.log(`%c${STOP}`, 'color:#e5484d;font-family:monospace;font-weight:700;font-size:14px;line-height:1.15;');
    console.log(
        '%cDo not paste anything here unless you know exactly what it does.',
        'color:#e5484d;font-size:18px;font-weight:700;'
    );
    console.log(
        '%cThis is a browser feature meant for developers. If someone told you to copy and paste something here '
        + 'to unlock a feature, get free badges or "hack" an account, it is a scam: it will give them access to '
        + 'your Woogidex account, and they can post, message and delete things as you.\n\n'
        + 'Woogidex staff will never ask you to paste anything here.',
        'font-size:14px;line-height:1.5;'
    );
}
