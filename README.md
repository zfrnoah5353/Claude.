# SetupForge

Configurateur de PC et de setup **gratuit**, sans compte et sans publicité, pour Windows.
Un seul fichier : `dist/SetupForge.exe` (double-clic, rien à installer, fonctionne hors ligne).

## Ce que fait l'app

- **Configurateur 3D** : la tour se monte en 3D avec les dimensions réelles des pièces ; on clique sur un emplacement pour choisir la pièce.
- **Setup complet par budget** : on donne un budget (tour seule, ou avec écran, périphériques et Windows) et l'app propose un setup compatible et équilibré.
- **Vue bureau** : écran(s), clavier, souris et casque posés sur le bureau à côté de la tour.
- **Compatibilité** : socket, mémoire, longueur de la carte graphique, hauteur du ventirad, format de la carte mère, alimentation, emplacements M.2 / SATA.
- **Consommation** estimée et puissance d'alimentation conseillée.
- **Flux d'air** et **RGB** animés dans la vue 3D (schéma indicatif, pas une simulation thermique).
- **Pièces perso** : ajouter du matériel absent de la base.
- **Export** texte ou tableau Markdown, sauvegarde et import en fichier `.json`.
- 45 000 pièces environ, dans 14 catégories.

## Sur téléphone

La même app existe en version web tactile (un `.exe` ne tourne pas sur Android ni iPhone). `python3 tools/buildmobile.py` fabrique le dossier `mobile/`, à publier sur n'importe quel hébergement de pages statiques. Dans cette version, les setups sont enregistrés dans le navigateur du téléphone.

## Limites à connaître

- **Les prix sont des estimations.** La base de données ne contient aucun prix : les montants précédés de « ≈ » sont calculés à partir des caractéristiques et peuvent s'écarter des prix réels. Chaque pièce a des liens marchands pour vérifier, et le prix réel se saisit dans la case.
- Pas d'estimation de FPS ni de réalité augmentée.
- L'exécutable n'est pas signé : au premier lancement, Windows SmartScreen affiche un avertissement (« Informations complémentaires » puis « Exécuter quand même »).

## Compiler

```sh
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o dist/SetupForge.exe .
```

Régénérer les données à partir d'un clone de BuildCores OpenDB :

```sh
python3 tools/builddata.py chemin/vers/buildcores-open-db web/data
```

Les setups sont enregistrés dans `%AppData%\SetupForge\store.json`.

## Licences

- **Données des pièces** (`web/data/`) : dérivées de [BuildCores OpenDB](https://github.com/buildcores/buildcores-open-db), sous licence [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Version source : commit `c70dd088`. Modifications : champs réduits, prix estimés et scores de performance ajoutés. Ces fichiers restent sous CC BY-NC-SA 4.0, donc **usage non commercial uniquement**.
- **three.js** (`web/vendor/`) : licence MIT.
- SetupForge est un projet indépendant, sans lien avec BuildCores.
