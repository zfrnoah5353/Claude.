// Bienvenue, au revoir, rôles automatiques et captcha
import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { getConfig, addTimer, bumpStat } from '../db.js';
import { fill, memberVars, sendTo, hexColor, COLORS } from '../util.js';
import { welcomeCard, captchaImage } from '../images.js';
import { raidState } from './moderation.js';

const codes = new Map(); // guild:user -> code

export async function sendWelcome(member, test = false) {
  const w = getConfig(member.guild.id).welcome;
  if (!w.channel) throw new Error('Choisis d\'abord le salon de bienvenue.');
  const payload = { content: fill(w.message, memberVars(member)), allowedMentions: { users: test ? [] : [member.id] } };
  if (w.image) payload.files = [await welcomeCard(member, { title: w.imageTitle, bg: w.imageBg, color: w.color })];
  await sendTo(member.guild, w.channel, payload);
}

export async function sendCaptchaMessage(guild) {
  const c = getConfig(guild.id).captcha;
  if (!c.channel) throw new Error('Choisis d\'abord le salon de vérification.');
  const msg = await sendTo(guild, c.channel, {
    embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle('🔐 Vérification').setDescription(c.message)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cap:start').setLabel('Je ne suis pas un robot').setEmoji('✅').setStyle(ButtonStyle.Success))],
  });
  if (!msg) throw new Error('Impossible d\'envoyer le message (permissions ?).');
  return 'Message de vérification envoyé ✅';
}

async function verify(member) {
  const c = getConfig(member.guild.id).captcha;
  if (c.verifiedRole) await member.roles.add(c.verifiedRole, 'Captcha réussi').catch(() => {});
  if (c.unverifiedRole) await member.roles.remove(c.unverifiedRole, 'Captcha réussi').catch(() => {});
  bumpStat(member.guild.id, 'captcha:ok');
}

export function setup(client) {
  client.panelActions.set('captcha.sendCaptcha', (g) => sendCaptchaMessage(g));
  client.panelActions.set('welcome.test', async (g, body) => {
    const m = await g.members.fetch(body?.userId || g.ownerId); await sendWelcome(m, true); return 'Message de test envoyé ✅';
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const cfg = getConfig(member.guild.id);
    bumpStat(member.guild.id, 'join');
    if (raidState(member.guild.id).on) return; // en quarantaine
    const w = cfg.welcome;
    if (w.enabled) {
      const rolesToAdd = (member.user.bot ? w.botRoles : w.autoroles).filter(r => member.guild.roles.cache.has(r));
      if (rolesToAdd.length && !cfg.captcha.enabled) await member.roles.add(rolesToAdd, 'Rôle automatique').catch(() => {});
      if (w.channel) await sendWelcome(member).catch(e => console.error('Bienvenue :', e.message));
      if (w.dm && !member.user.bot) member.send(fill(w.dmMessage, memberVars(member))).catch(() => {});
    }
    const c = cfg.captcha;
    if (c.enabled && !member.user.bot) {
      if (c.unverifiedRole) await member.roles.add(c.unverifiedRole).catch(() => {});
      if (c.kickMinutes > 0) addTimer('captchaKick', member.guild.id, Date.now() + c.kickMinutes * 60e3, { user: member.id });
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    bumpStat(member.guild.id, 'leave');
    const w = getConfig(member.guild.id).welcome;
    if (w.enabled && w.goodbyeEnabled && w.goodbyeChannel) {
      await sendTo(member.guild, w.goodbyeChannel, { content: fill(w.goodbyeMessage, memberVars(member)), allowedMentions: { parse: [] } });
    }
  });

  client.timerHandlers.set('captchaKick', async (t) => {
    const g = client.guilds.cache.get(t.guild_id); if (!g) return;
    const c = getConfig(g.id).captcha; if (!c.enabled) return;
    const m = await g.members.fetch(t.data.user).catch(() => null); if (!m) return;
    const verified = c.verifiedRole ? m.roles.cache.has(c.verifiedRole) : !(c.unverifiedRole && m.roles.cache.has(c.unverifiedRole));
    if (!verified) { await m.send(`Tu as été expulsé de **${g.name}** car tu n'as pas fait la vérification à temps. Tu peux revenir !`).catch(() => {}); await m.kick('Captcha non fait').catch(() => {}); }
  });

  client.components.set('cap', async (i, action) => {
    const c = getConfig(i.guildId).captcha;
    if (action === 'start') {
      if (c.verifiedRole && i.member.roles.cache.has(c.verifiedRole)) return i.reply({ content: '✅ Tu es déjà vérifié.', flags: MessageFlags.Ephemeral });
      if (c.mode === 'button') { await verify(i.member); await giveAutoroles(i.member); return i.reply({ content: '✅ Vérification réussie, bienvenue !', flags: MessageFlags.Ephemeral }); }
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      codes.set(`${i.guildId}:${i.user.id}`, code);
      return i.reply({ content: 'Recopie le code de l\'image :', files: [await captchaImage(code)], flags: MessageFlags.Ephemeral, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cap:type').setLabel('Entrer le code').setStyle(ButtonStyle.Primary))] });
    }
    if (action === 'type') {
      return i.showModal(new ModalBuilder().setCustomId('cap:check').setTitle('Vérification').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Code de l\'image').setStyle(TextInputStyle.Short).setMinLength(6).setMaxLength(6).setRequired(true))));
    }
    if (action === 'check') {
      const expected = codes.get(`${i.guildId}:${i.user.id}`);
      if (expected && i.fields.getTextInputValue('code').toUpperCase().trim() === expected) {
        codes.delete(`${i.guildId}:${i.user.id}`);
        await verify(i.member); await giveAutoroles(i.member);
        return i.reply({ content: '✅ Vérification réussie, bienvenue !', flags: MessageFlags.Ephemeral });
      }
      return i.reply({ content: '❌ Mauvais code. Clique à nouveau sur « Je ne suis pas un robot » pour un nouveau code.', flags: MessageFlags.Ephemeral });
    }
  });
}

async function giveAutoroles(member) {
  const w = getConfig(member.guild.id).welcome;
  if (w.enabled && w.autoroles.length) await member.roles.add(w.autoroles.filter(r => member.guild.roles.cache.has(r))).catch(() => {});
}
export { hexColor };
