# Sweet Pets Factory (Roblox)

Un simulateur de pets multijoueur sur le thème des bonbons et de la mythologie. On casse des tas de bonbons avec ses pets, on ouvre des œufs et on collectionne 53 pets, du Gumdrop Bunny jusqu'aux créatures **Divines**.

## Lancer le jeu

1. Ouvre **`SweetPetsFactory.rbxlx`** dans Roblox Studio (double-clic, ou Fichier › Ouvrir).
2. Clique sur **Play**. La carte (4 îles et l'arène du boss) est construite automatiquement au démarrage.
3. Pour mettre le jeu en ligne : Fichier › Publier sur Roblox.

**Sauvegarde :** les parties sont enregistrées avec DataStore. Dans Studio, la sauvegarde ne marche qu'une fois le jeu publié et l'option activée dans Game Settings › Security › **Enable Studio Access to API Services**. En attendant, le jeu fonctionne mais ne garde rien.

## Les raretés

| Rareté | Chance dans un œuf | Exemples |
| --- | --- | --- |
| Commun → Légendaire | de 60 % à 0,1 % | Gumdrop Bunny, Mochi Dragon, Golden Gummy King |
| **Mythique** | 0,05 % | Pégase Barbe-à-Papa, Cerbère Guimauve, Sphinx Praliné, Anubis Cacao, Fenrir Lune de Sang, Mammouth d'Ymir, Griffon Céleste, Dragon Céleste, Gummy Golem (boss) |
| **Divin** | 0,004 % (1 sur 25 000) | Hydre d'Olympe, Ra le Phénix Solaire, Kraken des Abysses, Léviathan Cosmique |

Chaque monde suit une mythologie :
- Candy Meadow : la Grèce ;
- Choco Land : l'Égypte ;
- Ice Cream Island : les mythes nordiques ;
- Gummy Galaxy : les créatures célestes.

Les pets Mythiques et Divins sont plus grands. Ils brillent, sont entourés de particules, et leurs auréoles, engrenages ou piliers tournent autour d'eux. Quand un joueur en obtient un, son éclosion déclenche un flash, des rayons et une annonce à tout le serveur.

## Les modèles 3D

Tous les pets sont construits en low-poly à partir de pièces Roblox (blocs, boules, cylindres) dans `src/shared/PetShapes.luau`. Les modèles des pets Mythiques et Divins sont aussi fournis à part, prêts à importer :

- `models/Mythique/*.rbxmx` : les 9 pets Mythiques ;
- `models/Divin/*.rbxmx` : les 4 pets Divins ;
- `models/apercu_mythiques_divins.png` et `models/apercu_tous_les_pets.png` : les aperçus.

Pour importer un modèle dans Studio : clic droit sur Workspace › **Insert from File…**, puis choisis le `.rbxmx`. Dans le jeu, ces modèles sont générés automatiquement : pas besoin de les importer pour jouer.

## Robux (optionnel)

Dans `src/shared/Config.luau`, colle les identifiants de tes Game Passes (`Config.GamePassIds`) et de tes Developer Products (`Config.GemProducts`). Tant qu'un identifiant vaut `0`, l'objet s'achète avec des gemmes gagnées en jeu.

## Commandes

| Action | Touche |
| --- | --- |
| Marcher | ZQSD / WASD, ou toucher l'écran sur mobile |
| Casser un tas | Clic sur le tas |
| Ouvrir un œuf, utiliser le portail ou la porte des mondes | **E** à côté |
| Récolte auto | **F** |
| Pets · Index · Boutique · Quêtes | **P** · **I** · **B** · **J** |
| Mondes · Cadeau · Rebirth | **C** · **G** · **R** |

## Pour les développeurs

Le projet suit le format [Rojo](https://rojo.space) : `rojo build default.project.json -o SweetPetsFactory.rbxlx`.

Outils fournis :
- `tools/export_models.luau` et `tools/make_rbxmx.py` : régénèrent les fichiers `.rbxmx` à partir des plans ;
- `tools/gen.sh` : prépare une copie de `Config` utilisable hors de Roblox.
