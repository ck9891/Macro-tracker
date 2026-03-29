/** Short "ding" when a rep is counted — Web Audio, no asset fetch. */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

export function playRepCompleteDing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.08);
    osc.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.12);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1760, t0 + 0.02);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t0 + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.08, t0 + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc2.connect(g2);
    g2.connect(master);
    osc2.start(t0 + 0.02);
    osc2.stop(t0 + 0.22);
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}
