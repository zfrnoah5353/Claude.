import { Client, GatewayIntentBits, Partials, Events, ActivityType, MessageFlags } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getConfig, bumpStat, dueTimers, removeTimer } from './db.js';
import { err, isStaff } from './util.js';
import { startApi } from './api.js';
import { startTunnel } from './tunnel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Il manque DISCORD_TOKEN dans le fichier .env (voir .env.example).');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
});

client.commands = new Map();     // nom -> commande
client.components = new Map();   // préfixe customId -> fonction(interaction, ...args)
client.timerHandlers = new Map(); // type -> fonction(timer)
client.panelActions = new Map();      // actions déclenchées depuis le panel : id -> fonction(guild, body)
client.startedAt = Date.now();

// Chargement des commandes
for (const f of readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(__dirname, 'commands', f)));
  for (const c of mod.commands || []) client.commands.set(c.data.name, c);
  if (mod.register) await mod.register(client);
}
// Chargement des modules (événements)
for (const f of readdirSync(join(__dirname, 'modules')).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(__dirname, 'modules', f)));
  if (mod.setup) await mod.setup(client);
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const cmd = client.commands.get(i.commandName);
      if (!cmd) return;
      if (!i.inGuild()) return i.reply(err('Les commandes marchent seulement sur un serveur.'));
      if (cmd.module) {
        const cfg = getConfig(i.guildId)[cmd.module];
        if (cfg && cfg.enabled === false) return i.reply(err('Ce module est désactivé sur ce serveur (active-le dans le panel).'));
      }
      if (cmd.staff && !isStaff(i.member)) return i.reply(err('Commande réservée au staff.'));
      bumpStat(i.guildId, `cmd:${i.commandName}`);
      await cmd.run(i);
    } else if (i.isAutocomplete()) {
      const cmd = client.commands.get(i.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(i);
    } else if (i.isButton() || i.isAnySelectMenu() || i.isModalSubmit()) {
      const [prefix, ...args] = i.customId.split(':');
      const h = client.components.get(prefix);
      if (h) await h(i, ...args);
    }
  } catch (e) {
    console.error('Erreur interaction', i.commandName || i.customId, e);
    const payload = { content: '❌ Une erreur est survenue : ' + (e.message || e), flags: MessageFlags.Ephemeral };
    if (i.isRepliable()) (i.deferred || i.replied ? i.followUp(payload) : i.reply(payload)).catch(() => {});
  }
});

// Minuteries (fin de ban/mute/rôle temporaire, giveaways…)
setInterval(async () => {
  for (const t of dueTimers()) {
    removeTimer(t.id);
    const h = client.timerHandlers.get(t.type);
    if (h) await Promise.resolve(h(t)).catch(e => console.error('Timer', t.type, e));
  }
}, 10_000);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag} sur ${c.guilds.cache.size} serveur(s).`);
  c.user.setActivity(`/help · ${c.guilds.cache.size} serveurs`, { type: ActivityType.Watching });
  // Commandes enregistrées sur chaque serveur : elles apparaissent tout de suite (les globales peuvent mettre longtemps)
  try {
    await c.application.commands.set([]);
    for (const g of c.guilds.cache.values()) await registerGuild(g);
    console.log(`✅ ${client.commands.size} commandes enregistrées sur ${c.guilds.cache.size} serveur(s).`);
  } catch (e) { console.error('Enregistrement des commandes échoué :', e.message); }
  startApi(client);
  startTunnel(client);
});
const commandList = () => [...client.commands.values()].map(x => x.data.toJSON());
async function registerGuild(g) {
  try { await g.commands.set(commandList()); } catch (e) { console.error(`Commandes non enregistrées sur ${g.name} :`, e.message); }
}
client.on(Events.GuildCreate, (g) => registerGuild(g));

process.on('unhandledRejection', (e) => console.error('Erreur non gérée :', e?.message || e));
client.login(process.env.DISCORD_TOKEN);
