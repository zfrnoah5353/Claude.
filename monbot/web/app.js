// Panel du bot : se connecte à l'API du bot et construit les pages à partir du schéma des modules.
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const S = { url: '', key: '', info: null, schema: [], guilds: [], guild: null, page: 'dashboard', draft: null, dirty: false };

function toast(msg, isErr = false) {
  const t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
  $('#toasts').append(t); setTimeout(() => t.remove(), 4000);
}
async function api(path, opts = {}) {
  const r = await fetch(S.url.replace(/\/$/, '') + '/api' + path, { ...opts, headers: { 'content-type': 'application/json', 'x-panel-key': S.key }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}
const fmtDate = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const fmtUp = (ms) => { const d = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return `${d ? d + 'j ' : ''}${hh}h ${m}min`; };

// ---------------- Connexion ----------------
async function connect(url, key, remember) {
  S.url = url.trim(); S.key = key.trim();
  if (!/^https?:\/\//.test(S.url)) S.url = 'http://' + S.url;
  S.info = await api('/info');
  S.schema = await api('/schema');
  S.guilds = await api('/guilds');
  if (remember) store.set('conn', { url: S.url, key: S.key }); else store.set('conn', { url: S.url });
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#bot-avatar').src = S.info.avatar; $('#bot-name').textContent = S.info.name;
  document.title = `Panel · ${S.info.name}`;
  $('#bot-status').textContent = `🟢 En ligne · ${S.info.ping} ms`;
  renderGuilds();
  const last = store.get('lastGuild');
  if (S.guilds.length) await selectGuild(S.guilds.find(g => g.id === last)?.id || S.guilds[0].id);
  else renderNoGuild();
}
function showLogin(errMsg = '') {
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  const c = store.get('conn', {}); if (c.url) $('#l-url').value = c.url; if (c.key) $('#l-key').value = c.key;
  // Ouvert dans un navigateur depuis le bot lui-même : l'adresse est celle de la page
  if (!c.url && location.protocol.startsWith('http') && location.hostname !== 'monbot.app') $('#l-url').value = location.origin;
  if (!c.url && location.hostname === 'monbot.app') $('#l-url').value = ''; // appli téléphone : l'adresse est envoyée par le bot en MP
  $('#l-err').textContent = errMsg;
}
$('#l-go').onclick = async () => {
  $('#l-err').textContent = ''; $('#l-go').disabled = true; $('#l-go').textContent = 'Connexion…';
  try { await connect($('#l-url').value, $('#l-key').value, $('#l-remember').checked); }
  catch (e) { $('#l-err').textContent = e.message === 'Failed to fetch' ? 'Impossible de joindre le bot. Est-il allumé ? L\'adresse est-elle bonne ?' : e.message; }
  $('#l-go').disabled = false; $('#l-go').textContent = 'Se connecter';
};
$('#l-key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#l-go').click(); });
$('#logout').onclick = () => { if (!confirmLeave()) return; store.set('conn', { url: S.url }); S.key = ''; showLogin(); };

// ---------------- Serveurs ----------------
function renderGuilds() {
  const nav = $('#guilds'); nav.innerHTML = '';
  for (const g of S.guilds) {
    nav.append(h('div', { class: 'g-icon' + (S.guild?.id === g.id ? ' active' : ''), title: g.name, onclick: () => { if (confirmLeave()) selectGuild(g.id); } },
      g.icon ? h('img', { src: g.icon, alt: '' }) : g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3)));
  }
  nav.append(h('div', { class: 'g-sep' }));
  nav.append(h('div', { class: 'g-icon g-add', title: 'Ajouter le bot à un serveur', onclick: () => window.open(S.info.invite) }, '+'));
  nav.append(h('div', { class: 'g-icon', title: 'Actualiser', onclick: async () => { S.guilds = await api('/guilds'); renderGuilds(); toast('Liste des serveurs actualisée'); } }, '⟳'));
}
function renderNoGuild() {
  $('#guild-head').textContent = 'Aucun serveur';
  $('#side-menu').innerHTML = '';
  $('#main').innerHTML = '';
  $('#main').append(h('div', { class: 'empty' }, h('div', { class: 'e' }, '🤖'), h('h2', {}, 'Le bot n\'est sur aucun serveur'), h('p', {}, 'Invite-le sur ton serveur pour commencer.'), h('button', { class: 'btn primary', onclick: () => window.open(S.info.invite) }, 'Inviter le bot')));
}
async function selectGuild(id) {
  try {
    S.guild = await api(`/guilds/${id}`);
    store.set('lastGuild', id);
    renderGuilds(); renderSide(); go(S.page || 'dashboard');
  } catch (e) { toast(e.message, true); }
}

// ---------------- Menu ----------------
const PAGES = [
  { id: 'dashboard', name: 'Tableau de bord', icon: '📊' },
  { id: 'modules', name: 'Tous les modules', icon: '🧩' },
  { id: 'sanctions', name: 'Sanctions', icon: '⚖️', need: 'moderation' },
  { id: 'tickets-view', name: 'Tickets & avis', icon: '📬', need: 'tickets' },
  { id: 'giveaways-view', name: 'Giveaways', icon: '🎉', need: 'giveaway' },
  { id: 'backups-view', name: 'Sauvegardes', icon: '🗄️', need: 'backup' },
  { id: 'access', name: 'Accès au panel', icon: '👥', admin: true },
];
function renderSide() {
  $('#guild-head').textContent = S.guild.name;
  const m = $('#side-menu'); m.innerHTML = '';
  m.append(h('div', { class: 'side-cat' }, 'Général'));
  for (const p of PAGES) {
    if (p.need && !S.schema.some(x => x.id === p.need)) continue;
    if (p.admin && !S.info.me.admin) continue;
    m.append(h('div', { class: 'side-item' + (S.page === p.id ? ' active' : ''), onclick: () => go(p.id) }, h('span', { class: 'ico' }, p.icon), h('span', { class: 'lbl' }, p.name)));
  }
  m.append(h('div', { class: 'side-cat' }, `Modules (${S.schema.length})`));
  for (const mod of S.schema) {
    const on = S.guild.config[mod.id]?.enabled;
    m.append(h('div', { class: 'side-item' + (S.page === 'mod:' + mod.id ? ' active' : ''), onclick: () => go('mod:' + mod.id) }, h('span', { class: 'ico' }, mod.icon), h('span', { class: 'lbl' }, mod.name), h('span', { class: 'dot' + (on ? ' on' : '') })));
  }
}
function confirmLeave() {
  if (!S.dirty) return true;
  const sb = $('#savebar'); sb.classList.remove('shake'); void sb.offsetWidth; sb.classList.add('shake');
  return window.confirm('Tu as des modifications non enregistrées. Les abandonner ?') && (setDirty(false), true);
}
function go(page) {
  if (page !== S.page && !confirmLeave()) return;
  S.page = page; setDirty(false); renderSide();
  const main = $('#main'); main.innerHTML = ''; main.scrollTop = 0;
  const fn = page.startsWith('mod:') ? () => pageModule(page.slice(4)) : ({ dashboard: pageDashboard, modules: pageModules, sanctions: pageSanctions, 'tickets-view': pageTickets, 'giveaways-view': pageGiveaways, 'backups-view': pageBackups, access: pageAccess })[page];
  Promise.resolve(fn ? fn(main) : null).catch(e => { main.append(h('div', { class: 'card' }, '❌ ' + e.message)); });
}
const title = (icon, name, desc) => [h('div', { class: 'page-title' }, h('span', { class: 'big-ico' }, icon), h('h1', {}, name)), h('p', { class: 'page-desc' }, desc || '')];

// ---------------- Tableau de bord ----------------
async function pageDashboard(main) {
  main.append(...title('📊', 'Tableau de bord', `Vue d'ensemble de ${S.guild.name}`));
  const st = await api(`/guilds/${S.guild.id}/stats`);
  const info = await api('/info'); S.info = { ...S.info, ...info };
  $('#bot-status').textContent = `🟢 En ligne · ${info.ping} ms`;
  const stat = (v, k) => h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  main.append(h('div', { class: 'grid g4' }, stat(st.members.toLocaleString('fr-FR'), 'Membres'), stat(st.online, 'En ligne'), stat(st.openTickets, 'Tickets ouverts'), stat(st.giveaways, 'Giveaways en cours')));
  main.append(h('div', { class: 'grid g4', style: 'margin-top:16px' }, stat(st.boosts, 'Boosts'), stat(st.avgReview ? st.avgReview + ' ⭐' : '—', 'Note moyenne'), stat(st.raid ? '🚨 ACTIF' : 'Non', 'Mode raid'), stat(fmtUp(info.uptime), 'Bot en ligne depuis')));
  if (!S.guild.botAdmin) main.append(h('div', { class: 'card', style: 'margin-top:16px;border-left:4px solid var(--warn)' }, '⚠️ Le bot n\'a pas la permission Administrateur sur ce serveur : certaines fonctions peuvent ne pas marcher. Place aussi son rôle tout en haut de la liste des rôles.'));

  // Graphiques par jour
  const days = []; for (let k = 13; k >= 0; k--) days.push(new Date(Date.now() - k * 864e5).toISOString().slice(0, 10));
  const sum = (name) => days.map(d => st.days.filter(x => x.day === d && (name === 'cmd' ? x.name.startsWith('cmd:') : x.name === name)).reduce((a, x) => a + x.count, 0));
  const chart = (label, vals) => {
    const max = Math.max(1, ...vals);
    return h('div', { class: 'card' }, h('h3', {}, label), h('div', { class: 'chart' }, vals.map((v, k) => h('div', { class: 'bar', style: `height:${(v / max) * 100}%`, 'data-tip': `${days[k].slice(5).split('-').reverse().join('/')} : ${v}` }))),
      h('div', { class: 'chart-labels' }, days.map(d => h('span', {}, d.slice(8)))));
  };
  main.append(h('div', { class: 'grid g2', style: 'margin-top:16px' }, chart('💬 Messages par jour', sum('messages')), chart('⌨️ Commandes utilisées', sum('cmd'))));
  main.append(h('div', { class: 'grid g2' }, chart('📥 Arrivées', sum('join')), chart('📤 Départs', sum('leave'))));
  const cmds = {}; st.days.filter(x => x.name.startsWith('cmd:')).forEach(x => { cmds[x.name.slice(4)] = (cmds[x.name.slice(4)] || 0) + x.count; });
  const top = Object.entries(cmds).sort((a, b) => b[1] - a[1]).slice(0, 8);
  main.append(h('div', { class: 'grid g3' },
    h('div', { class: 'card' }, h('h3', {}, '⌨️ Commandes les plus utilisées'), top.length ? top.map(([n, c]) => h('div', { class: 'row-toggle' }, h('span', {}, '/' + n), h('b', {}, c))) : h('p', { class: 'muted' }, 'Aucune pour l\'instant.')),
    h('div', { class: 'card' }, h('h3', {}, '📈 Meilleurs niveaux'), st.topLevels.length ? st.topLevels.map((m, k) => h('div', { class: 'row-toggle' }, h('span', {}, `${k + 1}. ${m.name}`), h('b', {}, 'Niv. ' + m.level))) : h('p', { class: 'muted' }, 'Personne.')),
    h('div', { class: 'card' }, h('h3', {}, '💰 Les plus riches'), st.topMoney.length ? st.topMoney.map((m, k) => h('div', { class: 'row-toggle' }, h('span', {}, `${k + 1}. ${m.name}`), h('b', {}, m.money.toLocaleString('fr-FR')))) : h('p', { class: 'muted' }, 'Personne.'))));
}

function pageModules(main) {
  main.append(...title('🧩', 'Tous les modules', 'Active seulement ce dont tu as besoin. Clique sur un module pour le régler.'));
  main.append(h('div', { class: 'module-grid' }, S.schema.map(mod => {
    const on = !!S.guild.config[mod.id]?.enabled;
    const sw = h('label', { class: 'switch', onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: on, onchange: async (e) => {
      try { const r = await api(`/guilds/${S.guild.id}/modules/${mod.id}`, { method: 'PUT', body: { enabled: e.target.checked } }); S.guild.config[mod.id] = { ...S.guild.config[mod.id], ...r }; renderSide(); toast(`${mod.name} ${e.target.checked ? 'activé' : 'désactivé'}`); }
      catch (er) { toast(er.message, true); e.target.checked = !e.target.checked; }
    } }), h('span'));
    return h('div', { class: 'module-card', onclick: () => go('mod:' + mod.id) }, h('div', { class: 'mc-top' }, h('span', {}, `${mod.icon} ${mod.name}`), sw), h('p', {}, mod.desc));
  })));
}

// ---------------- Formulaires des modules ----------------
function setDirty(v) { S.dirty = v; $('#savebar').classList.toggle('hidden', !v); }
const chans = (type) => S.guild.channels.filter(c => type === 'any' ? c.type !== 'category' : c.type === type);
function channelLabel(c) { const p = S.guild.channels.find(x => x.id === c.parent); return (c.type === 'voice' ? '🔊 ' : c.type === 'category' ? '📁 ' : '# ') + c.name + (p ? `  (${p.name})` : ''); }
function roleById(id) { return S.guild.roles.find(r => r.id === id); }

function pickerOptions(type) {
  if (type === 'channel' || type === 'channels') return chans('text').map(c => [c.id, channelLabel(c)]);
  if (type === 'voice') return chans('voice').map(c => [c.id, channelLabel(c)]);
  if (type === 'category') return chans('category').map(c => [c.id, channelLabel(c)]);
  return S.guild.roles.map(r => [r.id, (r.id === S.guild.id ? '' : '@') + r.name + (r.manageable ? '' : '  ⚠️ au-dessus du bot')]);
}

function fieldInput(f, value, onChange) {
  switch (f.type) {
    case 'toggle': return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }), h('span'));
    case 'text': return h('input', { value: value ?? '', oninput: (e) => onChange(e.target.value) });
    case 'textarea': return h('textarea', { oninput: (e) => onChange(e.target.value) }, value ?? '');
    case 'number': return h('input', { type: 'number', value: value ?? 0, min: f.min, max: f.max, oninput: (e) => onChange(e.target.value === '' ? 0 : Number(e.target.value)) });
    case 'color': return h('input', { type: 'color', value: value || '#5865f2', oninput: (e) => onChange(e.target.value) });
    case 'select': return h('select', { onchange: (e) => onChange(e.target.value) }, f.options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    case 'channel': case 'voice': case 'category': case 'role': {
      const opts = pickerOptions(f.type);
      return h('select', { onchange: (e) => onChange(e.target.value) }, h('option', { value: '' }, '— Aucun —'), opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
        value && !opts.some(([v]) => v === value) ? h('option', { value, selected: true }, '(supprimé) ' + value) : null);
    }
    case 'roles': case 'channels': {
      let list = [...(value || [])];
      const box = h('div', { class: 'chips' });
      const draw = () => {
        box.innerHTML = '';
        for (const id of list) {
          const r = f.type === 'roles' ? roleById(id) : S.guild.channels.find(c => c.id === id);
          box.append(h('span', { class: 'chip' }, f.type === 'roles' ? h('span', { class: 'rc', style: `background:${r?.color && r.color !== '#000000' ? r.color : '#99aab5'}` }) : null, r ? (f.type === 'roles' ? r.name : '#' + r.name) : '(supprimé)',
            h('button', { title: 'Retirer', onclick: () => { list = list.filter(x => x !== id); onChange(list); draw(); } }, '✕')));
        }
        box.append(h('select', { onchange: (e) => { if (e.target.value && !list.includes(e.target.value)) { list.push(e.target.value); onChange(list); draw(); } } },
          h('option', { value: '' }, '+ Ajouter…'), pickerOptions(f.type).filter(([v]) => !list.includes(v)).map(([v, l]) => h('option', { value: v }, l))));
      };
      draw(); return box;
    }
    case 'list': {
      let list = [...(value || [])];
      const box = h('div', { class: 'chips' });
      const draw = () => {
        box.innerHTML = '';
        for (const [k, w] of list.entries()) box.append(h('span', { class: 'chip' }, w, h('button', { onclick: () => { list.splice(k, 1); onChange(list); draw(); } }, '✕')));
        const inp = h('input', { placeholder: 'Écris puis Entrée…', onkeydown: (e) => {
          if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); list.push(inp.value.trim()); onChange(list); draw(); box.querySelector('input').focus(); }
          if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); onChange(list); draw(); box.querySelector('input').focus(); }
        } });
        box.append(inp);
      };
      draw(); return box;
    }
    case 'objlist': {
      let list = structuredClone(value || []);
      const wrap = h('div');
      const draw = () => {
        wrap.innerHTML = '';
        list.forEach((obj, k) => {
          const first = f.fields.find(x => x.type === 'text');
          const card = h('div', { class: 'obj' }, h('div', { class: 'obj-head' }, h('span', {}, `#${k + 1} ${first && obj[first.key] ? '· ' + obj[first.key] : ''}`),
            h('div', {}, k > 0 ? h('button', { class: 'icon-btn', title: 'Monter', onclick: () => { [list[k - 1], list[k]] = [list[k], list[k - 1]]; onChange(list); draw(); } }, '↑') : null,
              h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => { list.splice(k, 1); onChange(list); draw(); } }, '🗑️'))));
          for (const sf of f.fields) card.append(fieldRow(sf, obj[sf.key], (v) => { obj[sf.key] = v; onChange(list); }));
          wrap.append(card);
        });
        wrap.append(h('button', { class: 'btn small primary', onclick: () => { list.push(Object.fromEntries(f.fields.map(x => [x.key, structuredClone(x.default)]))); onChange(list); draw(); } }, '+ Ajouter'));
      };
      draw(); return wrap;
    }
  }
  return h('span', {}, '?');
}
function fieldRow(f, value, onChange) {
  if (f.type === 'toggle') return h('div', { class: 'row-toggle' }, h('div', {}, h('div', { class: 't' }, f.label), f.help ? h('div', { class: 'field-help' }, f.help) : null), fieldInput(f, value, onChange));
  return h('div', { class: 'field' }, h('label', {}, f.label), fieldInput(f, value, onChange), f.help ? h('div', { class: 'field-help' }, f.help) : null);
}

const VARS_HELP = 'Variables : {mention} {user} {server} {count} {level} {inviter} {invites}';
function pageModule(id) {
  const mod = S.schema.find(m => m.id === id); const main = $('#main');
  if (!mod) return main.append(h('div', { class: 'card' }, 'Module introuvable.'));
  S.draft = structuredClone(S.guild.config[id] || {});
  const original = JSON.stringify(S.draft);
  const change = (k, v) => { S.draft[k] = v; setDirty(JSON.stringify(S.draft) !== original); };
  main.append(...title(mod.icon, mod.name, mod.desc));

  const enabled = mod.fields.find(f => f.key === 'enabled');
  if (enabled) main.append(h('div', { class: 'module-top' }, h('div', {}, h('div', { class: 'state' }, 'Activer le module'), h('div', { class: 'muted' }, 'Désactivé, ses commandes et ses automatismes s\'arrêtent.')), fieldInput(enabled, S.draft.enabled, (v) => change('enabled', v))));

  if (mod.actions?.length || id === 'welcome' || id === 'giveaway') {
    const bar = h('div', { class: 'actions-bar' });
    for (const a of mod.actions || []) bar.append(h('button', { class: 'btn primary', onclick: () => runAction(`${id}.${a.id}`) }, '🚀 ' + a.label));
    if (id === 'welcome') bar.append(h('button', { class: 'btn', onclick: () => runAction('welcome.test') }, '🧪 Envoyer un test'));
    if (id === 'giveaway') bar.append(h('button', { class: 'btn primary', onclick: () => go('giveaways-view') }, '🎉 Lancer un giveaway'));
    main.append(h('div', { class: 'card' }, h('h3', {}, 'Actions'), h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Pense à enregistrer tes réglages avant de lancer une action.'), bar));
  }
  if (id === 'honte') shameTools(main);

  const rest = mod.fields.filter(f => f.key !== 'enabled');
  const toggles = rest.filter(f => f.type === 'toggle'); const others = rest.filter(f => f.type !== 'toggle');
  const big = others.filter(f => f.type === 'objlist'); const small = others.filter(f => f.type !== 'objlist');
  if (small.length) {
    const card = h('div', { class: 'card' }, h('h3', {}, 'Réglages'));
    for (const f of small) card.append(fieldRow(f, S.draft[f.key], (v) => change(f.key, v)));
    if (small.some(f => f.type === 'textarea')) card.append(h('div', { class: 'field-help', style: 'margin-top:12px' }, VARS_HELP));
    main.append(card);
  }
  if (toggles.length) {
    const card = h('div', { class: 'card' }, h('h3', {}, 'Options'));
    for (const f of toggles) card.append(fieldRow(f, S.draft[f.key], (v) => change(f.key, v)));
    main.append(card);
  }
  for (const f of big) main.append(h('div', { class: 'card' }, h('h3', {}, f.label), f.help ? h('p', { class: 'muted' }, f.help) : null, fieldInput(f, S.draft[f.key], (v) => change(f.key, v))));

  $('#sb-save').onclick = async () => {
    try {
      const r = await api(`/guilds/${S.guild.id}/modules/${id}`, { method: 'PUT', body: S.draft });
      S.guild.config[id] = r; setDirty(false); toast('✅ Réglages enregistrés'); go('mod:' + id);
    } catch (e) { toast(e.message, true); }
  };
  $('#sb-reset').onclick = () => { setDirty(false); go('mod:' + id); };
}
// ---------------- Mur de la honte : choisir un membre, l'IA écrit, on relit, on envoie ----------------
function shameTools(main) {
  const st = { user: null, timer: null };
  const search = h('input', { placeholder: '🔎 Tape un pseudo…' });
  const results = h('div', { class: 'shame-results' });
  const chosen = h('div', { class: 'muted', style: 'margin-top:6px' }, 'Aucun membre choisi.');
  const reason = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Ex : il a perdu toutes ses pièces au casino en 2 minutes' });
  const tone = h('select', {}, [['', 'Ton par défaut (réglages)'], ['taquin', 'Taquin (gentil)'], ['moqueur', 'Moqueur'], ['theatral', 'Théâtral (crieur public)'], ['sanspitie', 'Sans pitié (roast)']].map(([v, l]) => h('option', { value: v }, l)));
  const preview = h('textarea', { rows: 6, maxlength: 1500, placeholder: 'Le message écrit par l\'IA apparaîtra ici. Tu peux le modifier avant de l\'envoyer.' });
  const genBtn = h('button', { class: 'btn primary' }, '🤖 Générer avec l\'IA');
  const sendBtn = h('button', { class: 'btn', disabled: true }, '📢 Envoyer sur Discord');
  const hist = h('div');

  const pick = (m) => { st.user = m; results.innerHTML = ''; search.value = ''; chosen.innerHTML = ''; chosen.append(h('img', { src: m.avatar, style: 'width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px' }), h('b', {}, m.name), ` (@${m.user})`); };
  search.oninput = () => {
    clearTimeout(st.timer); const q = search.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    st.timer = setTimeout(async () => {
      try {
        const list = await api(`/guilds/${S.guild.id}/members?q=${encodeURIComponent(q)}`); results.innerHTML = '';
        for (const m of list) results.append(h('div', { class: 'side-item', onclick: () => pick(m) }, h('img', { src: m.avatar, style: 'width:22px;height:22px;border-radius:50%' }), h('span', { class: 'lbl' }, `${m.name} (@${m.user})`)));
        if (!list.length) results.append(h('div', { class: 'muted' }, 'Personne trouvé.'));
      } catch (e) { toast(e.message, true); }
    }, 300);
  };
  preview.oninput = () => { sendBtn.disabled = !st.user || !preview.value.trim(); };
  genBtn.onclick = async () => {
    if (!st.user) return toast('Choisis d\'abord un membre.', true);
    genBtn.disabled = true; genBtn.textContent = '⏳ L\'IA réfléchit…';
    try {
      const r = await api(`/guilds/${S.guild.id}/actions/honte.generate`, { method: 'POST', body: { user: st.user.id, reason: reason.value, tone: tone.value } });
      preview.value = r.message; sendBtn.disabled = false;
    } catch (e) { toast(e.message, true); }
    genBtn.disabled = false; genBtn.textContent = '🤖 Générer avec l\'IA';
  };
  sendBtn.onclick = async () => {
    sendBtn.disabled = true;
    try { const r = await api(`/guilds/${S.guild.id}/actions/honte.send`, { method: 'POST', body: { user: st.user.id, text: preview.value, reason: reason.value } }); toast(r.message); preview.value = ''; drawHist(); }
    catch (e) { toast(e.message, true); sendBtn.disabled = false; }
  };
  const drawHist = async () => {
    try {
      const r = await api(`/guilds/${S.guild.id}/actions/honte.history`, { method: 'POST', body: {} }); hist.innerHTML = '';
      if (!r.message.length) return hist.append(h('p', { class: 'muted' }, 'Personne n\'est encore passé sur le mur 👼'));
      for (const x of r.message.slice(0, 10)) hist.append(h('div', { class: 'obj' }, h('div', { class: 'obj-head' }, h('span', {}, `🔔 ${x.name}${x.reason ? ' — ' + x.reason : ''}`), h('span', { class: 'muted' }, `${fmtDate(x.at)} · ${x.by}`)), h('div', { style: 'white-space:pre-wrap' }, x.text)));
    } catch (e) { hist.append(h('p', { class: 'muted' }, e.message)); }
  };
  main.append(h('div', { class: 'card' }, h('h3', {}, '🔔 Créer un message de honte'),
    h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Choisis un membre et dis ce qu\'il a fait. L\'IA écrit le message, tu le relis, puis tu l\'envoies dans le salon du mur.'),
    h('div', { class: 'field' }, h('label', {}, 'Membre'), search, results, chosen),
    h('div', { class: 'field' }, h('label', {}, 'Qu\'est-ce qu\'il a fait ?'), reason),
    h('div', { class: 'field' }, h('label', {}, 'Ton'), tone),
    h('div', { class: 'actions-bar' }, genBtn),
    h('div', { class: 'field' }, h('label', {}, 'Aperçu (modifiable)'), preview),
    h('div', { class: 'actions-bar' }, sendBtn)));
  main.append(h('div', { class: 'card' }, h('h3', {}, '📜 Derniers passages sur le mur'), hist));
  drawHist();
}
async function runAction(action, body = {}) {
  try { const r = await api(`/guilds/${S.guild.id}/actions/${action}`, { method: 'POST', body }); toast(r.message || 'Fait ✅'); if (action === 'roles.sendRolePanels') S.guild = await api(`/guilds/${S.guild.id}`); return true; }
  catch (e) { toast(e.message, true); return false; }
}

// ---------------- Sanctions ----------------
async function pageSanctions(main) {
  main.append(...title('⚖️', 'Sanctions', 'Historique de toutes les sanctions du serveur.'));
  const list = await api(`/guilds/${S.guild.id}/sanctions`);
  const search = h('input', { placeholder: '🔎 Rechercher un membre, une raison…', style: 'margin-bottom:12px' });
  const tbody = h('tbody');
  const draw = () => {
    const q = search.value.toLowerCase(); tbody.innerHTML = '';
    for (const s of list.filter(x => !q || `${x.userName} ${x.reason} ${x.type} ${x.modName}`.toLowerCase().includes(q))) {
      tbody.append(h('tr', {}, h('td', {}, '#' + s.id), h('td', {}, h('span', { class: 'tag ' + s.type }, s.type)), h('td', {}, s.userName), h('td', {}, s.reason), h('td', {}, s.modName), h('td', {}, fmtDate(s.created)),
        h('td', {}, h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { if (!confirm(`Supprimer la sanction #${s.id} ?`)) return; await api(`/guilds/${S.guild.id}/sanctions/${s.id}`, { method: 'DELETE' }); list.splice(list.indexOf(s), 1); draw(); toast('Sanction supprimée'); } }, '🗑️'))));
    }
    if (!tbody.children.length) tbody.append(h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Aucune sanction 👼')));
  };
  search.oninput = draw; draw();
  main.append(h('div', { class: 'card' }, search, h('table', {}, h('thead', {}, h('tr', {}, ['N°', 'Type', 'Membre', 'Raison', 'Par', 'Date', ''].map(x => h('th', {}, x)))), tbody)));
}

// ---------------- Tickets ----------------
async function pageTickets(main) {
  main.append(...title('📬', 'Tickets & avis', 'Tickets ouverts et avis laissés par les membres.'));
  const d = await api(`/guilds/${S.guild.id}/tickets`);
  main.append(h('div', { class: 'actions-bar', style: 'margin-bottom:16px' }, h('button', { class: 'btn primary', onclick: () => go('mod:tickets') }, '⚙️ Régler les tickets'), h('button', { class: 'btn', onclick: () => runAction('tickets.sendPanel') }, '🚀 Envoyer le panel')));
  main.append(h('div', { class: 'card' }, h('h3', {}, `🎫 Tickets ouverts (${d.open.length})`),
    d.open.length ? h('table', {}, h('thead', {}, h('tr', {}, ['N°', 'Salon', 'Catégorie', 'Membre', 'Priorité', 'Ouvert le'].map(x => h('th', {}, x)))),
      h('tbody', {}, d.open.map(t => h('tr', {}, h('td', {}, '#' + t.n), h('td', {}, '#' + (t.channelName || '?')), h('td', {}, t.typeLabel || '—'), h('td', {}, t.ownerName || t.owner), h('td', {}, t.priority), h('td', {}, fmtDate(t.created)))))) : h('p', { class: 'muted' }, 'Aucun ticket ouvert.')));
  const avg = d.reviews.length ? (d.reviews.reduce((a, r) => a + r.stars, 0) / d.reviews.length).toFixed(1) : '—';
  main.append(h('div', { class: 'card' }, h('h3', {}, `⭐ Avis (moyenne ${avg}/5)`),
    d.reviews.length ? d.reviews.map(r => h('div', { class: 'row-toggle' }, h('div', {}, h('div', { class: 't' }, `${'⭐'.repeat(r.stars)} · ${r.userName} · ${r.label}`), h('div', { class: 'muted' }, r.comment || '—')), h('span', { class: 'muted' }, fmtDate(r.at)))) : h('p', { class: 'muted' }, 'Aucun avis.')));
}

// ---------------- Giveaways ----------------
async function pageGiveaways(main) {
  main.append(...title('🎉', 'Giveaways', 'Lance un giveaway sans taper de commande.'));
  const f = { channel: '', prize: '', duration: '1d', winners: 1, description: '', requiredRole: '', minLevel: 0 };
  const card = h('div', { class: 'card' }, h('h3', {}, 'Nouveau giveaway'));
  const defs = [
    { key: 'prize', label: 'Lot à gagner', type: 'text' }, { key: 'channel', label: 'Salon', type: 'channel' }, { key: 'duration', label: 'Durée (ex : 30m, 2h, 1d, 1w)', type: 'text' },
    { key: 'winners', label: 'Nombre de gagnants', type: 'number', min: 1, max: 50 }, { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'requiredRole', label: 'Rôle requis (optionnel)', type: 'role' }, { key: 'minLevel', label: 'Niveau minimum (0 = aucun)', type: 'number', min: 0 },
  ];
  const grid = h('div', { class: 'grid g2' }); for (const d of defs) grid.append(fieldRow(d, f[d.key], (v) => { f[d.key] = v; })); card.append(grid);
  card.append(h('button', { class: 'btn success', style: 'margin-top:16px', onclick: async () => { if (!f.prize || !f.channel) return toast('Indique le lot et le salon.', true); if (await runAction('giveaway.create', f)) setTimeout(() => go('giveaways-view'), 600); } }, '🎉 Lancer le giveaway'));
  main.append(card);
  const list = await api(`/guilds/${S.guild.id}/giveaways`);
  main.append(h('div', { class: 'card' }, h('h3', {}, 'Historique'), list.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Lot', 'Salon', 'Participants', 'Fin', 'État'].map(x => h('th', {}, x)))),
    h('tbody', {}, list.map(g => h('tr', {}, h('td', {}, g.prize), h('td', {}, '#' + (g.channelName || '?')), h('td', {}, g.entries), h('td', {}, fmtDate(g.end)), h('td', {}, g.ended ? '✅ Terminé' : '⏳ En cours'))))) : h('p', { class: 'muted' }, 'Aucun giveaway.')));
}

// ---------------- Sauvegardes ----------------
async function pageBackups(main) {
  main.append(...title('🗄️', 'Sauvegardes', 'Sauvegarde les rôles, salons et réglages du serveur. Restauration avec /backup restore (propriétaire).'));
  main.append(h('div', { class: 'actions-bar', style: 'margin-bottom:16px' }, h('button', { class: 'btn primary', onclick: async () => { if (await runAction('backup.createBackup')) go('backups-view'); } }, '💾 Créer une sauvegarde'), h('button', { class: 'btn', onclick: () => go('mod:backup') }, '⚙️ Sauvegarde automatique')));
  const list = await api(`/guilds/${S.guild.id}/backups`);
  main.append(h('div', { class: 'card' }, list.length ? h('table', {}, h('thead', {}, h('tr', {}, ['ID', 'Date', 'Rôles', 'Salons', 'Type'].map(x => h('th', {}, x)))),
    h('tbody', {}, list.map(b => h('tr', {}, h('td', {}, h('code', {}, b.id)), h('td', {}, fmtDate(b.created)), h('td', {}, b.roles), h('td', {}, b.channels), h('td', {}, b.auto ? 'Auto' : 'Manuelle'))))) : h('p', { class: 'muted' }, 'Aucune sauvegarde.')));
}

// ---------------- Accès (sous-utilisateurs) ----------------
async function pageAccess(main) {
  main.append(...title('👥', 'Accès au panel', 'Donne l\'accès à ton staff, seulement aux modules que tu choisis. Chaque personne reçoit sa propre clé.'));
  const users = await api('/users');
  const form = { name: '', modules: [], guilds: [] };
  const card = h('div', { class: 'card' }, h('h3', {}, 'Nouvel accès'), fieldRow({ key: 'name', label: 'Nom (ex : Modo Léa)', type: 'text' }, '', (v) => { form.name = v; }), h('label', {}, 'Modules autorisés'));
  const grid = h('div', { class: 'grid g3' });
  for (const m of S.schema) grid.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { form.modules = e.target.checked ? [...form.modules, m.id] : form.modules.filter(x => x !== m.id); } }), `${m.icon} ${m.name}`));
  card.append(grid);
  card.append(h('label', { class: 'check', style: 'margin-top:14px' }, h('input', { type: 'checkbox', onchange: (e) => { form.guilds = e.target.checked ? [S.guild.id] : []; } }), `Seulement le serveur « ${S.guild.name} »`));
  const out = h('div');
  card.append(h('button', { class: 'btn success', style: 'margin-top:14px', onclick: async () => {
    if (!form.name || !form.modules.length) return toast('Donne un nom et choisis au moins un module.', true);
    const r = await api('/users', { method: 'POST', body: form });
    out.innerHTML = ''; out.append(h('p', {}, '✅ Accès créé ! Donne cette clé à la personne (elle ne sera plus affichée) :'), h('div', { class: 'keybox' }, r.key), h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => { navigator.clipboard.writeText(r.key); toast('Clé copiée'); } }, '📋 Copier'));
  } }, '➕ Créer l\'accès'), out);
  main.append(card);
  main.append(h('div', { class: 'card' }, h('h3', {}, 'Accès existants'), users.length ? users.map(u => h('div', { class: 'row-toggle' },
    h('div', {}, h('div', { class: 't' }, u.name), h('div', { class: 'muted' }, u.modules.map(id => S.schema.find(m => m.id === id)?.name || id).join(', '))),
    h('button', { class: 'btn small danger', onclick: async () => { if (!confirm(`Retirer l'accès de ${u.name} ?`)) return; await api('/users/' + u.id, { method: 'DELETE' }); go('access'); toast('Accès retiré'); } }, 'Retirer'))) : h('p', { class: 'muted' }, 'Aucun accès créé.')));
}

// ---------------- Démarrage ----------------
setInterval(async () => { if (!S.key || $('#app').classList.contains('hidden')) return; try { const i = await api('/info'); $('#bot-status').textContent = `🟢 En ligne · ${i.ping} ms`; } catch { $('#bot-status').textContent = '🔴 Hors ligne'; } }, 30000);
(async () => {
  const c = store.get('conn', {});
  if (c.url && c.key) { try { await connect(c.url, c.key, true); return; } catch (e) { return showLogin(e.message === 'Failed to fetch' ? 'Le bot ne répond pas. Est-il allumé ?' : e.message); } }
  showLogin();
})();

// Menu sur téléphone : ouvrir / fermer
$('#menu-btn').onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('menu-open'); };
document.addEventListener('click', (e) => { if (!document.body.classList.contains('menu-open')) return; if (e.target.closest('.side-item') || !e.target.closest('.side, .guilds')) document.body.classList.remove('menu-open'); });
