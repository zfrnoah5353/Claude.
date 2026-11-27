# PC à distance : voir, contrôler et allumer son PC

Deux programmes Windows prêts à l'emploi dans [`dist/`](dist/) :

| Fichier | Où le lancer | Ce qu'il fait |
|---|---|---|
| `Installer-sur-mon-PC.exe` | Sur **le PC à contrôler** (une fois) | Installe RustDesk en service, met un mot de passe permanent, active le Wake-on-LAN, désactive le démarrage rapide, crée `allumage.cfg` + `PC-a-distance-INFOS.txt` sur le bureau |
| `Telecommande.exe` | Sur **l'autre PC** (avec `allumage.cfg` à côté) | Menu : allumer le PC, le voir/contrôler, ou les deux enchaînés |

## En 3 étapes

1. Sur ton PC : double-clic sur `Installer-sur-mon-PC.exe` → Oui (admin) → Entrée (mot de passe généré).
2. Redémarre le PC, entre dans le BIOS (Suppr / F2) : active **Wake on LAN** (ou *Power On By PCI-E* / *Resume by LAN*), désactive **ErP/EuP**.
3. Copie `Telecommande.exe` + `allumage.cfg` (sur le bureau du PC) sur l'autre appareil.

Sur téléphone : appli **RustDesk** (ID + mot de passe) pour contrôler, et une appli Wake-on-LAN ou l'appli de ta box pour allumer.

## Allumer depuis l'extérieur de la maison

Le signal d'allumage passe par la box. Dans l'interface de la box :
- bail DHCP statique pour le PC (IP locale ↔ MAC) ;
- redirection de port **UDP 9** vers l'IP locale du PC.

Le plus fiable : le bouton « Wake on LAN » intégré à l'appli de la box (Freebox, Livebox, Bbox, SFR…) si elle en a un.

Conditions : PC branché au secteur **et en câble Ethernet**, éteint via Démarrer > Arrêter.

Raccourcis possibles : `Telecommande.exe allumer`, `Telecommande.exe controler`, `Telecommande.exe tout`.

## Recompiler

```sh
./build.sh
```
