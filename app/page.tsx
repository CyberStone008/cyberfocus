'use client';

import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from './landing.module.css';

export default function LandingPage() {
  // Start fetching the hero image at high priority before CSS even applies.
  preload('/hero.webp', { as: 'image', fetchPriority: 'high' });

  const router = useRouter();
  const noiseRef = useRef<HTMLSpanElement>(null);
  const [accessing, setAccessing] = useState(false);
  const [fading,   setFading]    = useState(false);
  const [btnContent, setBtnContent] = useState<{ arrow: string; text: string }>({
    arrow: '▶', text: '开启未来',
  });

  /* Prefetch the entry page during the landing animation so it's instant on click. */
  useEffect(() => { router.prefetch('/reports'); }, [router]);

  /* Navigate after fade-out completes */
  useEffect(() => {
    if (fading) {
      const id = setTimeout(() => router.push('/reports'), 700);
      return () => clearTimeout(id);
    }
  }, [fading, router]);

  /* Animate noise level */
  useEffect(() => {
    const id = setInterval(() => {
      if (noiseRef.current) {
        const v = (95 + Math.random() * 4.5).toFixed(1);
        noiseRef.current.textContent = v;
      }
    }, 2400);
    return () => clearInterval(id);
  }, []);

  function enterApp() {
    if (accessing) return;
    setAccessing(true);
    setBtnContent({ arrow: '//', text: 'ACCESSING...' });
    setTimeout(() => setFading(true), 680);
  }

  return (
    <div
      className={styles.root}
      style={{ transition: 'opacity 0.65s ease', opacity: fading ? 0 : 1 }}
    >
      {/* Background layers */}
      <div className={styles.hero} />
      <div className={styles.vignette} />
      <div className={styles.scanlines} />
      <div className={styles.noise} />

      {/* HUD: top left */}
      <div className={`${styles.hud} ${styles.hudTl}`}>
        <div className={styles.dim}>CF-2024</div>
        <div>SYS.OVR.<span className={styles.red}>_30FFS</span></div>
        <div className={styles.hudSep} />
        <div>DATA</div>
        <div>STREAM</div>
        <div><span className={`${styles.red} ${styles.blink}`}>■</span> ONLINE</div>
      </div>

      {/* HUD: top right */}
      <div className={`${styles.hud} ${styles.hudTr}`}>
        <div>CYBERFOCUS LAB</div>
        <div className={styles.hudSep} />
        <div>24/7</div>
        <div>SURVEILLANCE</div>
        <div>PROTOCOL</div>
        <div>ACTIVE <span className={styles.red}>◉</span></div>
      </div>

      {/* Crosshair */}
      <div className={styles.crosshair} />

      {/* HUD: mid left */}
      <div className={`${styles.hud} ${styles.hudMl}`}>
        <div>NOISE LEVEL</div>
        <div className={styles.red}>
          <span ref={noiseRef}>97.6</span>
          <span className={styles.dim}>%</span>
        </div>
        <div className={styles.barChart}>
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <div style={{ marginTop: 18 }}>
          <div>DISTRACTIONS</div>
          <div>ARE ENDLESS.</div>
          <div>ATTENTION</div>
          <div>IS LIMITED.</div>
        </div>
        <div style={{ marginTop: 10, color: 'rgba(220,30,30,0.45)' }}>
          ▸ <span className={styles.dim}>FILTER ACTIVE</span>
        </div>
      </div>

      {/* HUD: mid right */}
      <div className={`${styles.hud} ${styles.hudMr}`}>
        <div>YOU ARE</div>
        <div>BEING WATCHED.</div>
        <div>YOU CHOOSE WHAT</div>
        <div>TO SEE.</div>
        <div style={{ marginTop: 4 }} className={styles.red}>FOCUS IS FREEDOM.</div>
      </div>

      {/* Caption bar */}
      <div className={styles.captionBar}>
        <div className={styles.captionItem}>ALL EYES. ALL THE TIME.</div>
        <div className={styles.captionItem}>FOCUS IS CONTROL.</div>
        <div className={styles.captionItem}>TUNE OUT. TAKE CONTROL.</div>
      </div>

      {/* Bottom */}
      <div className={styles.bottom}>
        <div className={styles.taglineLeft}>
          NOT EVERYTHING<br />
          <em>DESERVES</em><br />
          YOUR ATTENTION.
        </div>

        <div className={styles.bottomCenter}>
          <div className={styles.ticks}>
            <span /><span /><span /><span /><span />
          </div>
          <button
            className={`${styles.enterBtn} ${accessing ? styles.enterBtnAccessing : ''}`}
            onClick={enterApp}
          >
            <span className={styles.btnArrow}>{btnContent.arrow}</span>
            <span className={styles.btnText}>{btnContent.text}</span>
          </button>
          <div className={styles.btnLabel}>FOCUS IS CONTROL</div>
          <div className={styles.btnSubtitle}>真正的自由，不是看见一切，而是知道什么不值得看</div>
        </div>

        <div className={styles.taglineRight}>
          FILTER.<br />
          PRIORITIZE.<br />
          <span className={styles.red}>DOMINATE.</span>
        </div>
      </div>
    </div>
  );
}
