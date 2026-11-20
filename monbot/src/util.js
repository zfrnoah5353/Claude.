import { EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getConfig } from './db.js';

export const COLORS = { main: 0x5865F2, ok: 0x2ECC71, err: 0xE74C3C, warn: 0xF1C40F, info: 0x3498DB };

export const embed = (desc, color = COLORS.main) => new EmbedBuilder().setColor(color).setDescription(desc);
export const ok = (d) => ({ embeds: [embed(`✅ ${d}`, COLORS.ok)] });
export const err = (d) => ({ embeds: [embed(`❌ ${d}`, COLORS.err)], flags: MessageFlags.Ephemeral });
export const eph = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });

export function hexColor(c, fallback = COLORS.main) {
  if (typeof c === 'number') return c;
  const n = parseInt(String(c || '').replace('#', ''), 16);
  return Number.isNaN(n) ? fallback : n;
}

// "10m", "2h", "1d", "1w", "30s", "1d12h"
export function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(s|sec|m|min|h|d|j|w|sem)/gi;
  let total = 0, m, any = false;
  while ((m = re.exec(String(str)))) {
    any = true;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    total += n * ({ s: 1, sec: 1, m: 60, min: 60, h: 3600, d: 86400, j: 86400, w: 604800, sem: 604800 }[u]) * 1000;
  }
  if (!any && /^\d+$/.test(String(str).trim())) return Number(str) * 60000; // nombre seul = minutes
  return any ? total : null;
}

export function fmtDuration(ms) {
  if (ms == null) return 'définitif';
  const s = Math.round(ms / 1000);
  const parts = [];
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  if (d) parts.push(`${d}j`); if (h) parts.push(`${h}h`); if (mi) parts.push(`${mi}min`); if (se && !d) parts.push(`${se}s`);
  return parts.join(' ') || '0s';
}

export function fill(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined ? String(vars[k]) : all));
}
export function memberVars(member, extra = {}) {
  return { user: member.user?.username ?? member.username, mention: `<@${member.id}>`, server: member.guild?.name ?? '', count: member.guild?.memberCount ?? '', ...extra };
}

export function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const cfg = getConfig(member.guild.id);
  return (cfg.moderation.staffRoles || []).some(r => member.roles.cache.has(r));
}

export async function sendTo(guild, channelId, payload) {
  if (!channelId) return null;
  const c = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!c?.isTextBased?.()) return null;
  return c.send(payload).catch(() => null);
}

export function money(guildId, n) {
  const e = getConfig(guildId).economy;
  return `${Number(n).toLocaleString('fr-FR')} ${e.currency}`;
}

export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

// Peut-on sanctionner ce membre ? (hiérarchie des rôles)
export function canModerate(actor, target) {
  if (!target) return 'Membre introuvable.';
  if (target.id === actor.id) return 'Tu ne peux pas te sanctionner toi-même.';
  if (target.id === target.guild.ownerId) return 'Impossible de sanctionner le propriétaire.';
  if (actor.id !== actor.guild.ownerId && target.roles.highest.position >= actor.roles.highest.position) return 'Ce membre a un rôle égal ou supérieur au tien.';
  if (!target.manageable && !target.moderatable) return 'Mon rôle est trop bas pour sanctionner ce membre.';
  return null;
}

export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
