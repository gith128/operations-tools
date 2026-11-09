// SA eBikes Operations Tools v3.8: barcode scanning.
// Each phone uses either the new scanner (zxing-wasm: an HD camera picture and a stronger decoder,
// reading only the area inside the guide box) or the classic one (html5-qrcode). From v3.5.1 the new
// one is the default. A phone keeps classic only if someone chose it with the link under the camera
// (stored as 'classic'), and falls back to classic by itself if the new one can't start.
// OpsScan.make(element) returns an object with the same start/stop/clear/isScanning as Html5Qrcode,
// so the pages don't care which engine they get.
(() => {
  const KEY = 'saeb-scan-engine';
  const isNew = () => { try { return localStorage.getItem(KEY) !== 'classic'; } catch { return true; } };
  let fellBack = false; // the new scanner couldn't start on this page, so the classic one is running
  const LOAD_WAIT = 10000; // ms to wait for the new scanner's decoder before using the classic one
  const FORMATS = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'ITF', 'Codabar', 'QRCode'];

  // ── loading the engine, once ──────────────────────────────────
  let enginePromise = null;
  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/assets/vendor/zxing-reader.js';
      s.onload = async () => {
        try {
          ZXingWASM.setZXingModuleOverrides({ locateFile: (path, prefix) => path.endsWith('.wasm') ? '/assets/vendor/' + path : prefix + path });
          await ZXingWASM.getZXingModule(); // fetch and compile the .wasm now, not on the first frame
          resolve(ZXingWASM);
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('Could not load the new scanner'));
      document.head.appendChild(s);
    });
    enginePromise.catch(() => { enginePromise = null; });
    return enginePromise;
  }

  // ── the new scanner ───────────────────────────────────────────
  function NewScanner(el) {
    this.el = typeof el === 'string' ? document.getElementById(el) : el;
    this.isScanning = false;
  }
  NewScanner.prototype.start = async function (_camera, _config, onSuccess) {
    const Z = await loadEngine();
    const wrap = document.createElement('div');
    wrap.className = 'ops-scan';
    wrap.innerHTML = '<video playsinline muted autoplay></video><div class="ops-scan-box"></div><div class="ops-scan-hint">Fill the box with the barcode</div>';
    this.el.innerHTML = ''; this.el.appendChild(wrap);
    const video = wrap.querySelector('video');
    // Ask for an HD picture: on iPhones the default is small, which leaves too few pixels per bar.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const track = this.stream.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {} // Android Chrome; iPhones focus on their own
    video.srcObject = this.stream;
    await video.play().catch(() => {});
    this.isScanning = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let busy = false;
    const tick = async () => {
      if (!this.isScanning) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        busy = true;
        try {
          // Decode only what's inside the guide box: the middle 84% of the width and 36% of the height
          // of what's on screen (the video fills the box with object-fit: cover).
          const vw = video.videoWidth, vh = video.videoHeight;
          const cw = wrap.clientWidth || vw, ch = wrap.clientHeight || vh;
          const scale = Math.max(cw / vw, ch / vh);           // screen px per video px
          const visW = cw / scale, visH = ch / scale;          // visible part of the video, in video px
          const bw = visW * 0.84, bh = visH * 0.36;
          const sx = (vw - bw) / 2, sy = (vh - bh) / 2;
          canvas.width = Math.round(bw); canvas.height = Math.round(bh);
          ctx.drawImage(video, sx, sy, bw, bh, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const res = await Z.readBarcodesFromImageData(img, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
          if (res.length && res[0].text && this.isScanning) onSuccess(res[0].text, res[0]);
        } catch {}
        busy = false;
      }
      this.timer = setTimeout(tick, 90);
    };
    tick();
  };
  NewScanner.prototype.stop = async function () {
    this.isScanning = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  };
  NewScanner.prototype.clear = function () { if (this.el) this.el.innerHTML = ''; };

  // ── the switch under the camera ───────────────────────────────
  function addSwitch(el) {
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    if (!host || !host.parentNode) return;
    let sw = host.parentNode.querySelector(':scope > .ops-scan-switch');
    if (!sw) { sw = document.createElement('div'); sw.className = 'ops-scan-switch'; host.after(sw); }
    sw.innerHTML = fellBack
      ? 'Classic scanner (the new one couldn\'t start here)'
      : isNew()
        ? 'Trouble scanning? <a href="#" data-to="classic">Use the classic scanner</a>'
        : 'Classic scanner · <a href="#" data-to="new">Use the new scanner</a>';
    if (fellBack) return;
    sw.querySelector('a').onclick = e => {
      e.preventDefault();
      try { localStorage.setItem(KEY, e.target.dataset.to); } catch {}
      addSwitch(el);
      sw.insertAdjacentHTML('beforeend', '<br><b>Stop and start scanning to use it.</b>');
    };
  }

  const css = document.createElement('style');
  css.textContent = `
.ops-scan{position:relative;width:100%;aspect-ratio:3/4;max-height:62vh;background:#000;border-radius:12px;overflow:hidden}
.ops-scan video{width:100%;height:100%;object-fit:cover;display:block}
.ops-scan-box{position:absolute;left:8%;right:8%;top:32%;height:36%;border:3px solid var(--accent-glow);border-radius:10px;box-shadow:0 0 0 2000px rgba(0,0,0,.35)}
.ops-scan-hint{position:absolute;left:0;right:0;bottom:10px;text-align:center;color:#fff;font:700 12px 'Syne',sans-serif;text-shadow:0 1px 2px #000}
.ops-scan-wait{padding:28px 12px;text-align:center;font:700 13px 'Syne',sans-serif;color:#5a6269}
.ops-scan-switch{font:400 12px 'Syne',sans-serif;color:#5a6269;text-align:center;margin:6px 0 10px}
.ops-scan-switch a{color:var(--accent-text);font-weight:700}`;
  document.head.appendChild(css);

  // Pages with a camera start fetching the decoder once they've loaded, so it's ready by the first tap.
  if (isNew()) {
    const warm = () => loadEngine().catch(() => {});
    if (document.readyState === 'complete') setTimeout(warm, 1500); else window.addEventListener('load', () => setTimeout(warm, 1500));
  }

  // ── scan feedback and camera errors (v3.8) ──────────────────────────────
  // Sounds: one short beep for OK, two for a warning, a low tone for refused, plus vibration where the
  // phone allows it (Android; iPhones don't let web pages vibrate). On by default; each phone can turn
  // them off. An iPhone's silent switch also silences them. The sound has to be woken by a tap
  // (Start Scanning or adding by hand) before the first scan can play it.
  const SOUND_KEY = 'saeb-sound';
  let audio = null;
  const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
  function unlockSound() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch {}
  }
  function tone(freq, start, dur, vol, type) {
    const t = audio.currentTime + start, o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function feedback(kind) {
    if (!soundOn()) return;
    try {
      unlockSound();
      if (audio) {
        if (kind === 'ok') tone(1320, 0, 0.12);
        else if (kind === 'warn') { tone(880, 0, 0.1); tone(880, 0.17, 0.1); }
        else tone(196, 0, 0.5, 0.3, 'square');
      }
      if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 60 : kind === 'warn' ? [70, 90, 70] : 350);
    } catch {}
  }
  // A plain explanation of why the camera didn't start, for this kind of phone.
  function cameraError(e) {
    const name = (e && e.name) || '', text = String((e && e.message) || e || '');
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (name === 'NotAllowedError' || name === 'SecurityError' || /ermission|denied|not allowed/i.test(text))
      return iphone ? 'Camera blocked for this site. Tap aA in the address bar → Website Settings → Camera → Allow (or Settings → Safari → Camera), then reload the page.'
        : 'Camera blocked for this site. Tap the icon left of the address → Permissions → Camera → Allow, then reload the page.';
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' || /in use|could not start|busy/i.test(text))
      return 'The camera is in use by something else (a call, or the Camera app). Close it, then tap Start Scanning.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || /not found|no camera/i.test(text))
      return 'No camera found on this phone. Type the bike ID instead.';
    return 'The camera didn\'t start. Tap Start Scanning to try again, or type the bike ID.';
  }

  window.OpsScan = {
    isNew,
    loadEngine,
    feedback, unlockSound, cameraError,
    sound: { on: soundOn, set(v) { try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch {} if (v) { unlockSound(); feedback('ok'); } } },
    // The scanner this phone uses. Falls back to the classic one if the new one can't start.
    make(el) {
      fellBack = false;
      addSwitch(el);
      if (!isNew()) return new Html5Qrcode(el);
      const n = new NewScanner(el);
      const start = n.start.bind(n), stopNew = n.stop.bind(n), clearNew = n.clear.bind(n);
      // Stopping while it's still starting (the pages call clear()) means the camera mustn't open after all.
      let cancelled = false;
      n.clear = () => { cancelled = true; clearNew(); };
      n.start = async (...args) => {
        const host = typeof el === 'string' ? document.getElementById(el) : el;
        if (host) host.innerHTML = '<div class="ops-scan-wait">Starting the scanner…</div>';
        try {
          // The first time on a phone, the decoder (about 930 KB) may still be downloading. On a poor
          // signal, don't keep staff waiting: use the classic scanner this time; the download carries on.
          await Promise.race([loadEngine(), new Promise((_, rej) => setTimeout(() => rej(new Error('The new scanner is still loading')), LOAD_WAIT))]);
          if (cancelled) return;
          await start(...args);
          if (cancelled) await stopNew();
          return;
        }
        catch (e) {
          if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) { await stopNew().catch(() => {}); throw e; } // camera refused: same for both
          await stopNew().catch(() => {}); // release the camera if the new scanner got that far
          if (cancelled) return;
          console.warn('New scanner failed, using the classic one', e);
          fellBack = true; addSwitch(el);
          if (host) host.innerHTML = '';
          const c = new Html5Qrcode(el);
          Object.assign(n, { stop: () => c.stop(), clear: () => c.clear() });
          Object.defineProperty(n, 'isScanning', { get: () => c.isScanning, configurable: true });
          return c.start(...args);
        }
      };
      return n;
    },
  };
})();
