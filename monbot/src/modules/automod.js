// AutoMod : 10 détecteurs
import { Events, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { getConfig, bumpStat } from '../db.js';
import { COLORS, sendTo } from '../util.js';
import { sanction } from './moderation.js';

const history = new Map(); // guild:user -> timestamps
const INVITE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/\S+/i;
const LINK = /https?:\/\/([^\s/]+)/gi;
const EMOJI = /(<a?:\w+:\d+>|\p{Extended_Pictographic})/gu;
const ZALGO = /[̀-ͯ҉᪰-᫿᷀-᷿⃐-⃿︠-︯]{3,}|[⠀-⣿ㅤᅟᅠ]/u;

function check(m, a) {
  const content = m.content || '';
  if (a.antiSpam) {
    const k = `${m.guild.id}:${m.author.id}`;
    const arr = (history.get(k) || []).filter(t => Date.now() - t < a.spamSeconds * 1000); arr.push(Date.now()); history.set(k, arr);
    if (arr.length > a.spamLimit) return 'Spam';
  }
  if (a.antiFlood && content.split('\n').length > a.floodLines) return 'Flood (trop de lignes)';
  if (a.antiInvite && INVITE.test(content)) return 'Publicité (invitation Discord)';
  if (a.antiLinks) {
    for (const mm of content.matchAll(LINK)) {
      const host = mm[1].toLowerCase();
      if (!a.linkWhitelist.some(w => host === w.toLowerCase() || host.endsWith('.' + w.toLowerCase()))) return 'Lien interdit';
    }
  }
  if (a.antiWords && a.bannedWords.length) {
    const low = content.toLowerCase();
    const w = a.bannedWords.find(x => x && new RegExp(`(^|\\W)${x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'u').test(low));
    if (w) return 'Mot interdit';
  }
  if (a.antiCaps) {
    const letters = content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length >= 10 && (letters.replace(/[^A-ZÀ-Ý]/g, '').length / letters.length) * 100 > a.capsPercent) return 'Trop de majuscules';
  }
  if (a.antiEmoji && (content.match(EMOJI) || []).length > a.emojiLimit) return 'Trop d\'emojis';
  if (a.antiSpecial && ZALGO.test(content)) return 'Caractères spéciaux';
  if (a.antiMention && (m.mentions.users.size + m.mentions.roles.size + (m.mentions.everyone ? 5 : 0)) > a.mentionLimit) return 'Mentions de masse';
  return null;
}

export function setup(client) {
  client.on(Events.MessageCreate, async (m) => {
    if (!m.guild || m.author.bot || !m.member) return;
    const a = getConfig(m.guild.id).automod;
    if (!a.enabled) return;
    if (m.member.permissions.has(P.ManageMessages) || a.ignoredChannels.includes(m.channelId) || a.ignoredRoles.some(r => m.member.roles.cache.has(r))) return;
    const reason = check(m, a);
    if (!reason) return;
    bumpStat(m.guild.id, 'automod');
    await m.delete().catch(() => {});
    const warnMsg = await m.channel.send({ content: `${m.author}`, embeds: [new EmbedBuilder().setColor(COLORS.err).setDescription(`🤖 Ton message a été supprimé : **${reason}**.`)] }).catch(() => null);
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
    if (a.action === 'warn') await sanction(m.guild, { type: 'warn', user: m.author, mod: null, reason: `AutoMod : ${reason}` });
    if (a.action === 'mute' && m.member.moderatable) { await m.member.timeout(a.muteMinutes * 60e3, `AutoMod : ${reason}`).catch(() => {}); await sanction(m.guild, { type: 'mute', user: m.author, mod: null, reason: `AutoMod : ${reason}`, duration: a.muteMinutes * 60e3 }); }
    await sendTo(m.guild, a.logChannel, { embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('🤖 AutoMod').setDescription(`**Membre :** ${m.author}\n**Salon :** ${m.channel}\n**Raison :** ${reason}\n**Message :**\n${(m.content || '').slice(0, 1500)}`).setTimestamp()] });
  });

  // Ghost ping : message avec mention supprimé rapidement
  client.on(Events.MessageDelete, async (m) => {
    if (!m.guild || m.author?.bot || !m.mentions) return;
    const a = getConfig(m.guild.id).automod;
    if (!a.enabled || !a.ghostPing) return;
    if (Date.now() - m.createdTimestamp > 60e3) return;
    const targets = m.mentions.users.filter(u => !u.bot && u.id !== m.author.id);
    if (!targets.size && !m.mentions.roles.size) return;
    m.channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('👻 Ghost ping détecté').setDescription(`**Auteur :** ${m.author}\n**Mentionné :** ${[...targets.values(), ...m.mentions.roles.values()].join(', ')}\n**Message :** ${(m.content || '').slice(0, 1000)}`)] }).catch(() => {});
  });
}
