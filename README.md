# colortweaks-videos

Agent qui génère une vidéo promo TikTok pour **ColorTweaks** et la publie sur @colortweaks via Metricool.

## Structure
| Chemin | Rôle |
|---|---|
| `assets/clips/` | clips de gameplay (extraits de moins de 20 Mo) |
| `assets/samples/` | captures VALORANT du site (utilisées si aucun clip) |
| `assets/fonts/` | police Poppins (licence OFL) |
| `templates/` | page HTML d'animation (`video.html`, `engine.js`, `scenes.js`) |
| `render.js` | rendu image par image avec Playwright (Chromium headless) |
| `music.py` | musique originale synthétisée (numpy/scipy) |
| `generate.py` | choisit un format inédit, rend, met en musique, encode, vérifie |
| `publish.py` | push GitHub, lien raw, paramètres Metricool, history.json, nettoyage 48 h |
| `posts/` | vidéos produites et leurs descriptions |
| `history.json` | publications déjà faites (anti-répétition) |
| `errors.log` | erreurs (rien n'est publié en cas d'erreur) |
| `.claude/commands/publier.md` | commande `/publier` qui enchaîne tout |

## Formats (tirés au hasard, jamais deux fois de suite le même)
quiz « Quel look est fait pour toi ? », tuto d'installation, avant/après sur gameplay, raccourcis clavier,
auto en jeu, présentation des fonctions, look par jeu.

## Lancer à la main
```
python3 generate.py            # ou --format quiz|tuto|avantapres|raccourcis|auto|fonctions|jeux
python3 publish.py status
```
Dans Claude Code : `/publier`.

## Honnêteté
La capture Windows n'enregistre pas le filtre : quand un look est appliqué sur du gameplay, il est
reproduit au montage avec la même formule que l'appli et la vidéo l'indique en petit. Aucun chiffre de
performance n'est affiché.
