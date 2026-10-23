# Sweet Pets Factory

Un simulateur de pets façon Roblox, jouable hors ligne sur Windows. On casse des tas de bonbons avec ses pets, on ouvre des œufs, on collectionne 42 pets et on passe de monde en monde.

## Télécharger et jouer

1. Télécharge **[`dist/SweetPetsFactory.exe`](dist/SweetPetsFactory.exe)** (environ 10 Mo, rien à installer).
2. Double-clique dessus.
   Windows peut afficher « Windows a protégé votre ordinateur », parce que le fichier n'est pas signé : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

La partie est sauvegardée automatiquement toutes les 20 secondes et quand tu fermes la fenêtre, dans `%AppData%\SweetPetsFactory\save.json`.

## Commandes

| Action | Touche |
| --- | --- |
| Marcher | ZQSD (AZERTY), WASD (QWERTY) ou les flèches, ou un clic sur le sol |
| Casser un tas de bonbons | Clic sur le tas : tes pets l'attaquent aussi |
| Ouvrir un œuf, utiliser le portail ou la porte des mondes | **E** quand tu es à côté |
| Récolte automatique activée ou coupée | **F** |
| Pets · Index · Boutique · Quêtes | **P** · **I** · **B** · **J** |
| Mondes · Cadeau du jour · Rebirth | **C** · **G** · **R** |
| Réglages / fermer une fenêtre | **Échap** |

## Contenu du jeu

- **4 mondes** : Candy Meadow, Choco Land, Ice Cream Island et Gummy Galaxy. Chacun a son décor, ses bonbons et deux œufs.
- **42 pets** répartis en 7 raretés : Commun, Peu commun, Rare, Épique, Légendaire, Mythique et Secret. Un pet sur 200 est **brillant** (puissance x1,5).
- **Fusions** : 5 pets identiques donnent un pet **doré** (x3), et 5 pets dorés donnent un pet **arc-en-ciel** (x10).
- **Niveaux** : les pets gagnent de l'expérience en travaillant, jusqu'au niveau 25 (+5 % de puissance par niveau).
- **Combos et coups critiques** : clique vite pour faire monter le combo jusqu'à x50.
- **Boss Gummy Golem**, environ toutes les 10 minutes : clique sur son point faible (dégâts x3) et esquive ses attaques. Le battre peut te faire gagner le pet Mythique Gummy Golem.
- **Rebirth** : tu repars de zéro en pièces et en mondes, mais tu gagnes un multiplicateur de pièces permanent. Tes pets, gemmes, améliorations et passes sont conservés.
- **Boutique** :
  - améliorations payées en pièces : dégâts, clic, critique, bonbons dorés, vitesse ;
  - améliorations payées en gemmes : emplacements de pets, inventaire, chance, pièces ;
  - potions et passes : triple éclosion, auto-éclosion, pièces x2, chance x2.
- **Quêtes** : 15 quêtes d'aventure, plus 3 quêtes du jour qui changent à minuit.
- **Cadeau du jour** sur 7 jours, **Index** de collection avec des paliers récompensés, et **gains hors ligne** quand tu reviens.
- **Inventaire** : auto-suppression réglable des raretés faibles et bouton « Vider ».

## Compiler soi-même

Il faut [Go 1.22 ou plus récent](https://go.dev/dl/). La commande fonctionne depuis Windows, macOS ou Linux :

```sh
cd game
./build.sh        # ou : GOOS=windows GOARCH=amd64 go build -ldflags "-H=windowsgui" -o ../dist/SweetPetsFactory.exe .
```

Le jeu est écrit en Go avec [Ebitengine](https://ebitengine.org). Les graphismes sont dessinés par le code et les sons sont synthétisés au lancement, donc il n'y a aucun fichier externe à fournir.

Pour les développeurs :
- `xvfb-run go test -run TestEconomy -v .` lance une simulation de 3 heures de jeu qui affiche la progression et sert à régler l'équilibrage.
- `SPF_DEBUG=1 SPF_SHOTS=dossier` joue un scénario automatique et enregistre une capture de chaque écran.

## Crédits

Police [Fredoka](https://github.com/hafontia/Fredoka-One), sous licence SIL Open Font License 1.1 (voir `game/assets/OFL.txt`).
