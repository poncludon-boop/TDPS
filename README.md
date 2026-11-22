# SILLAGE 3D — Tower Defense WEGO

Prototype jouable en 3D (Three.js, aucun build local — le CDN jsDelivr est le seul appel externe).

## Lancer

Ouvrir `index.html` dans un navigateur (connexion à Internet requise pour Three.js), ou via GitHub Pages : `https://poncludon-boop.github.io/TDPS/`.

## Règles

- Terrain plat : **base au sud**, ennemis déferlant du **nord, sur toute la largeur**.
- Chaque tour : **planification** puis **résolution simultanée** (7 s) des deux camps (WEGO). 10 vagues à surviser, noyau à 20 PV.

### Mécanique sillage (corrigée)

Sélectionner une tourelle (clic gauche) puis la traîner : un **tracé sillage** se dessine derrière elle pendant qu'un **cercle virtuel suit le pointeur en se rétractant en temps réel** à mesure que la distance est consommée ; il disparaît à épuisement de la réserve (`capacité − utilisé`).

**Visée automatique** : chaque tourelle tire d'elle-même dès qu'un ennemi est à portée, les tirs partant de ses canons (les canons démarrent orientés nord). Une visée manuelle au **clic droit** (laser = axe, mortier = point d'impact) la remplace pendant le tour. Clic droit + glisser : orbite caméra, molette : zoom. Base collée au bord sud.

### Arsenal

| Tourelle | Portée | Dépl./tour | Cadence | Dégâts |
|---|---|---|---|---|
| **Gatling** | 50 | 50 | rafales 25/tour | −1 PV · trait 3 px, meurt sur impact ou au bord du terrain |
| **Laser** | 100 | 25 | 1/tour | −50 PV · trait 7 px sur toute la longueur, rétrécit à 1 px en 3 s, touche tout ennemi sur son passage |
| **Mortier** | ∞ | 10 | 2/tour | −25 PV · explosion ⌀ 21 |

Ennemis : Rôdeur (35 PV, rapide), Muon (20 PV, très rapide), Colosse (90 PV, lent, blindé).

## Fichiers

- `index.html` — structure, HUD, overlay de règles
- `style.css` — thème sombre, HUD en surimpression
- `game.js` — moteur Three.js : scène 3D, sillage, phases WEGO, IA ennemie, tirs, caméra orbitale
