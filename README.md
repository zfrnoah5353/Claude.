# 📚 ReviseIA — tes cours + l'IA, sur PC et téléphone

Scanne tes **cours, synthèses et interros** (Français, Math, Latin, Anglais, NDLS, Sciences, Géo, Histoire… + tes propres matières), et l'IA (Claude) te prépare :

- ✨ **Synthèses** (complète, fiche express, ou plan + par cœur) — avec 🔊 lecture à voix haute
- 🏋️ **Exercices interactifs** (QCM, vrai/faux, textes à trous, questions ouvertes corrigées par l'IA) — dans le style des interros de ton prof
- 🃏 **Flashcards** à retourner
- 🎤 **Réciter ton cours** : tu parles, l'IA te donne une note /20, ce que tu as oublié et tes erreurs
- ❓ **Poser une question** sur ton cours

PC et téléphone sont **reliés** : ce que tu scannes sur le tel apparaît sur le PC et inversement.

## Installation (2 minutes)

1. **Télécharge le .exe** dans l'onglet [Releases](../../releases) : `ReviseIA-Installation.exe` (ou `ReviseIA-Portable.exe`, sans installation).
2. Lance-le. Si Windows affiche « Windows a protégé votre ordinateur » → **Informations complémentaires → Exécuter quand même** (l'appli n'est pas signée, c'est normal).
3. Si le pare-feu demande → **Autoriser** (réseaux privés), pour que le téléphone puisse se connecter.
4. ⚙️ **Réglages** → colle ta **clé API Claude** (à créer sur [console.anthropic.com](https://console.anthropic.com/settings/keys), avec un peu de crédit).
5. 📱 → scanne le **QR code** avec ton téléphone (même Wi-Fi), puis menu du navigateur → **« Ajouter à l'écran d'accueil »**.

## Bon à savoir

- 🎙️ Pour parler : sur le téléphone, utilise le **micro du clavier** ; sur le PC, **Windows + H**.
- Le téléphone fonctionne quand le PC est allumé avec ReviseIA ouvert, sur le même Wi-Fi.
- Tes cours restent **sur ton PC** (dossier `%APPDATA%\ReviseIA\donnees`).
- Réglages → choisis « Économique » pour dépenser beaucoup moins de crédit API.

## Pour les développeurs

```bash
cd app && npm install
npm start          # lance l'appli PC (Electron)
npm run server     # ou juste le serveur : http://localhost:4777
npm run dist       # construit dist/ReviseIA-Portable.exe
```
Le workflow GitHub Actions `.github/workflows/build-exe.yml` construit les deux .exe et les publie dans une Release à chaque push.
