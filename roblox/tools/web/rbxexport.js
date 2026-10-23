const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  const list = JSON.parse(fs.readFileSync('petlist.json'));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8766/rbxexport.html');
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  for (const pet of list) {
    const js = await p.evaluate(([id, r, c]) => window.plan(id, r, c), [pet.id, pet.rarity, pet.color]);
    if (js.includes(']==]')) throw new Error('délimiteur');
    fs.writeFileSync(path.join(out, pet.id + '.luau'), `-- Plan généré par tools/web (rbxexport) : pièces, os et animations du pet, en JSON.\nreturn [==[${js}]==]\n`);
    const d = JSON.parse(js);
    console.log(pet.id, d.parts.length + '/' + d.total, (js.length / 1024 | 0) + ' Ko');
  }
  await b.close();
})();
