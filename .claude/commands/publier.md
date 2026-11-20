---
description: Génère, vérifie et publie une vidéo promo ColorTweaks sur TikTok via Metricool, puis nettoie
---

Tu publies UNE vidéo promo TikTok ColorTweaks. Travaille dans la racine du dépôt, sans poser de question
(mode non interactif). Ne publie jamais une vidéo qui n'a pas passé tous les contrôles.
Toute erreur définitive va dans `errors.log` (via `publish.py fail`) et rien n'est publié.

## 0. Préparation
- Si `scipy` manque : `pip install -q scipy numpy`.
- `git pull --ff-only origin $(git rev-parse --abbrev-ref HEAD)` pour avoir le dernier `history.json` (ignore une erreur réseau).

## 1. Nettoyage
`python3 publish.py cleanup` (supprime du dépôt les vidéos publiées il y a plus de 48 h).

## 2. Génération
`python3 generate.py` (2 à 4 minutes, `timeout` 900000). La dernière ligne est un JSON.
- `"ok": false` → l'erreur est déjà dans `errors.log` : arrête-toi et résume l'erreur.
- `"ok": true` → note `id`, `video`, `meta`, `planche`.

## 3. Vérification visuelle (obligatoire)
- Ouvre l'image `planche` avec Read (images clés de chaque scène) et le fichier `meta` (description, contrôles).
- Refuse la vidéo si : texte coupé, qui déborde ou se chevauche, image vide ou noire, bande noire unie en haut ou en bas,
  description sans « lien en bio », mention « rendu du filtre reproduit au montage » absente alors que `filtre_reproduit` est vrai,
  chiffre ou promesse de performance inventés.
- En cas de refus : `python3 publish.py fail <id> verification "<raison>"`, puis relance UNE fois l'étape 2 et 3.
  Si la deuxième vidéo est aussi refusée, arrête-toi.

## 4. Mise en ligne de la vidéo
`python3 publish.py prepare <id>` → JSON avec `blogId`, `date`, `info`, `url` (commit + push + lien raw vérifié).
En cas d'échec (déjà réessayé une fois par le script) : `python3 publish.py fail <id> push "<erreur>"` et arrête-toi.

## 5. Publication Metricool
Appelle l'outil `mcp__Metricool_Social_Media_Management__createScheduledPost` avec :
- `blogId` = le `blogId` du JSON,
- `date` = le `date` du JSON,
- `info` = l'objet `info` du JSON sérialisé en chaîne JSON, sans rien modifier.
Si l'appel échoue : attends 30 s, remets `publicationDate.dateTime` et `date` à maintenant + 3 min (heure de Paris), et réessaie UNE fois.
Si le deuxième essai échoue : `python3 publish.py fail <id> metricool "<erreur>"` et arrête-toi.

## 6. Contrôle dans Metricool
Appelle `mcp__Metricool_Social_Media_Management__getScheduledPosts` (brandId 7583648, timezone Europe/Paris,
de maintenant - 1 h à maintenant + 1 jour) et retrouve le post (même lien vidéo). S'il est déjà parti, l'absence
est normale : garde l'id renvoyé par createScheduledPost.

## 7. Historique
`python3 publish.py record <id> --post-id <id Metricool> --uuid <uuid> --planner-url <plannerUrl> --date <date>`

## 8. Compte rendu
Termine par 3 lignes : format et accroche, heure de publication prévue, lien `plannerUrl`.
