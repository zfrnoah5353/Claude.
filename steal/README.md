# Steal a Sweet Egg

Un jeu Roblox dans le style « Steal a … » avec les 53 pets en 3D de Sweet Pets Factory.

## Le jeu

- **Tapis rouge** au milieu de la map : des œufs défilent de l'usine à la broyeuse. Approche-toi et appuie sur **E** pour en acheter un. Il s'envole jusqu'à ta base.
- **7 œufs**, du Bonbon (25 $) au Divin (60 M$). Plus l'œuf est rare, plus il met de temps à éclore et plus le pet rapporte.
- **Mutations** à l'éclosion : Doré (x3, 8 %), Arc-en-ciel (x10, 1,5 %) et Shiny (x1,5, 3 %).
- **Ta base** : 10 socles, puis 15 et 20 en l'agrandissant. Chaque pet remplit sa réserve d'argent chaque seconde. Marche sur la **plaque verte** devant lui pour ramasser.
- **Voler** : entre chez quelqu'un et maintiens **E** sur un œuf ou un pet. Tu le portes au-dessus de ta tête, tu ralentis, et tu as 60 s pour le ramener chez toi.
- **Batte** : frappe un joueur pour l'assommer et le faire tomber. Un voleur frappé lâche ce qu'il porte, qui retourne chez son propriétaire.
- **Verrou** : le bouton rouge au fond de ta base allume des lasers pendant 60 s. Les visiteurs sont repoussés dehors.
- **Vendre** : maintiens **F** sur un de tes pets.
- **Rebirth** : argent x1,5, puis x2, x2,5… pour toujours, et +5 s de verrou. L'argent et la base repartent de zéro.
- **Index** des 53 pets, annonces pour tout le serveur quand un œuf mythique ou divin arrive, musique et sons.
- Sauvegarde automatique : argent, base, œufs en cours, index et rebirths.

8 joueurs maximum par serveur, un par base. Dans les paramètres du jeu, mets le nombre maximum de joueurs à **8**.

## Mettre les modèles Blender

Les pets s'affichent déjà avec les modèles en pièces. Pour la version Blender, plus jolie, fais une seule fois l'import décrit dans `../roblox/README.md` (section « Modèles Blender »), mais dans `StealASweetEgg.rbxlx`. En bref : **Accueil › Importer**, puis les 53 `pet_….fbx` de `dist/SweetPets_Modeles_Blender.zip`, puis Ctrl + S.

## Robux

Dans `ReplicatedStorage › Shared › Config`, en haut du fichier :
- **Passes** : VIP (argent x2 + « Tout ramasser »), Super cadenas, Baskets fusée, Trèfle d'or, Éclosion rapide.
- **Produits** : 3 paquets d'argent, une pluie d'œufs rares pour le serveur, un œuf Mythique et un œuf Divin.

Crée-les sur le Creator Hub (ton jeu › Monétisation), puis remplace les `id = 0` par leurs numéros. Tant qu'un id vaut 0, la boutique affiche « pas encore en vente ».

## Réglages rapides (Config)

- `CONVEYOR_EVERY` : un œuf toutes les 2,2 s.
- `CONVEYOR_SPEED` : vitesse du tapis.
- `LOCK_TIME` : durée du verrou.
- `CARRY_TIME` : temps pour ramener un pet volé.
- `EGGS` : prix, revenus, durées d'éclosion et fréquences des 7 œufs.
- `PET_SIZE`, en haut de `StarterPlayerScripts › Client` : taille des pets sur les socles.
