// Petits modules : réactions de mots, comptage, starboard, suggestions, rôles de soutien,
// annonces, anniversaires, réseaux sociaux, serveur gaming, panels de rôles
import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActivityType, MessageFlags } from 'discord.js';
import { getConfig, patchModule, kvGet, kvSet, kvList } from '../db.js';
import { COLORS, fill, memberVars, sendTo, hexColor, isStaff, ts } from '../util.js';

// ---------- Panels de rôles ----------
async function sendRolePanels(guild) {
  const cfg = getConfig(guild.id).roles;
  if (!cfg.panels.length) throw new Error('Ajoute d\'abord un panel de rôles.');
  let n = 0;
  for (const [idx, p] of cfg.panels.entries()) {
    if (!p.channel || !p.roles.length) continue;
    const ch = guild.channels.cache.get(p.channel); if (!ch?.isTextBased()) continue;
    const lines = p.roles.map((r, k) => `${p.emojis[k] || '•'} <@&${r}>`).join('\n');
    const e = new EmbedBuilder().setColor(COLORS.main).setTitle(p.title || 'Rôles').setDescription(`${p.description || ''}\n\n${lines}`.trim());
    let components = [];
    if (p.style === 'menu') {
      components = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rr:menu:${idx}`).setPlaceholder('Choisis tes rôles…').setMinValues(0).setMaxValues(p.unique ? 1 : Math.min(25, p.roles.length))
        .addOptions(p.roles.slice(0, 25).map((r, k) => ({ label: guild.roles.cache.get(r)?.name || r, value: r, emoji: p.emojis[k] || undefined }))))];
    } else if (p.style === 'buttons') {
      p.roles.slice(0, 25).forEach((r, k) => { if (k % 5 === 0) components.push(new ActionRowBuilder()); const b = new ButtonBuilder().setCustomId(`rr:btn:${idx}:${r}`).setLabel(guild.roles.cache.get(r)?.name || 'Rôle').setStyle(ButtonStyle.Secondary); if (p.emojis[k]) b.setEmoji(p.emojis[k]); components.at(-1).addComponents(b); });
    }
    let msg = p.messageId ? await ch.messages.fetch(p.messageId).catch(() => null) : null;
    if (msg && msg.author.id === guild.client.user.id) await msg.edit({ embeds: [e], components });
    else { msg = await ch.send({ embeds: [e], components }); cfg.panels[idx].messageId = msg.id; }
    if (p.style === 'reactions') for (const em of p.emojis.slice(0, p.roles.length)) await msg.react(em).catch(() => {});
    n++;
  }
  patchModule(guild.id, 'roles', { panels: cfg.panels });
  return `${n} panel(s) envoyé(s) ✅`;
}
async function toggleRole(member, roleId, panel) {
  if (member.roles.cache.has(roleId)) { await member.roles.remove(roleId); return `➖ Rôle <@&${roleId}> retiré.`; }
  if (panel.unique) await member.roles.remove(panel.roles.filter(r => r !== roleId && member.roles.cache.has(r))).catch(() => {});
  await member.roles.add(roleId); return `➕ Rôle <@&${roleId}> ajouté.`;
}

// ---------- Réseaux sociaux ----------
let twitchToken = null;
async function twitchAuth() {
  if (twitchToken && twitchToken.exp > Date.now()) return twitchToken.v;
  const id = process.env.TWITCH_CLIENT_ID, sec = process.env.TWITCH_CLIENT_SECRET; if (!id || !sec) return null;
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${sec}&grant_type=client_credentials`, { method: 'POST' }).then(x => x.json()).catch(() => null);
  if (!r?.access_token) return null;
  twitchToken = { v: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 }; return twitchToken.v;
}
async function checkSocials(client) {
  for (const g of client.guilds.cache.values()) {
    const cfg = getConfig(g.id).socials;
    if (!cfg.enabled || !cfg.channel) continue;
    const ping = cfg.pingRole ? `<@&${cfg.pingRole}> ` : '';
    for (const y of cfg.youtube) {
      if (!y.channelId) continue;
      const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(y.channelId)}`).then(r => r.ok ? r.text() : null).catch(() => null);
      if (!xml) continue;
      const vid = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]; const name = xml.match(/<name>([^<]+)<\/name>/)?.[1] || 'la chaîne';
      const title = xml.split('<entry>')[1]?.match(/<title>([^<]+)<\/title>/)?.[1] || '';
      const key = `${g.id}:yt:${y.channelId}`; const last = kvGet('social', key);
      if (vid && last !== vid) { kvSet('social', key, vid); if (last) await sendTo(g, cfg.channel, { content: ping + fill(y.message, { name, title, url: `https://youtu.be/${vid}` }) }); }
    }
    if (cfg.twitch.length && !process.env.TWITCH_CLIENT_ID) {
      // Sans clé Twitch : on passe par decapi.me (gratuit, sans compte)
      for (const t of cfg.twitch) {
        const l = t.login?.toLowerCase().trim(); if (!l) continue;
        const up = await fetch(`https://decapi.me/twitch/uptime/${encodeURIComponent(l)}`).then(r => r.ok ? r.text() : null).catch(() => null);
        if (up == null) continue; // site injoignable : on ne change rien
        const isLive = !/offline|not found|error|introuvable/i.test(up);
        const key = `${g.id}:tw:${l}`; const last = kvGet('social', key);
        if (isLive && !last) {
          kvSet('social', key, 'live');
          const [title, game] = await Promise.all(['title', 'game'].map(k => fetch(`https://decapi.me/twitch/${k}/${encodeURIComponent(l)}`).then(r => r.ok ? r.text() : '').catch(() => '')));
          await sendTo(g, cfg.channel, { content: ping + fill(t.message, { name: t.login.trim(), title: title.trim(), login: l, game: game.trim() }) });
        }
        if (!isLive && last) kvSet('social', key, null);
      }
    } else if (cfg.twitch.length) {
      const tok = await twitchAuth(); if (!tok) continue;
      const logins = cfg.twitch.map(t => t.login?.toLowerCase()).filter(Boolean);
      if (!logins.length) continue;
      const r = await fetch(`https://api.twitch.tv/helix/streams?${logins.map(l => `user_login=${encodeURIComponent(l)}`).join('&')}`, { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}` } }).then(x => x.json()).catch(() => null);
      const live = new Map((r?.data || []).map(s => [s.user_login.toLowerCase(), s]));
      for (const t of cfg.twitch) {
        const l = t.login?.toLowerCase(); if (!l) continue;
        const key = `${g.id}:tw:${l}`; const s = live.get(l); const last = kvGet('social', key);
        if (s && last !== s.id) { kvSet('social', key, s.id); await sendTo(g, cfg.channel, { content: ping + fill(t.message, { name: s.user_name, title: s.title, login: l, game: s.game_name }) }); }
        if (!s && last) kvSet('social', key, null);
      }
    }
  }
}

// ---------- Serveur gaming (statut Minecraft) ----------
async function updateGaming(client) {
  for (const g of client.guilds.cache.values()) {
    const cfg = getConfig(g.id).gaming;
    if (!cfg.enabled || !cfg.channel || !cfg.servers.length) continue;
    const last = kvGet('gamingTick', g.id, 0); if (Date.now() - last < cfg.interval * 60e3) continue;
    kvSet('gamingTick', g.id, Date.now());
    const fields = [];
    for (const s of cfg.servers.slice(0, 10)) {
      if (!s.address) continue;
      const d = await fetch(`https://api.mcsrvstat.us/${s.edition === 'bedrock' ? 'bedrock/' : ''}3/${encodeURIComponent(s.address)}`).then(r => r.json()).catch(() => null);
      fields.push({ name: `${d?.online ? '🟢' : '🔴'} ${s.name || s.address}`, value: d?.online ? `**${d.players?.online ?? 0}/${d.players?.max ?? '?'}** joueurs · ${d.version || ''}\n\`${s.address}\`` : `Hors ligne\n\`${s.address}\`` });
    }
    const e = new EmbedBuilder().setColor(COLORS.ok).setTitle('🕹️ Statut des serveurs').addFields(fields).setFooter({ text: 'Mis à jour' }).setTimestamp();
    const ch = g.channels.cache.get(cfg.channel); if (!ch?.isTextBased()) continue;
    const msgId = kvGet('gamingMsg', g.id);
    const msg = msgId ? await ch.messages.fetch(msgId).catch(() => null) : null;
    if (msg) await msg.edit({ embeds: [e] }).catch(() => {});
    else { const m = await ch.send({ embeds: [e] }).catch(() => null); if (m) kvSet('gamingMsg', g.id, m.id); }
  }
}

// ---------- Anniversaires ----------
async function birthdays(client) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  for (const g of client.guilds.cache.values()) {
    const cfg = getConfig(g.id).birthdays;
    if (!cfg.enabled || !cfg.channel || now.getHours() < cfg.hour) continue;
    if (kvGet('bdayDone', g.id) === today) continue;
    kvSet('bdayDone', g.id, today);
    const list = kvList('bday').map(x => x.value).filter(v => v && v.guild === g.id && v.d === now.getDate() && v.m === now.getMonth() + 1);
    if (cfg.role) for (const m of g.roles.cache.get(cfg.role)?.members.values() || []) await m.roles.remove(cfg.role).catch(() => {});
    for (const v of list) {
      const m = await g.members.fetch(v.user).catch(() => null); if (!m) continue;
      await sendTo(g, cfg.channel, { content: fill(cfg.message, memberVars(m)) });
      if (cfg.role) await m.roles.add(cfg.role).catch(() => {});
    }
  }
}

// ---------- Annonces programmées ----------
async function scheduled(client) {
  for (const g of client.guilds.cache.values()) {
    const cfg = getConfig(g.id).announcements;
    if (!cfg.enabled) continue;
    for (const [k, s] of cfg.scheduled.entries()) {
      if (!s.channel || !s.message || !s.intervalHours) continue;
      const key = `${g.id}:${k}:${s.channel}`; const last = kvGet('sched', key, 0);
      if (Date.now() - last >= s.intervalHours * 3600e3) { kvSet('sched', key, Date.now()); if (last) await sendTo(g, s.channel, { content: s.message }); }
    }
  }
}

export function setup(client) {
  client.panelActions.set('roles.sendRolePanels', (g) => sendRolePanels(g));
  client.panelActions.set('announcements.sendAnnouncement', async (g) => {
    const a = getConfig(g.id).announcements;
    if (!a.channel || (!a.content && !a.title)) throw new Error('Choisis un salon et écris le texte de l\'annonce.');
    const e = new EmbedBuilder().setColor(hexColor(a.color)).setDescription(a.content || null).setTimestamp();
    if (a.title) e.setTitle(a.title); if (a.image) e.setImage(a.image);
    const m = await sendTo(g, a.channel, { content: a.pingRole ? (a.pingRole === g.id ? '@everyone' : `<@&${a.pingRole}>`) : null, embeds: [e], allowedMentions: { parse: ['roles', 'everyone'] } });
    if (!m) throw new Error('Impossible d\'envoyer (permissions ?).');
    return 'Annonce envoyée 📣';
  });

  client.components.set('rr', async (i, kind, idx, roleId) => {
    const p = getConfig(i.guildId).roles.panels[Number(idx)]; if (!p) return i.reply({ content: 'Panel introuvable.', flags: MessageFlags.Ephemeral });
    if (kind === 'btn') return i.reply({ content: await toggleRole(i.member, roleId, p).catch(() => '❌ Je ne peux pas gérer ce rôle (mon rôle doit être au-dessus).'), flags: MessageFlags.Ephemeral });
    const chosen = i.values; const msgs = [];
    for (const r of p.roles) {
      const has = i.member.roles.cache.has(r);
      if (chosen.includes(r) && !has) { await i.member.roles.add(r).catch(() => {}); msgs.push(`➕ <@&${r}>`); }
      if (!chosen.includes(r) && has) { await i.member.roles.remove(r).catch(() => {}); msgs.push(`➖ <@&${r}>`); }
    }
    i.reply({ content: msgs.join('\n') || 'Aucun changement.', flags: MessageFlags.Ephemeral });
  });

  const reactionRole = async (reaction, user, add) => {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const g = reaction.message.guild; const cfg = getConfig(g.id).roles;
    if (!cfg.enabled) return;
    const p = cfg.panels.find(x => x.style === 'reactions' && x.messageId === reaction.message.id); if (!p) return;
    const em = reaction.emoji.id ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const k = p.emojis.findIndex(e => e === em || e === reaction.emoji.name || e.includes(reaction.emoji.id || '§'));
    const role = p.roles[k]; if (!role) return;
    const m = await g.members.fetch(user.id).catch(() => null); if (!m) return;
    if (add) { if (p.unique) await m.roles.remove(p.roles.filter(r => r !== role && m.roles.cache.has(r))).catch(() => {}); await m.roles.add(role).catch(() => {}); }
    else await m.roles.remove(role).catch(() => {});
  };
  client.on(Events.MessageReactionAdd, (r, u) => { reactionRole(r, u, true); starboard(r, u); });
  client.on(Events.MessageReactionRemove, (r, u) => { reactionRole(r, u, false); starboard(r, u); });

  // Starboard
  async function starboard(reaction) {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const msg = reaction.message; if (!msg.guild) return;
    if (msg.partial) await msg.fetch().catch(() => {});
    const cfg = getConfig(msg.guild.id).starboard;
    if (!cfg.enabled || !cfg.channel || msg.channelId === cfg.channel) return;
    if (reaction.emoji.name !== cfg.emoji && reaction.emoji.toString() !== cfg.emoji) return;
    const users = await reaction.users.fetch().catch(() => null); if (!users) return;
    const count = users.filter(u => !u.bot && (cfg.selfStar || u.id !== msg.author?.id)).size;
    const key = `${msg.guild.id}:${msg.id}`; const saved = kvGet('star', key);
    const e = new EmbedBuilder().setColor(0xFFAC33).setAuthor({ name: msg.author?.username || '?', iconURL: msg.author?.displayAvatarURL() }).setDescription(`${msg.content || ''}\n\n[Aller au message](${msg.url})`.trim()).setTimestamp(msg.createdTimestamp);
    const img = msg.attachments.find(a => a.contentType?.startsWith('image')); if (img) e.setImage(img.url);
    const content = `${cfg.emoji} **${count}** · ${msg.channel}`;
    const sc = msg.guild.channels.cache.get(cfg.channel);
    if (saved) { const sm = await sc?.messages.fetch(saved).catch(() => null); if (sm) { if (count < cfg.threshold) { await sm.delete().catch(() => {}); kvSet('star', key, null); } else await sm.edit({ content, embeds: [e] }).catch(() => {}); } }
    else if (count >= cfg.threshold) { const sm = await sc?.send({ content, embeds: [e] }).catch(() => null); if (sm) kvSet('star', key, sm.id); }
  }

  client.on(Events.MessageCreate, async (m) => {
    if (!m.guild || m.author.bot) return;
    const cfg = getConfig(m.guild.id);
    // Réactions de mots
    if (cfg.wordreact.enabled) {
      const low = m.content.toLowerCase();
      for (const r of cfg.wordreact.rules) {
        const hit = (r.words || []).some(w => w && (r.exact ? new RegExp(`(^|\\W)${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'u').test(low) : low.includes(w.toLowerCase())));
        if (!hit) continue;
        if (r.emoji) await m.react(r.emoji).catch(() => {});
        if (r.reply) await m.reply({ content: fill(r.reply, memberVars(m.member)), allowedMentions: { repliedUser: false } }).catch(() => {});
      }
    }
    // Comptage infini
    if (cfg.games.enabled && cfg.games.countingChannel === m.channelId) {
      const st = kvGet('count', m.guild.id, { n: 0, last: null, best: 0 });
      const n = Number(m.content.trim().split(/\s/)[0]);
      if (!Number.isInteger(n)) return;
      if (n === st.n + 1 && !(cfg.games.countingSameUser && st.last === m.author.id)) {
        st.n = n; st.last = m.author.id; st.best = Math.max(st.best, n); kvSet('count', m.guild.id, st);
        await m.react(n % 100 === 0 ? '💯' : '✅').catch(() => {});
      } else {
        await m.react('❌').catch(() => {});
        if (cfg.games.countingReset) { await m.reply(`💥 ${m.author} a cassé la série à **${st.n}** ! ${st.last === m.author.id && n === st.n + 1 ? '(pas deux fois de suite)' : `Le prochain nombre était **${st.n + 1}**.`} On recommence à **1**. (Record : ${st.best})`).catch(() => {}); st.n = 0; st.last = null; kvSet('count', m.guild.id, st); }
      }
      return;
    }
    // Suggestions
    if (cfg.suggestions.enabled && cfg.suggestions.autoConvert && cfg.suggestions.channel === m.channelId) {
      await m.delete().catch(() => {});
      const s = await m.channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.info).setAuthor({ name: m.author.username, iconURL: m.author.displayAvatarURL() }).setTitle('💡 Suggestion').setDescription(m.content.slice(0, 4000)).addFields({ name: 'Statut', value: '⏳ En attente' }).setFooter({ text: '👍 0 · 👎 0' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sug:up').setEmoji('👍').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('sug:down').setEmoji('👎').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('sug:accept').setLabel('Accepter').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sug:refuse').setLabel('Refuser').setStyle(ButtonStyle.Secondary))] });
      kvSet('sug', s.id, { author: m.author.id, up: [], down: [] });
      if (cfg.suggestions.thread) await s.startThread({ name: `Discussion : ${m.content.slice(0, 80)}` }).catch(() => {});
    }
  });

  client.components.set('sug', async (i, action) => {
    const s = kvGet('sug', i.message.id); if (!s) return;
    const e = EmbedBuilder.from(i.message.embeds[0]);
    if (action === 'up' || action === 'down') {
      s.up = s.up.filter(x => x !== i.user.id); s.down = s.down.filter(x => x !== i.user.id); s[action].push(i.user.id); kvSet('sug', i.message.id, s);
      return i.update({ embeds: [e.setFooter({ text: `👍 ${s.up.length} · 👎 ${s.down.length}` })] });
    }
    const cfg = getConfig(i.guildId).suggestions;
    if (!isStaff(i.member) && !cfg.reviewRoles.some(r => i.member.roles.cache.has(r))) return i.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
    const accepted = action === 'accept';
    e.setColor(accepted ? COLORS.ok : COLORS.err).setFields({ name: 'Statut', value: `${accepted ? '✅ Acceptée' : '❌ Refusée'} par ${i.user.username}` });
    await i.update({ embeds: [e], components: [] });
    (await client.users.fetch(s.author).catch(() => null))?.send(`Ta suggestion sur **${i.guild.name}** a été ${accepted ? 'acceptée ✅' : 'refusée ❌'}.`).catch(() => {});
  });

  // Rôles de soutien : texte dans le statut personnalisé
  client.on(Events.PresenceUpdate, async (_, p) => {
    if (!p?.guild || !p.member || p.user?.bot) return;
    const cfg = getConfig(p.guild.id).supportroles;
    if (!cfg.enabled || !cfg.role || !cfg.text) return;
    const status = p.activities.find(a => a.type === ActivityType.Custom)?.state || '';
    const has = p.member.roles.cache.has(cfg.role); const should = status.toLowerCase().includes(cfg.text.toLowerCase());
    if (should && !has) { await p.member.roles.add(cfg.role, 'Soutien (statut)').catch(() => {}); if (cfg.channel) sendTo(p.guild, cfg.channel, { content: fill(cfg.message, memberVars(p.member)) }); }
    if (!should && has) await p.member.roles.remove(cfg.role, 'Plus de soutien dans le statut').catch(() => {});
  });

  client.once(Events.ClientReady, () => {
    setInterval(() => checkSocials(client).catch(e => console.error('Réseaux :', e.message)), 2 * 60e3);
    setInterval(() => updateGaming(client).catch(e => console.error('Gaming :', e.message)), 60e3);
    setInterval(() => { birthdays(client).catch(() => {}); scheduled(client).catch(() => {}); }, 5 * 60e3);
    setTimeout(() => { checkSocials(client).catch(() => {}); updateGaming(client).catch(() => {}); birthdays(client).catch(() => {}); scheduled(client).catch(() => {}); }, 15e3);
  });
}
export { ts };
