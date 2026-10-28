const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...ids] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8766/primexport.html');
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  for (const id of ids) {
    const js = await p.evaluate((id) => window.prims(id), id);
    fs.writeFileSync(path.join(out, id + '.json'), js);
    console.log(id, JSON.parse(js).prims.length, 'primitives');
  }
  await b.close();
})();
