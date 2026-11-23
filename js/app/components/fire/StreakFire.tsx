// The streak's fire: the owner's Lottie animation (fire.json), played with
// lottie-web's light SVG player (no expressions, no eval). It grows with the
// streak, like a TikTok streak flame:
//   0        grey and still: no streak yet
//   1 to 6   a small orange flame
//   7 to 13  bigger, a little faster
//   14 to 20 red-hot, with a glow
//   21 to 29 violet, with two side flames
//   30 and up blue, the side flames, a glow ring and rising embers
// Reduced motion shows one still frame. CSS: css/fun.css (.fire-*).

import { useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import fireData from './fire.json';
import { reducedMotion } from '../../../core/motion.ts';

const LOOP_END = 25;

/** The step the fire is on for a streak of `days`. */
export const fireLevel = (days: number) => (days <= 0 ? 0 : days < 7 ? 1 : days < 14 ? 2 : days < 21 ? 3 : days < 30 ? 4 : 5);

/** One copy of the animation in `el`. */
function useFire(el: React.RefObject<HTMLDivElement | null>, play: boolean, speed: number, offset = 0) {
    useEffect(() => {
        if (!el.current) return;
        const anim = lottie.loadAnimation({
            container: el.current, renderer: 'svg', loop: true, autoplay: false,
            animationData: fireData as any, rendererSettings: { preserveAspectRatio: 'xMidYMax meet' }
        });
        anim.setSpeed(speed);
        // the file's layer ends at frame 25.85 but the animation runs to 26: that last
        // sliver is empty and blinks at each loop, so the loop stops at frame 25
        anim.setSegment(0, LOOP_END);
        if (play && !reducedMotion()) anim.goToAndPlay(offset, true);
        else anim.goToAndStop(8, true);
        return () => anim.destroy();
    }, [play, speed, offset]);
}

function Flame({ className, play, speed, offset }: { className: string; play: boolean; speed: number; offset?: number }) {
    const el = useRef<HTMLDivElement>(null);
    useFire(el, play, speed, offset);
    return <div ref={el} className={className} />;
}

export function StreakFire({ days, size = 120 }: { days: number; size?: number }) {
    const level = fireLevel(days);
    const play = level > 0;
    const speed = [1, 1, 1.1, 1.2, 1.3, 1.45][level];
    return (
        <div className={`fire fire-lvl-${level}`} style={{ ['--fire-size' as any]: `${size}px` }} aria-hidden="true">
            {level >= 3 && <span className="fire-glow" />}
            {level >= 4 && <Flame className="fire-side is-left" play={play} speed={speed * 0.9} offset={9} />}
            {level >= 4 && <Flame className="fire-side is-right" play={play} speed={speed * 1.1} offset={17} />}
            <Flame className="fire-main" play={play} speed={speed} />
            {level >= 5 && <span className="fire-embers">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }} />)}</span>}
        </div>
    );
}
