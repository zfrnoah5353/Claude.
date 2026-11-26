# AnimeRNG

Jeu Roblox de type **RNG** : tu « rolles » pour obtenir des persos de style anime
(20 persos originaux, de *Commun* 1 sur 2 à *SECRET* 1 sur 1 000 000), tu les
équipes pour gagner des pièces, et tu achètes des améliorations.

## Jouer tout de suite (sans rien installer à part Roblox Studio)

1. Télécharge **`dist/AnimeRNG.rbxl`**.
2. Double-clique dessus : il s'ouvre dans Roblox Studio.
3. Appuie sur **Play** (F5).

Pour que la progression soit sauvegardée en test : *Home > Game Settings >
Security > Enable Studio Access to API Services* (le jeu doit être publié une
fois). Sans ça, le jeu marche quand même mais ne sauvegarde pas (un message
le signale).

Pour publier : *File > Publish to Roblox*.

## Contenu

| Fonction | Détail |
| --- | --- |
| Roll | Bouton ROLL ou touche **R**, mode AUTO, animation de suspense puis révélation |
| Chance | x2 tous les 10 rolls ; Légendaire garanti au bout de 250 rolls sans Légendaire+ |
| Persos | 20 persos, 8 raretés, nom et aura au-dessus de la tête pour Légendaire+ |
| Équipe | 3 persos équipés, chacun rapporte des pièces par seconde |
| Boutique | Chance (+15 %/niv.), Vitesse de roll, Revenus (+25 %/niv.) |
| Index | Collection des persos découverts |
| Annonces | Tout le serveur voit les rolls 1 sur 1 000 ou plus rares |
| QA | Panneau de test (pièces, chance x10 000, tous les persos, reset) : automatique dans Studio |

Pour utiliser le panneau QA en jeu publié, ajoute ton UserId dans
`src/server/Systems/CheatCommands.luau` (`DEV_USER_IDS`).

## Équilibrage

Toutes les valeurs (cooldowns, coûts, pity, chances) sont dans
`src/shared/Config.luau` et le catalogue dans `src/shared/Characters.luau`.
Après une modification, recompile : `rojo build -o dist/AnimeRNG.rbxl`.

## Développement

1. Outils : `rokit install` (Rojo, Wally, Selene, StyLua, Lune)
2. Synchro avec Studio : `rojo serve` + plugin Rojo dans Studio
3. Vérifications :
   - format : `stylua src tests`
   - lint : `selene src`
   - tests : `lune run tests/run`

## Structure

- `src/shared` → ReplicatedStorage/Shared : types, config, catalogue, logique pure testée
- `src/server` → ServerScriptService/Server : systèmes autoritaires (roll, inventaire, économie, sauvegarde)
- `src/client` → StarterPlayerScripts/Client : interface et effets uniquement

## Sécurité et sauvegarde

- Le serveur décide de tout : tirage, cooldown, prix, solde. Le client ne fait
  qu'afficher et demander.
- Chaque remote : limite de débit, puis validation type → bornes → possession → solde.
- Sauvegarde : `UpdateAsync` uniquement, verrou de session (anti-duplication),
  autosave décalée par joueur, sauvegarde à la sortie et à l'arrêt du serveur,
  schéma versionné. Si le chargement échoue, le joueur est expulsé plutôt que
  de jouer sur un profil vide qui écraserait sa vraie sauvegarde.
