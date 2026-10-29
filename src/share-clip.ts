// Share clip (Dom 2026-10-28; data/share-clip.json, docs/share-clip.md). After a boss kill a "Share clip" button offers the last seconds of the fight as a video the phone's share
// sheet (or a download) takes to TikTok / Instagram / X. The method is V1's (RPG-game src/clip.ts): canvas.captureStream + MediaRecorder on a 9:16 centre-crop copy of the arena
// canvas, MP4 where the browser records it (iOS Safari, recent Chrome), WebM elsewhere, the game audio tapped off the master gain (feedback.stream()), navigator.share({files}) with a
// download fallback. V1 re-plays a deterministic fight record on demand; V3's zone is live, so two MediaRecorders are staggered instead: each is restarted every 2*lead seconds and they are
// offset by lead seconds, so the older one always holds lead..2*lead seconds. At the kill the older one runs `tail` seconds more (the finisher on the cut camera) and stops: its file is the clip.
// Presentation only: it reads the canvas and never touches the sim. Nothing here throws into the game; any failure drops the clip and (where it can) offers a still picture.
// Extension point (Daily Pit, Pit Crawl): dispatch window event `v3:clip-moment` with detail { label } at a result, or call window.__v3Clip.moment(label) / .arm(on).
import ROWS from '../data/share-clip.json' with { type: 'json' };

type ShareClipRows = {
  on: boolean; leadSeconds: number; tailSeconds: number; stopTimeoutSeconds: number; width: number; height: number; fps: number; bitsPerSecond: number; types: string[];
  guard: { seconds: number; maxFrameMs: number };
  watermark: { text: string; sizePx: number; colour: string; alpha: number; marginPx: number };
  file: { prefix: string; title: string; stillType: string };
  button: { label: string; stillLabel: string; making: string; saved: string; failed: string; hideSeconds: number; bottomPx: number; zIndex: number; colour: string; sizePx: number };
};
export const SHARE_CLIP = ROWS as unknown as ShareClipRows;
const MOMENT_EVENT = 'v3:clip-moment';

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Throws a plain message for a bad row (a test loads the shipped file). */
export function validateShareClip(r: ShareClipRows): void {
  const num = (name: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`share-clip.${name} ${String(v)} is not a number in ${lo}..${hi}`); };
  const word = (name: string, v: unknown, max = 60) => { if (!(typeof v === 'string' && v.trim().length > 0 && v.length <= max)) throw new Error(`share-clip.${name} is a non-empty string of at most ${max} characters`); };
  if (typeof r.on !== 'boolean') throw new Error('share-clip.on is true or false');
  num('leadSeconds', r.leadSeconds, 1, 30); num('tailSeconds', r.tailSeconds, 0, 15); num('stopTimeoutSeconds', r.stopTimeoutSeconds, 0.05, 60); num('width', r.width, 160, 2160); num('height', r.height, 160, 3840); num('fps', r.fps, 5, 60); num('bitsPerSecond', r.bitsPerSecond, 200_000, 20_000_000);
  if (!Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width % 2 || r.height % 2) throw new Error('share-clip.width and height are even whole numbers (H.264 needs even sides)');
  if (!(r.height > r.width)) throw new Error('share-clip: the frame is portrait (height > width)');
  if (r.leadSeconds * 2 + r.tailSeconds > 60) throw new Error('share-clip: a clip may run at most 60 s (2 * leadSeconds + tailSeconds)');
  if (!Array.isArray(r.types) || !r.types.length || r.types.some((t) => typeof t !== 'string' || !/^video\/(mp4|webm)(;codecs=[a-z0-9.,]+)?$/.test(t))) throw new Error('share-clip.types is a list of video/mp4 or video/webm types');
  num('guard.seconds', r.guard?.seconds, 0.5, 30); num('guard.maxFrameMs', r.guard?.maxFrameMs, 10, 500);
  word('watermark.text', r.watermark?.text, 40); num('watermark.sizePx', r.watermark?.sizePx, 8, 120); num('watermark.alpha', r.watermark?.alpha, 0, 1); num('watermark.marginPx', r.watermark?.marginPx, 0, 200);
  if (!(typeof r.watermark?.colour === 'string' && HEX.test(r.watermark.colour))) throw new Error('share-clip.watermark.colour is a #rrggbb colour');
  if (!(typeof r.file?.prefix === 'string' && /^[a-z0-9-]{1,24}$/.test(r.file.prefix))) throw new Error('share-clip.file.prefix is a lower-case token');
  word('file.title', r.file?.title, 60);
  if (!['image/png', 'image/jpeg'].includes(r.file?.stillType)) throw new Error('share-clip.file.stillType is image/png or image/jpeg');
  for (const k of ['label', 'stillLabel', 'making', 'saved', 'failed'] as const) word(`button.${k}`, r.button?.[k], 40);
  num('button.hideSeconds', r.button?.hideSeconds, 3, 600); num('button.bottomPx', r.button?.bottomPx, 0, 200); num('button.zIndex', r.button?.zIndex, 0, 1000); num('button.sizePx', r.button?.sizePx, 8, 30);
  if (!(typeof r.button?.colour === 'string' && HEX.test(r.button.colour))) throw new Error('share-clip.button.colour is a #rrggbb colour');
}
validateShareClip(SHARE_CLIP);

/** The first type this browser records (V1 clipType). */
export const pickType = (supported: (type: string) => boolean, types: string[] = SHARE_CLIP.types): string | null => types.find((t) => { try { return supported(t); } catch { return false; } }) ?? null;
/** A boss kind or label as a plain file-name token; anything else is "boss" (no player text ever reaches a file name). */
export const safeBoss = (v: unknown): string => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : 'boss');
export const fileName = (type: string, boss: string, rows: ShareClipRows = SHARE_CLIP): string => `${rows.file.prefix}-${safeBoss(boss)}.${type.startsWith('video/mp4') ? 'mp4' : type.startsWith('video/webm') ? 'webm' : type.startsWith('image/jpeg') ? 'jpg' : 'png'}`;
/** The centre crop of a source frame (source pixels) at the target's aspect (V1 cropRect). */
export function cropRect(width: number, height: number, targetW: number, targetH: number) {
  const target = targetW / targetH;
  if (width / height > target) { const w = Math.round(height * target); return { x: Math.round((width - w) / 2), y: 0, w, h: height }; }
  const h = Math.round(width / target);
  return { x: 0, y: Math.round((height - h) / 2), w: width, h };
}

type ClipEnv = {
  rows: ShareClipRows;
  doc: Document;
  source: HTMLCanvasElement;
  now(): number;
  Recorder: typeof MediaRecorder | undefined;
  nav: Navigator | undefined;
  audio(): MediaStream | null;
  untap(): void;
  telemetry: { event(name: string, fields?: Record<string, unknown>): void };
};
type Take = { rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; t0: number; failed: boolean; done: boolean };
type State = 'idle' | 'buffering' | 'tail' | 'making' | 'ready' | 'off';

export function createShareClip(env: ClipEnv) {
  const rows = env.rows, B = rows.button;
  const canCapture = typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  const type = env.Recorder && canCapture ? pickType((t) => env.Recorder!.isTypeSupported(t), rows.types) : null;
  let state: State = rows.on ? 'idle' : 'off', epoch = 0, forced = false, stillOnly = !type;
  let takes: Take[] = [], nextAt = 0, tailEnd = 0, lastDraw = -1e9, lastFrame = 0, guardSum = 0, guardN = 0, guardStart = 0, guardPhase = 0, hideAt = 0, sending = false;
  let frame: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, mark: HTMLCanvasElement | null = null, boss = 'boss', file: File | null = null, clipSec = 0;
  let button: HTMLButtonElement | null = null, style: HTMLStyleElement | null = null;

  const ensureFrame = (): boolean => {
    if (frame) return true;
    try {
      frame = env.doc.createElement('canvas'); frame.width = rows.width; frame.height = rows.height; ctx = frame.getContext('2d');
      if (!ctx) { frame = null; return false; }
      const w = rows.watermark, m = env.doc.createElement('canvas'), mc = m.getContext('2d');
      if (mc) {   // the watermark is drawn once into a small canvas; each frame only blits it
        mc.font = `600 ${w.sizePx}px Georgia, 'Times New Roman', serif`;
        m.width = Math.ceil(mc.measureText(w.text).width) + 8; m.height = Math.ceil(w.sizePx * 1.4);
        mc.font = `600 ${w.sizePx}px Georgia, 'Times New Roman', serif`; mc.textBaseline = 'middle'; mc.globalAlpha = w.alpha;
        mc.shadowColor = 'rgba(0,0,0,.7)'; mc.shadowBlur = 4; mc.fillStyle = w.colour; mc.fillText(w.text, 4, m.height / 2);
        mark = m;
      }
      return true;
    } catch { frame = null; ctx = null; return false; }
  };
  const draw = (): boolean => {
    try {
      const s = env.source;
      if (!s.width || !s.height || !ensureFrame()) return false;
      const r = cropRect(s.width, s.height, rows.width, rows.height);
      ctx!.drawImage(s, r.x, r.y, r.w, r.h, 0, 0, rows.width, rows.height);
      if (mark) ctx!.drawImage(mark, rows.width - rows.watermark.marginPx - mark.width, rows.height - rows.watermark.marginPx - mark.height);
      return true;
    } catch { return false; }
  };

  // One recording (V1 recordClip): a start that throws stops its track and reports null; onerror marks it failed; stop() on an inactive recorder is guarded.
  const startTake = (): Take | null => {
    if (!type || !env.Recorder || !ensureFrame()) return null;
    let stream: MediaStream | null = null;
    try {
      stream = frame!.captureStream(rows.fps);
      for (const track of env.audio()?.getAudioTracks() ?? []) stream.addTrack(track);
      const rec = new env.Recorder(stream, { mimeType: type, videoBitsPerSecond: rows.bitsPerSecond });
      const take: Take = { rec, stream, chunks: [], t0: env.now(), failed: false, done: false };
      rec.ondataavailable = (e) => { if (e.data && e.data.size) take.chunks.push(e.data); };
      rec.onerror = () => { take.failed = true; };
      rec.start(1000);
      return take;
    } catch { try { for (const t of stream?.getVideoTracks() ?? []) t.stop(); } catch { /* gone */ } return null; }
  };
  const endTake = (take: Take, keep: boolean): Promise<Blob | null> => new Promise((resolve) => {
    if (take.done) { resolve(null); return; }
    take.done = true;
    const stopTracks = () => { try { for (const t of take.stream.getVideoTracks()) t.stop(); } catch { /* gone */ } };
    // watchdog: a recorder whose onstop never fires (a phone's MediaRecorder can stall) resolves null after stopTimeoutSeconds, so "Making clip…" never hangs: the caller falls back to the still
    const timer = setTimeout(() => { stopTracks(); resolve(null); }, rows.stopTimeoutSeconds * 1000);
    take.rec.onstop = () => { clearTimeout(timer); stopTracks(); resolve(keep && !take.failed && take.chunks.length ? new Blob(take.chunks, { type: type!.split(';')[0] }) : null); };
    try { if (take.rec.state === 'inactive') take.rec.onstop!(new Event('stop')); else take.rec.stop(); } catch { clearTimeout(timer); stopTracks(); resolve(null); }
  });
  const dropTakes = () => { for (const t of takes) void endTake(t, false); takes = []; };

  const removeButton = () => { button?.remove(); button = null; };
  const showButton = (label: string, enabled: boolean) => {
    try {
      if (!style) { style = env.doc.createElement('style'); style.textContent = `.sc-btn{position:fixed;left:50%;bottom:calc(${B.bottomPx}px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:${B.zIndex};padding:6px 14px;border:1px solid ${B.colour};border-radius:999px;background:rgba(10,8,6,.72);color:${B.colour};font:${B.sizePx}px/1.2 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;cursor:pointer}.sc-btn[disabled]{opacity:.6;cursor:default}`; env.doc.head.append(style); }
      if (!button) {
        button = env.doc.createElement('button'); button.className = 'sc-btn'; button.type = 'button'; button.dataset.shareClip = 'true';
        for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) button.addEventListener(ev, (e) => e.stopPropagation());   // the game's own touch input never sees a tap on the button
        button.addEventListener('click', () => { void send(); });
        env.doc.body.append(button);
      }
      button.textContent = label; button.disabled = !enabled;
    } catch { /* presentation only */ }
  };

  const reset = () => {
    epoch++; dropTakes(); removeButton(); file = null;
    if (state !== 'off') state = 'idle';
    try { env.untap(); } catch { /* not connected */ }
  };
  const disable = () => { dropTakes(); removeButton(); try { env.untap(); } catch { /* none */ } state = 'off'; };

  const stillBlob = (): Promise<Blob | null> => new Promise((resolve) => {
    try { if (!draw()) { resolve(null); return; } frame!.toBlob((b) => resolve(b), rows.file.stillType, 0.92); } catch { resolve(null); }
  });
  const finish = async () => {
    const mine = epoch, wasStill = stillOnly;
    state = 'making'; showButton(B.making, false);
    let blob: Blob | null = null, name = '', kind = '';
    if (!wasStill && takes.length) {
      const oldest = takes[0]!, rest = takes.slice(1); takes = [];
      for (const t of rest) void endTake(t, false);
      clipSec = (env.now() - oldest.t0) / 1000;
      blob = await endTake(oldest, true); kind = blob?.type || type || 'video/webm'; try { env.untap(); } catch { /* none */ }
    }
    if (!blob) { clipSec = 0; blob = await stillBlob(); kind = rows.file.stillType; try { env.untap(); } catch { /* none */ } }   // no video (unsupported, failed, or nothing was buffered): a picture of the moment
    if (mine !== epoch) return;   // the next fight began while the file was made: it is dropped
    if (!blob) { state = 'idle'; showButton(B.failed, false); hideAt = env.now() + 3000; return; }
    name = fileName(kind, boss, rows);
    try { file = new File([blob], name, { type: kind }); } catch { state = 'idle'; showButton(B.failed, false); hideAt = env.now() + 3000; return; }
    state = 'ready'; showButton(kind.startsWith('video/') ? B.label : B.stillLabel, true); hideAt = env.now() + B.hideSeconds * 1000;
  };

  // The tap: a fresh user gesture, so navigator.share is allowed. A refused or dismissed share leaves the button for another tap; no file sharing: the clip downloads.
  async function send(): Promise<void> {
    const f = file;
    if (!f || state !== 'ready' || sending) return;   // a second tap while the share sheet is pending does nothing (never a second share or a stray download)
    sending = true; if (button) button.disabled = true;
    const nav = env.nav;
    let done = false;
    try {
      if (nav?.share && nav.canShare?.({ files: [f] })) {
        try { await nav.share({ files: [f], title: rows.file.title }); done = true; }
        catch (error) { const n = (error as { name?: string })?.name; if (n === 'AbortError' || n === 'NotAllowedError') return; /* dismissed or refused: tap again */ }
      }
      if (!done) {
        const a = env.doc.createElement('a'), url = URL.createObjectURL(f);
        a.href = url; a.download = f.name; env.doc.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000); done = true;
      }
    } catch { return; } finally { sending = false; if (button && state === 'ready') button.disabled = false; }
    if (!done) return;
    try { env.telemetry.event('clip_shared', { boss, sec: clipSec }); } catch { /* never throws */ }   // the clip's length in seconds and the boss kind, nothing else
    file = null; state = 'idle'; showButton(B.saved, false); hideAt = env.now() + 2000;
  }

  return {
    get state(): State { return state; },
    get mode(): 'video' | 'still' | 'off' { return state === 'off' ? 'off' : type ? 'video' : 'still'; },
    /** Per rendered frame, right after the WebGL render (the drawing buffer is only valid then). `engaged` = a boss fight is on. */
    frame(engaged: boolean): void {
      try {
        if (state === 'off') return;
        const now = env.now(), on = engaged || forced, gap = now - lastFrame;
        lastFrame = now;
        if (hideAt && now >= hideAt) { hideAt = 0; if (state === 'ready') reset(); else { removeButton(); } }
        if (state === 'ready') { if (engaged) reset(); return; }   // a new fight began: the old offer goes
        if (state === 'making') return;
        if (state === 'idle') {
          if (!on) return;
          state = 'buffering'; stillOnly = !type; guardStart = now; guardSum = 0; guardN = 0; guardPhase = 0; nextAt = now + rows.leadSeconds * 1000; lastDraw = -1e9;
          if (type) { const t = startTake(); if (!t) { stillOnly = true; } else takes = [t]; }
        }
        if (state === 'buffering') {
          if (!on || gap > 1000) { reset(); return; }   // the fight ended without a kill (death, leash) or the tab slept: nothing worth keeping
          // the jank guard in two windows: the first `seconds` with one encoder, then `seconds` more from the moment the SECOND encoder starts (the load a phone really carries through the rest of the fight)
          if (guardPhase === 1 && takes.length >= 2) { guardPhase = 2; guardStart = now; guardSum = 0; guardN = 0; }
          if (guardPhase === 0 || guardPhase === 2) {
            guardSum += gap; guardN++;
            if (now - guardStart >= rows.guard.seconds * 1000) {
              if (guardN > 3 && guardSum / guardN > rows.guard.maxFrameMs) { disable(); return; }
              guardPhase = guardPhase === 0 ? 1 : 3;
            }
          }
          if (takes.length && now - lastDraw >= 1000 / rows.fps - 3) { lastDraw = now; draw(); }
          if (takes.length && now >= nextAt) {
            nextAt = now + rows.leadSeconds * 1000;
            const t = startTake();
            if (t) { takes.push(t); while (takes.length > 2) void endTake(takes.shift()!, false); }
          }
          return;
        }
        if (state === 'tail') {
          if (takes.length && now - lastDraw >= 1000 / rows.fps - 3) { lastDraw = now; draw(); }
          if (now >= tailEnd) void finish();
        }
      } catch { /* a clip never breaks a frame */ }
    },
    /** The moment to keep (the boss kill; Pit results via the window event). Records `tailSeconds` more, then makes the file. Without a buffer a picture is offered. */
    moment(label?: string): void {
      try {
        if (state === 'off' || state === 'tail' || state === 'making') return;
        if (state === 'ready') reset();
        if (state === 'idle') { stillOnly = true; }
        boss = safeBoss(label); state = 'tail'; tailEnd = env.now() + rows.tailSeconds * 1000; lastDraw = -1e9;
        if (takes.length > 1) { for (const t of takes.slice(1)) void endTake(t, false); takes = takes.slice(0, 1); }   // only the oldest is kept: one encoder through the tail
      } catch { /* never throws */ }
    },
    /** The fight ended without a kill (the hero died): drop the buffer. */
    cancel(): void { try { if (state === 'buffering' || state === 'tail' || state === 'making' || state === 'ready') reset(); } catch { /* never throws */ } },
    /** A mode that is not driven by `engaged` (a Pit run) arms the buffer by hand. */
    arm(on: boolean): void { forced = !!on; if (on && state === 'ready') reset(); if (!on && state === 'buffering') reset(); },
    dispose(): void { disable(); },
  };
}
type ShareClip = ReturnType<typeof createShareClip>;

/** The browser wiring: reads the real page, installs the window event and the debug handle (window.__v3Clip, like __v3Zone / __v3Radar). Never throws. */
export function mountShareClip(opts: { source: HTMLCanvasElement; audio: () => MediaStream | null; untap: () => void; telemetry: ClipEnv['telemetry'] }): ShareClip {
  const clip = createShareClip({ rows: SHARE_CLIP, doc: document, source: opts.source, now: () => performance.now(), Recorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder, nav: typeof navigator === 'undefined' ? undefined : navigator, audio: opts.audio, untap: opts.untap, telemetry: opts.telemetry });
  try {
    window.addEventListener(MOMENT_EVENT, (e) => { const d = (e as CustomEvent<{ label?: unknown }>).detail; clip.moment(typeof d?.label === 'string' ? d.label : undefined); });
    (globalThis as { __v3Clip?: unknown }).__v3Clip = { moment: clip.moment, arm: clip.arm, cancel: clip.cancel, state: () => clip.state, mode: () => clip.mode };
  } catch { /* no window */ }
  return clip;
}
