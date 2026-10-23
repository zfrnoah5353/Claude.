const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, list] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8766/fexport.html');
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  const rigs = {};
  for (const item of list.split(',')) {
    const [id, rar] = item.split(':');
    const r = await p.evaluate((id) => window.exportOne(id), id);
    const dir = path.join(out, rar); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, id + '.glb'), Buffer.from(r.glb, 'base64'));
    fs.writeFileSync(path.join(dir, id + '.obj'), r.obj);
    fs.writeFileSync(path.join(dir, id + '.mtl'), r.mtl);
    rigs[id] = r.rig;
    console.log(rar, id, r.tris, 'triangles', r.meshes, 'maillages', (fs.statSync(path.join(dir, id + '.glb')).size / 1024 | 0) + ' Ko');
  }
  fs.writeFileSync(path.join(out, 'rigs.json'), JSON.stringify(rigs));
  await b.close();
})();
