# SILLAGE — Tower Defense WEGO

Prototype jouable (HTML/CSS/JS vanilla, aucun build, aucune dépendance).

## Lancer

Ouvrir `index.html` dans un navigateur.

## Règles

- **Tour par tour WEGO** : chaque tour a deux temps.
  1. **Planification** — le joueur déplace ses unités et attribue des cibles ; l'IA ennemie planifie sa course vers le noyau en même temps.
  2. **Résolution simultanée** — les deux camps s'exécutent en même temps pendant ~7 s : les ennemis filent vers le noyau en évitant les tourelles, les tourelles tirent en temps réel.
- **Déplacement sillage** : cliquer une unité fait apparaître un **cercle virtuel** = sa capacité de déplacement du tour. En la tirant, un **tracé (sillage)** s'effectue et le cercle **rétrécit à mesure** ; à épuisement (rayon 0), plus aucun déplacement. Le bouton « Réinitialiser unités » restaure les réserves de déplacement de toutes les tourelles depuis leur position actuelle.
- **Ciblage** : unité sélectionnée + clic sur un ennemi = cible prioritaire (re-cliquer annule).
- **Recrutement** : boutons Canon (30) / Lance (60), déploiement au clic sur une case libre.

## Contenu

- `canon` : court rayon, tir rapide, très mobile (90 px/tour).
- `lance` : long rayon, gros dégâts, peu mobile (60 px/tour).
- Ennemis : Rôdeur, Muon (rapide), Colosse (tank). Vagues croissantes sur 10 tours.
- Perdu si le noyau atteint 0 PV ; gagné en survisant aux 10 vagues.

## Fichiers

- `index.html` — structure + HUD + overlay de règles
- `style.css` — thème sombre
- `game.js` — toute la logique (phases, sillage, résolution simultanée, IA ennemie, rendu canvas)
