# 17. Standards de documentation

## 17.1 Principe

La documentation de QuickTable suit la même philosophie que le code : **une seule source de vérité par sujet**, jamais dupliquée à la main à plusieurs endroits. Ce dossier `docs/architecture/` est la source de vérité de la conception ; le code et ses schémas Zod sont la source de vérité de l'implémentation exacte ; l'écart entre les deux doit être traité comme une dette à résorber, pas ignoré.

## 17.2 Documents à produire et maintenir

| Document | Source de vérité | Généré ou rédigé | Public |
|---|---|---|---|
| `docs/architecture/*` (ce dossier) | Rédigé | Manuel, mis à jour à chaque décision structurante (ADR) | Équipe technique |
| Documentation API (OpenAPI/Swagger) | `*.validators.ts` (Zod) | Généré automatiquement (doc 12 §12.2) | Équipe technique + clients Premium (`api_access`) |
| `README.md` (racine + par package) | Rédigé | Manuel, revu à chaque changement de setup | Nouveaux développeurs |
| Changelog | Commits Conventional Commits | Généré automatiquement (`standard-version`/`changesets`) | Équipe + suivi produit |
| Manuel utilisateur (staff) | Rédigé (outil de documentation produit, ex. Notion/GitBook exporté) | Manuel | Clients restaurateurs |
| Guide de démarrage rapide restaurant | Rédigé | Manuel | Nouveaux tenants (onboarding) |
| Runbook opérationnel (incidents, déploiement, rollback) | Rédigé | Manuel, testé en simulation | Équipe technique / astreinte |
| ADR (Architecture Decision Records) | Rédigé | Manuel, un fichier par décision significative | Équipe technique |

## 17.3 Architecture Decision Records (ADR)

Toute décision qui dévie de ce dossier, ou qui tranche un point laissé ouvert, doit être consignée dans `docs/architecture/adr/NNNN-titre-court.md` avec le format :

```
# ADR NNNN — Titre

Statut : Proposé | Accepté | Remplacé par ADR-XXXX
Date : YYYY-MM-DD

## Contexte
[Le problème, sans la solution]

## Décision
[Ce qui a été choisi]

## Conséquences
[Ce que cela implique, y compris les compromis acceptés]
```

Exemples de sujets à formaliser en ADR dès qu'ils sont tranchés avec le client (doc 01 §1.7 recommandation n°1) : règles de split bill, gestion des pourboires, règle exacte d'annulation d'un article déjà envoyé en cuisine, politique de rétention des données à la résiliation d'un tenant.

## 17.4 Documentation API (OpenAPI)

- Générée à partir des schémas Zod des `*.validators.ts` (doc 12 §12.2), exposée sur `/api/v1/docs` (Swagger UI) en environnement staging, et sur un portail développeur dédié pour les clients Premium avec `api_access` (doc 08 §8.6) en production.
- Chaque endpoint documenté automatiquement doit inclure : méthode, chemin, permission requise, schéma de requête, schéma de réponse, codes d'erreur possibles (doc 09 §9.1) — cohérent avec ce qui est déjà formalisé dans le doc 09, qui sert de spécification de référence tant que la génération automatique n'est pas branchée (Phase 0-1).

## 17.5 Documentation utilisateur (produit)

Nécessaire dès la Phase 7 (doc 15) car QuickTable vise une commercialisation comparable à des produits matures (Toast, Square) où l'onboarding self-service est déterminant :
- **Guide de démarrage rapide** : créer son restaurant, inviter son équipe, configurer son premier menu, générer ses QR Codes.
- **Manuel par rôle** : un guide dédié pour Manager, Serveur, Cuisinier, Caissier — reflète directement le RBAC (doc 08), chaque manuel ne documente que ce que le rôle peut faire.
- **FAQ facturation/abonnement** : cycle de facturation SaaS, changement de plan, conséquences d'une suspension.
- Maintenue par l'équipe produit, mais **doit être revue à chaque changement d'UI/flux** touchant les parcours documentés (responsabilité partagée avec l'équipe technique lors de la revue de PR, doc 14.8).

## 17.6 Runbook opérationnel

Document vivant couvrant :
- **Déploiement** : étapes de mise en production, ordre (migrations avant déploiement API, doc 12 §12.7), procédure de rollback.
- **Incident multi-tenant** : que faire en cas de suspicion de fuite de données entre tenants (doc 06/13) — qui prévenir, comment isoler, comment auditer via `auditLogs`.
- **Révocation de sécurité** : comment révoquer massivement des sessions (ex. compromission d'une clé JWT), comment forcer une rotation de secrets.
- **Restauration** : procédure de restauration MongoDB Atlas testée en staging au moins une fois par trimestre (doc 18).
- **Astreinte** : contacts, escalade, SLA cible par sévérité d'incident.

## 17.7 Qui maintient quoi

| Document | Responsable principal | Fréquence de revue |
|---|---|---|
| `docs/architecture/*` | Tech Lead | À chaque décision structurante |
| OpenAPI | Généré (revue humaine ponctuelle) | Automatique |
| Manuel utilisateur | Product/Support | À chaque changement de parcours |
| Runbook | Tech Lead + astreinte | Trimestrielle + après chaque incident |
| ADR | Auteur de la décision | Ponctuelle, jamais réécrite (statut "remplacé" plutôt que suppression) |
