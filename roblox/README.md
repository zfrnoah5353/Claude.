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

### Fichiers 3D (.glb et .obj)

`models/3D/<rareté>/` contient chacun des 53 pets en deux formats :
- **`.glb`** : modèle en couleurs, avec ses animations `idle`, `move` et `ability` (boucles de 2 s). Il s'ouvre dans Blender, dans la Visionneuse 3D de Windows ou dans n'importe quel moteur.
- **`.obj` + `.mtl`** : modèle statique en couleurs, le format le plus compatible.

Les 13 Mythiques et Divins sont des modèles détaillés à facettes, de 3 000 à 22 000 triangles : fourrure en éclats, piques de cristal, écailles, objets qui flottent autour (lune de sang, engrenages, colonnes, épaves). Les 40 autres pets (Commun → Légendaire) sont plus simples : 10 espèces mignonnes, décorées selon leur monde (bonbons, baies, chocolat, café, glace, sundae, planètes, étoiles). Plus un pet est rare, plus il a d'accessoires : décoration sur la tête dès Peu commun, collier dès Rare, objets en orbite dès Épique, auréole dorée pour les Légendaires. Les fichiers sources sont dans `tools/web/pets/`.

**Dans le jeu, rien à importer :** les nouveaux modèles sont déjà dans `SweetPetsFactory.rbxlx`, convertis en pièces Roblox (blocs, boules, cylindres et coins). Leurs plans sont dans `src/shared/PetPlans/`, un par pet. Les pièces trop petites sont retirées pour garder le jeu fluide : jusqu'à 150 à 240 pièces pour les pets communs, 650 pour les Mythiques et 900 pour les Divins. Les vignettes de l'interface n'en gardent que les 120 plus grandes.

Pour utiliser les fichiers 3D ailleurs dans Studio : onglet Accueil › **Import 3D** (3D Importer), puis choisis le `.glb` ou le `.obj`. Chaque maillage reste sous la limite de 20 000 triangles.

## Animations

Les pets rares ont un squelette : ailes, têtes, mâchoires, queues, pattes, tentacules, cous. Ils ont 3 animations :

| État | Quand | Exemples |
| --- | --- | --- |
| **Repos** (idle) | le pet attend à côté de toi | ailes qui battent doucement, tentacules qui ondulent |
| **Déplacement** (move) | il te suit ou va vers un tas | pattes qui marchent en diagonale, ailes rapides |
| **Attaque** (ability) | il casse un tas de bonbons ou frappe le boss | morsures des 3 têtes du Cerbère, coups de trompe du Mammouth, cous de l'Hydre qui frappent, hurlement de Fenrir |

Les animations passent en douceur d'un état à l'autre. Les auréoles, les engrenages, les piliers et le soleil de Ra tournent en permanence. Quand tu fais éclore un pet rare, il joue son animation d'attaque pendant la révélation.

Sont animés : les dragons, licornes, rois et fantômes (Légendaires), et tous les Mythiques et Divins.

## Panneau admin

Bouton 🛡️ **Admin** à droite de l'écran, ou touche **K**. Il n'apparaît que pour les admins : le créateur du jeu (ou le propriétaire du groupe), les identifiants mis dans `Config.AdminIds`, et tout le monde quand on teste dans Studio. Le serveur revérifie chaque action.

![Aperçu du panneau admin](apercu_panneau_admin.png)

Quatre onglets :
- **🤖 Assistant IA** : écris ce que tu veux en français (« donne un Kraken arc-en-ciel à Noah et lance la gravité lunaire 5 min ») et l'IA (Claude) le fait avec les mêmes actions que les boutons. Elle demande confirmation avant de remettre une partie à zéro.
- **🛠️ Manuel** : choisis la cible (toi, tout le monde ou un joueur), puis donne des pièces, des gemmes, un pet (normal, doré, arc-en-ciel, shiny), une potion, téléporte, fais apparaître le boss, expulse ou remets une partie à zéro (deux clics).
- **🔥 Admin abusé** : événements pour tout le serveur, avec une bannière et un minuteur chez chaque joueur : pièces x10, chance x10, dégâts x10, vitesse x2, pluie de pièces, gravité lunaire, tout le monde géant ou mini, disco, nuit étoilée, pluie de pets de la rareté choisie. La case « Valeur » change le multiplicateur ou la taille.
- **📢 Annonces** : ton message s'affiche en grand et dans le chat, traduit dans la langue de chaque joueur. Le chat entre joueurs est déjà traduit automatiquement par Roblox. Un journal garde les 40 dernières actions.

### Brancher l'IA (une fois)

L'assistant IA et la traduction utilisent l'API Claude. La partie Manuel et l'Admin abusé marchent sans.
1. Crée une clé API sur [console.anthropic.com](https://console.anthropic.com) (l'utilisation est payante, à quelques centimes la demande).
2. Jeu publié : sur le Creator Hub, ouvre ton expérience › **Secrets**, ajoute un secret nommé `anthropic_api_key`, avec ta clé comme valeur et `api.anthropic.com` comme domaine.
3. Pour tester dans Studio : ajoute une **StringValue** nommée `ClaudeApiKey` dans **ServerStorage** et colle ta clé dans Value. Retire-la avant de publier ou de partager le fichier.
4. Les requêtes HTTP sont déjà activées dans le fichier du jeu (sinon : Game Settings › Security › Allow HTTP Requests).

## Voyager et marteaux à bonbons

- **Mondes (C)** : chaque monde a sa carte avec une petite scène 3D, son numéro, ses bonus et un bouton **VOYAGER**. Le voyage se fait en wagon dans un tunnel arc-en-ciel, avec des traits de vitesse, puis un grand « ARRIVÉE ! ».
- **Marteaux (H)** : 15 marteaux à collectionner, du Maillet en bois à la Foudre d'Olympe. Chacun multiplie la force de tes clics (de x1,1 à x6). Tu en tires avec des pièces (x1 ou x10, dont 1 offert), et un doublon te rend 25 % du prix. Le marteau équipé est dans la main de ton personnage et frappe à chaque clic. Les chances sont affichées dans la machine.

## Sons

Les sons sont déjà dans le jeu, il n'y a rien à importer. Ce sont des sons publics de la bibliothèque Roblox (packs officiels Roblox, ProSoundEffects et APM), utilisables dans n'importe quel jeu. Comme dans les simulateurs de pets qui marchent, les pièces montent d'un demi-ton quand tu en ramasses à la suite, l'œuf siffle puis craque, et la révélation grossit avec la rareté.

| Moment | Son |
| --- | --- |
| Boutons, fenêtres, action impossible | Roblox UI Bright Click, Whoosh, GUI Back, GUI Negative |
| Coup sur un tas, tas cassé, pièces | Boink Pop, Crack Egg Crunchy, GUI Pickup |
| Achat, récompense de quête | GUI Purchase, GUI Notification High |
| Éclosion | montée sifflante puis craquement |
| Révélation Commun · Rare · Légendaire et Mythique · Divin | Tonal Stinger · GUI Aura · APM « Top Prize » · APM « Epic Win » + Magic Burst |

Pour changer un son : mets un Sound dans **SoundService › SweetSounds** avec le même nom que dans le tableau `SOUNDS` de `src/client/init.client.luau` (`click`, `coin`, `legend`…). Il remplace celui d'origine.

## Robux

La boutique (**B**) a un onglet **Passes** et un onglet **Robux**.

**Gamepass** (prix conseillés) : Triple éclosion 199, Auto-éclosion 149, Éclosion rapide 99, Pièces x2 249, Chance x2 199, Dégâts x2 149, +3 pets équipés 249, Inventaire +150 79, Super vitesse 49, Chance shiny x3 199, VIP 399.

**Produits** (achats répétables) : 100, 550, 1 200 et 6 500 gemmes (25, 99, 199, 899), 1 heure de pièces (49), pack des 3 potions 30 min (79), chance x2 pour tout le serveur pendant 15 min (149).

Pour encaisser des Robux :
1. Publie le jeu (Fichier › Publier sur Roblox).
2. Sur [create.roblox.com](https://create.roblox.com), ouvre ton jeu › **Monétisation** : crée un **Pass** pour chaque gamepass et un **Produit de développeur** pour chaque produit, au prix que tu veux.
3. Copie chaque identifiant dans `src/shared/Config.luau` : `Config.GamePassIds` pour les passes, champ `id` de `Config.Products` pour les produits. Dans Studio, c'est le script **ReplicatedStorage › Shared › Config**.
4. Republie le jeu. Le bouton affiche alors le vrai prix en Robux.

Tant qu'un pass vaut 0, il s'achète avec des gemmes gagnées en jeu. Un produit à 0 n'apparaît pas pour les joueurs ; les admins le voient grisé, pour savoir lequel configurer.

## Musique

Chaque monde a sa musique et le combat du boss a la sienne (bibliothèque Roblox, APM) : *Bubblegum Factory*, *Chocolate Chip*, *Snowfall Dance*, *Cosmic Dust* et *Epic Battle Simulator*. On peut la couper dans **Réglages**. Les pistes se changent dans `Config.Music`.

## Commandes

| Action | Touche |
| --- | --- |
| Marcher | ZQSD / WASD, ou toucher l'écran sur mobile |
| Casser un tas | Clic sur le tas |
| Ouvrir un œuf, utiliser le portail ou la porte des mondes | **E** à côté |
| Récolte auto | **F** |
| Pets · Index · Boutique · Quêtes | **P** · **I** · **B** · **J** |
| Mondes · Cadeau · Rebirth | **C** · **G** · **R** |
| Panneau admin (admins seulement) | **K** |

## Pour les développeurs

Le projet suit le format [Rojo](https://rojo.space) : `rojo build default.project.json -o SweetPetsFactory.rbxlx`.

Outils fournis :
- `tools/export_models.luau` et `tools/make_rbxmx.py` : régénèrent les fichiers `.rbxmx` à partir des plans ;
- `tools/gen.sh` : prépare une copie de `Config` utilisable hors de Roblox ;
- `tools/web/rbxexport.js` : régénère `src/shared/PetPlans/` à partir des modèles (`roblox.js` fait la conversion en pièces) ;
- `tools/web/` : l'atelier de modélisation (`forge.js`, `parts.js`, un fichier par créature dans `pets/`) et les exporteurs `.glb`/`.obj` (three.js, à lancer avec Node et Playwright).
