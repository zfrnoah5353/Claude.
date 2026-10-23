const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('err', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto('http://localhost:8766/export.html');
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  const n = await p.evaluate(() => window.count);
  for (let i = 0; i < n; i++) {
    const r = await p.evaluate((i) => window.exportOne(i), i);
    const dir = path.join(out, r.rarity);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, r.name + '.glb'), Buffer.from(r.glb, 'base64'));
    fs.writeFileSync(path.join(dir, r.name + '.obj'), r.obj);
    fs.writeFileSync(path.join(dir, r.name + '.mtl'), r.mtl);
    console.log(r.rarity, r.name, r.tris + ' triangles', r.meshes + ' maillages');
  }
  await b.close();
})();
