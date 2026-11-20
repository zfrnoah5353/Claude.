#!/usr/bin/env node
/* Rendu image par image d'une video ColorTweaks.
   usage : node render.js <config.json> <sortie.mkv> <rapport.json>
   - charge templates/video.html avec window.CONFIG
   - appelle render(t) pour chaque image (30 i/s), capture en JPEG, envoie a ffmpeg (copie MJPEG, sans perte supplementaire)
   - ecrit dans le rapport : evenements (pour la musique), duree, controles de mise en page */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const [cfgPath, outPath, reportPath] = process.argv.slice(2);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const FPS = 30;
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(c => { window.CONFIG = c; }, cfg);
  await page.goto('file://' + path.resolve(__dirname, 'templates/video.html'));
  await page.waitForFunction(() => window.READY !== undefined, null, { timeout: 15000 });
  await page.evaluate(() => window.READY);
  if (errors.length) { console.error('Erreurs JS :', errors); process.exit(2); }
  const info = await page.evaluate(() => ({
    duration: window.CONFIG.duration,
    scenes: window.CT.SCENES.map(s => [s.t0, s.t1]),
    events: window.getEvents(),
  }));
  const nFrames = Math.round(info.duration * FPS);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'copy', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg code ' + c)))));

  // instants de controle : fin d'entree de chaque scene (tout est affiche)
  const checks = new Set();
  info.scenes.forEach(([a, b]) => { checks.add(Math.round((a + (b - a) * 0.5) * FPS)); checks.add(Math.round(Math.min(b - 0.45, a + (b - a) * 0.8) * FPS)); });
  const layout = [];
  const keyframes = [];
  const kfDir = path.join(path.dirname(reportPath), 'keyframes');
  fs.mkdirSync(kfDir, { recursive: true });

  const cdp = await page.context().newCDPSession(page);
  const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true })).data, 'base64');
  const t0 = Date.now();
  for (let i = 0; i < nFrames; i++) {
    const t = i / FPS;
    await page.evaluate(tt => window.render(tt), t);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (checks.has(i)) {
      const bad = await page.evaluate(() => window.checkLayout());
      bad.forEach(b => layout.push(`t=${t.toFixed(2)}s ${b}`));
      const kp = path.join(kfDir, `kf_${String(i).padStart(4, '0')}.jpg`);
      fs.writeFileSync(kp, buf);
      keyframes.push(kp);
    }
    if (i % 90 === 0) process.stdout.write(`  image ${i}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  ff.stdin.end();
  await ffDone;
  await browser.close();
  if (errors.length) { console.error('Erreurs JS :', errors); process.exit(2); }
  fs.writeFileSync(reportPath, JSON.stringify({ duration: info.duration, frames: nFrames, scenes: info.scenes, events: info.events, layout, keyframes }, null, 1));
  console.log(`  rendu termine : ${nFrames} images en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch(e => { console.error(e); process.exit(1); });
