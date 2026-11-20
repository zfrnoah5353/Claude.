// Affiche les salons et rôles du serveur (lecture seule)
import { REST, Routes } from 'discord.js';
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const guilds = await rest.get(Routes.userGuilds());
for (const g of guilds) {
  console.log(`SERVEUR ${g.name} (${g.id})`);
  const roles = await rest.get(Routes.guildRoles(g.id));
  roles.sort((a, b) => b.position - a.position);
  console.log('ROLES:');
  for (const r of roles) console.log(`  [${r.position}] ${r.name}${r.managed ? ' (bot)' : ''} perms=${r.permissions}`);
  const ch = await rest.get(Routes.guildChannels(g.id));
  const cats = ch.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
  const show = parent => ch.filter(c => c.parent_id === parent && c.type !== 4).sort((a, b) => a.position - b.position)
    .forEach(c => console.log(`    ${c.type === 2 ? '🔊' : '#'} ${c.name} (type ${c.type})`));
  console.log('SALONS:');
  show(null);
  for (const c of cats) { console.log(`  📁 ${c.name}`); show(c.id); }
  const members = await rest.get(Routes.guildMembers(g.id), { query: new URLSearchParams({ limit: '100' }) });
  console.log('MEMBRES:', members.map(m => `${m.user.username}${m.user.bot ? '(bot)' : ''}[${m.roles.length}]`).join(', '));
  const full = await rest.get(Routes.guild(g.id));
  console.log('OWNER ID:', full.owner_id);
}
