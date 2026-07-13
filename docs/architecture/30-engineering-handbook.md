# 30. Engineering Handbook

Guide de travail quotidien pour tout développeur rejoignant QuickTable. Ce document **ne redéfinit pas** l'architecture (voir docs 02-04, 12) — il consolide les conventions de collaboration au jour le jour. En cas de conflit apparent, les documents d'architecture spécialisés font foi sur le fond ; ce handbook fait foi sur la forme et le process.

## 30.1 Convention Git

- **Branche par défaut** : `main`, toujours déployable (protégée, CI verte obligatoire, revue obligatoire).
- **Branches de travail** : `type/scope-courte-description`, ex. `feat/orders-send-to-kitchen`, `fix/tables-qrcode-regenerate`, `chore/upgrade-mongoose`.
  - Types autorisés : `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `perf`, `security`.
- **Pas de branche `develop` intermédiaire** : trunk-based development simplifié, chaque PR part de `main` et y retourne — cohérent avec des déploiements fréquents (doc 18 §18.8 Canary/Blue-Green) et évite les divergences longues.
- **Rebase, pas de merge commit** sur les branches de feature avant merge (historique linéaire) ; le merge vers `main` se fait par **squash merge** (un commit par PR sur `main`, message = titre de la PR en Conventional Commits).

## 30.2 Conventional Commits (rappel doc 14 §14.2)

```
<type>(<scope>): <description impérative>
```
`scope` = nom du module (doc 04) ou du document (`docs`) concerné. Le CHANGELOG (doc 17 §17.2) est généré automatiquement à partir de cet historique — un commit mal typé casse la génération, vérifié par Commitlint en `pre-commit` (doc 14 §14.1).

## 30.3 Conventions TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitAny: true` (doc 14 §14.1) — non négociable.
- Pas de `any` sans commentaire justificatif immédiatement au-dessus (`// any justifié : lib tierce non typée, voir issue #123`).
- Types métier partagés (`Order`, `MenuItem`, enums de statut) **toujours** importés depuis `packages/shared-types` (doc 03/11), jamais redéfinis localement même partiellement.
- Préférer `type` à `interface` pour les DTO/Value Objects (union types plus naturelles) ; `interface` réservé aux contrats de classes/services amenés à être étendus.
- Un fichier = une responsabilité claire ; au-delà de ~300 lignes dans un `*.service.ts`, envisager de sous-découper en méthodes privées nommées explicitement plutôt que d'ajouter des commentaires de section.

## 30.4 Conventions Vue 3

- Composition API + `<script setup lang="ts">` exclusivement (doc 11 §11.1).
- Un composant = un fichier `.vue`, nommé en `PascalCase`, préfixé par domaine si ambigu (`OrderCard.vue` dans `components/modules/orders/`, pas besoin de préfixe redondant type `OrdersOrderCard.vue`).
- Props typées avec `defineProps<{ ... }>()` (pas de runtime props loose), `emits` explicitement typés.
- Pas de logique métier dans un composant `.vue` au-delà de l'orchestration d'affichage — toute règle métier vit dans un composable ou un store (doc 11 §11.1).
- Classes Tailwind directement dans le template pour le styling ponctuel ; tout style répété 3 fois ou plus devient un composant `components/ui/` (doc 11 §11.7).

## 30.5 Conventions Express / Backend

- Un module = la structure figée du doc 12 §12.1, sans exception ni raccourci "juste pour cette fois".
- Toute nouvelle route déclare explicitement sa permission RBAC (doc 08) dans `*.routes.ts`, jamais une vérification ad hoc dans le controller.
- Toute nouvelle collection Mongoose applique les plugins transverses obligatoires : `tenantScope` (sauf collections plateforme explicitement exemptées, doc 06), `timestamps`, `softDelete` si applicable (doc 23), `auditable` si l'action est listée au doc 24 §24.3.
- Tout nouveau Domain Event (doc 20) est ajouté au registre central avant d'être publié/consommé, avec son schéma de payload documenté dans doc 20 §20.4 (mise à jour de la doc = partie de la Definition of Done, §30.9).

## 30.6 Conventions MongoDB

- Nom de collection : `camelCase` pluriel (`menuItems`, pas `menu_items` ni `MenuItem`).
- Tout nouvel index composé commence par `tenantId` sauf justification explicite en commentaire de migration (doc 05 §5.7, doc 06 §6.6).
- Toute requête d'écriture financière ou multi-collection utilise une transaction MongoDB explicite (doc 05 §5.8, doc 19 §19.1).
- Migrations (doc 12 §12.7) : un fichier par migration, nommé `YYYYMMDDHHmm_description.ts`, jamais de modification a posteriori d'une migration déjà mergée sur `main` (une correction = une nouvelle migration).

## 30.7 Conventions Socket.IO

- Nom d'événement : `domaine:action` (doc 10 §10.4), déclaré dans `sockets/events.registry.ts` avant tout usage.
- Un handler d'événement entrant valide toujours son payload avec le même schéma Zod qu'un endpoint REST équivalent, s'il existe (doc 10 §10.8).
- Jamais de logique métier dans un handler socket — délégation immédiate au service du module concerné (même règle que les controllers REST, doc 12 §12.2).

## 30.8 Structure des dossiers — rappel synthétique

Voir doc 03 (structure complète et justifiée) et doc 28 §28.6 (règle DDD : un repository par Aggregate Root). Ce handbook n'en donne pas de copie — se référer au doc 03 en cas de doute plutôt qu'à sa mémoire.

## 30.9 Definition of Ready (DoR)

Une User Story (doc 34) est prête à être prise en développement si :
- [ ] Le besoin métier est formulé du point de vue utilisateur (format `En tant que… je veux… afin de…`).
- [ ] Les critères d'acceptation sont explicites et testables.
- [ ] Les dépendances (autres stories, doc 34) sont identifiées et résolues ou planifiées avant.
- [ ] Les zones grises métier concernées (doc 01 §1.7, ex. règles de split bill) ont été tranchées ou explicitement mises hors scope.
- [ ] L'impact sur la documentation d'architecture est anticipé (nouveau Domain Event ? nouvelle collection ? nouvelle permission RBAC ?).

## 30.10 Definition of Done (DoD)

Une tâche/story est terminée si :
- [ ] Code mergé sur `main` via PR passée en revue (doc 30.11).
- [ ] Tests unitaires + intégration ajoutés et verts (doc 31).
- [ ] Tests d'isolation multi-tenant et RBAC non régressés si la story touche une route/collection (doc 06/08).
- [ ] Documentation d'architecture mise à jour si applicable (nouveau Domain Event, doc 20 ; nouvel endpoint, doc 09 ; nouvelle collection, doc 05).
- [ ] Déployé et vérifié fonctionnellement sur l'environnement de staging.
- [ ] Aucune régression de performance détectée (doc 29) sur les parcours critiques concernés.
- [ ] Checklist correspondante du doc 16 cochée.

## 30.11 Checklist de Pull Request

À l'ouverture d'une PR, l'auteur remplit :
- [ ] **Quoi** : résumé en une phrase.
- [ ] **Pourquoi** : lien vers la User Story/le bug (doc 34).
- [ ] **Comment tester** : étapes manuelles si pertinent (doc 14 §14.8).
- [ ] **Impact architecture** : ce PR ajoute/modifie-t-il un Domain Event, une collection, une permission, un endpoint public ? Si oui, quel document a été mis à jour ?
- [ ] **Captures d'écran** si changement UI (doc 11 §11.7, exigence "interface jolie et cohérente" à vérifier visuellement, pas seulement fonctionnellement).

Le relecteur vérifie en plus (doc 14 §14.8) : isolation tenant respectée, permission RBAC déclarée, erreurs typées utilisées, pas de secret loggé (doc 25 §25.2), taille de diff raisonnable (< 400 lignes hors fichiers générés, sauf justification).

## 30.12 Bonnes pratiques transverses (rappel condensé)

1. KISS avant DRY avant performance prématurée (doc 14 §14.5) — dans cet ordre.
2. Aucune règle métier devinée silencieusement : une zone grise non tranchée (doc 01 §1.7) est signalée au Product Owner, jamais arbitrée seul en silence dans le code.
3. Un Domain Event est publié pour tout fait métier significatif, même si aucun abonné n'existe encore (doc 20) — moins cher à faire au moment de l'écriture qu'à rattraper plus tard.
4. Toute nouvelle donnée personnelle stockée est immédiatement qualifiée vis-à-vis de la politique de soft delete/RGPD (doc 23 §23.6).
5. Un doute d'architecture non tranché par ce dossier devient un brouillon d'ADR (doc 17 §17.3, dossier `adr/`) soumis en revue, pas une décision informelle sur Slack perdue ensuite.
