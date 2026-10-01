# Skills : décisions produit et reste à faire

## Décision (2026-09-19)

Tout utilisateur connecté peut télécharger et installer des skills dans son propre espace local, pour les utiliser avec son agent, sans passer par un admin. Un employé qui a besoin d'un skill pour un cas précis ne doit pas avoir à demander à quelqu'un.

- Espace local : les skills de l'utilisateur vivent dans son dossier utilisateur (`UserPath(userID)`), les dépôts téléchargés sous le dossier runtime (`GetSkillReposPath()`).
- Le verrou admin sur `/skills/repos` a été retiré de `seshat-backend` (`internal/api/routes.go`). Le test est devenu `TestSkillReposAvailableToMembers`.
- Si une organisation veut un jour restreindre ça, ce sera une politique (Desktop Policies), pas un rôle imposé à tout le monde.

## MVP (en cours)

- Une seule grille qui mélange les skills installés et les dépôts proposés, avec « + » pour installer en local.
- Détail d'un skill en lecture seule (arborescence, `SKILL.md` rendu).

## Reste à faire (pas maintenant)

1. **Catalogue cloud de skills individuels, avec image par skill** (comme Manus). Aujourd'hui un « catalogue » est une liste de dépôts Git avec seulement `name`, `url`, `description`, et il n'y a aucun champ image côté `seshat-backend` ni `seshat-server`. Un clic sur « + » télécharge le skill en local pour l'usage (plus efficace et utilisable hors ligne).
2. **Partage communautaire dans les organisations.** Un membre publie son skill dans un catalogue partagé ou public de l'organisation, les autres le voient et l'installent. Local et cloud coexistent.
3. **Badge « officiel »** pour les skills de l'organisation ou de Seshat. Les skills partagés par les membres ne sont pas officiels, mais ça favorise le partage et le travail d'équipe.
4. **Dossier des dépôts par utilisateur.** Il est partagé par instance de backend, pas par utilisateur. Sans conséquence sur le backend local du desktop, à revoir avant d'exposer un backend à plusieurs personnes.
5. **Créer un skill à la main et modifier `SKILL.md` dans l'interface.** `POST /skills` et `PUT /skills/:name` existent déjà côté backend, le modal de détail est en lecture seule pour l'instant.
6. **Suppression** : le bouton Delete n'existe que pour la source `userSettings`. Les autres sources (`bundled`, `managed`, `plugin`, `mcp`) n'en ont pas.
