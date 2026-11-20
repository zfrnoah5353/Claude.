// Poste l'annonce du comeback dans 📢・annonces (une seule fois).
import { REST, Routes } from 'discord.js';
const GID = process.argv[2];
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const chans = await rest.get(Routes.guildChannels(GID));
const id = n => { const c = chans.find(x => x.name === n); if (!c) throw new Error('Salon introuvable : ' + n); return `<#${c.id}>`; };
const target = chans.find(x => x.name === '📢・annonces');
const last = await rest.get(Routes.channelMessages(target.id), { query: new URLSearchParams({ limit: '20' }) });
if (last.some(m => m.content.includes('FAIT SON COMEBACK'))) { console.log('Déjà posté.'); process.exit(0); }
const content = `@everyone
# 🔥 LES100PASPIED FAIT SON COMEBACK ! 🔥
Salut tout le monde ! 👋 Le serveur revient **plus fort que jamais**, avec une organisation toute neuve et **notre propre bot : MonBot** 🤖

## 🗂️ Un serveur entièrement refait
Tout est rangé par catégories : 📌 Infos · 💬 Général · 🎣 Fisch · 🧠 Steal a Brainrot · 🏆 Événements · 🎫 Support · 🔊 Vocaux
Nouveaux salons : ${id('📸・médias')}, ${id('🤖・commandes')}, ${id('💡・suggestions')}, ${id('🔄・trade-sab')}…
Pas de panique : **tous vos anciens messages sont toujours là** 😉

## 🎭 Nouveaux rôles
👑 Owner · 🛡️ Admin · 🔨 Modo · 🎧 Support · 💎 Premium · 🎮 Membre
➜ Va dans ${id('🎭・rôles')} et choisis tes notifs : 🔔 Annonces · 🎉 Giveaways · 🎣 Fisch · 🧠 SAB

## 🤖 Ce que MonBot sait faire
🎫 **Tickets** : une question, une arnaque à signaler ? Clique dans ${id('🎫・ouvrir-un-ticket')}
➕ **Ton propre vocal** : rejoins ${id('➕ Crée ton salon')} et tu as ton salon perso, que tu gères comme tu veux
🎉 **Giveaways** réguliers dans ${id('🎉・giveaways')}
💡 **Suggestions** : propose tes idées et vote pour celles des autres
🔥 **Le jeu Flamme** : \`/flamme\` pour adopter ta flamme, la nourrir et combattre
🎮 **Mini-jeux** : \`/jeu\`, \`/tupreferes\`, \`/sondage\`, \`/hug\`…
🛡️ **Anti-spam et anti-pub automatiques**, pour un serveur clean

📜 Lis le ${id('📜・règlement')} (les arnaques en trade = ban direct)
❓ Toutes les commandes : tape \`/help\`

**Merci d'être là, et bon retour sur les100paspied ! 🎣🧠**`;
console.log('Longueur :', content.length);
if (content.length > 2000) throw new Error('Trop long');
const m = await rest.post(Routes.channelMessages(target.id), { body: { content, allowed_mentions: { parse: ['everyone'] } } });
console.log('Posté :', m.id);
