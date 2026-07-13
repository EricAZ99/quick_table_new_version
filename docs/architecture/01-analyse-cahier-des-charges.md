# 1. Analyse complète du cahier des charges

## 1.1 Résumé de ce qui est demandé

Le cahier des charges décrit une plateforme SaaS de gestion de restaurants : établissements, salles, tables, menus, commandes, cuisine, paiement, stock, clients, réservations, statistiques, QR Code, multi-utilisateurs à rôles, multi-abonnements. La stack technique est déjà imposée (Vue 3 / Node / Express / MongoDB / Firebase Storage / Socket.IO / Vercel / Railway / Atlas).

C'est un document **produit** de bonne qualité pour un MVP, rédigé dans un style fonctionnel (liste de features), mais **ce n'est pas un cahier des charges technique**. Il ne contient ni règles métier précises, ni contraintes non-fonctionnelles chiffrées, ni modèle de données, ni spécification des flux d'erreur. C'est normal à ce stade — c'est le rôle de ce dossier d'architecture de combler ces manques.

## 1.2 Forces

- **Périmètre fonctionnel cohérent et réaliste** pour un POS/restaurant SaaS : le découpage en modules proposé (Auth, Restaurant, Employés, Salles, Tables, Menus, Stock, Commandes, Cuisine, Paiement, Réservations, Clients, QR Code, Statistiques) correspond exactement au découpage qu'on retrouve chez les leaders du marché (Toast, Square, Lightspeed).
- **Vision SaaS multi-tenant explicitement énoncée** dès la présentation, avec une hiérarchie de rôles (Super Admin → Admin Restaurant → Manager → Serveur → Cuisinier → Caissier → Client) qui est directement exploitable pour construire un RBAC.
- **Flux métier illustrés** (statut de commande Serveur → Cuisine → Prêt → Servi → Payé ; statut plat En attente → En préparation → Prêt → Servi) : cela donne une base claire pour modéliser des machines à état.
- **Choix technologique cohérent et moderne** : Vue 3 + Composition API + TS côté front, Node/Express/TS côté back, MongoDB comme base documentaire adaptée à un modèle multi-tenant flexible, Socket.IO pour le temps réel cuisine/commande — un stack standard, bien outillé, avec une grande disponibilité de talents.
- **Modèle d'abonnement (Starter/Business/Premium) déjà pensé** avec des limites par palier (nombre d'employés, nombre de tables, statistiques avancées, multi-sites, API) — ce qui anticipe correctement un besoin de feature-gating.
- **Sécurité mentionnée en amont** (JWT, refresh token, hash, HTTPS, permissions, journalisation) montre une sensibilisation correcte, même si non détaillée.
- **La note finale du client est une excellente contrainte de cadrage** : "prévoir dès le départ une architecture multi-tenant" et exigence UI "jolie, moderne, intuitive, soft, épurée, maniable, dynamique et professionnelle" — cela confirme l'ambition produit (comparable à Toast/Square) et légitime d'investir dans l'architecture avant le code.

## 1.3 Faiblesses

- **Absence de règles métier précises.** Exemples : Que se passe-t-il si deux serveurs modifient la même commande en même temps ? Une table peut-elle avoir plusieurs commandes ouvertes simultanément (addition séparée) ? Un article peut-il être annulé après envoi en cuisine ? Ces règles ne sont pas données — elles devront être arbitrées (voir §1.6 Recommandations).
- **Aucune volumétrie ni exigence de performance chiffrée** (nombre de restaurants visés à 1 an/3 ans, nombre de commandes/jour, pic de charge un samedi soir, latence attendue sur l'affichage cuisine). Sans ces chiffres, tout dimensionnement est une hypothèse.
- **Le module Paiement est sous-spécifié** pour un produit commercial : pas de mention de prestataire de paiement (Stripe, PayPal, agrégateur Mobile Money local), pas de gestion de la TVA/taxes, pas de gestion des pourboires, pas de split bill (addition partagée entre convives), qui est pourtant une fonctionnalité standard chez les concurrents.
- **Le module Stock est marqué "à venir"** mais est indispensable dès le MVP pour la crédibilité produit face à la concurrence (rupture de stock = commande impossible). Son absence de la Phase 1 est un risque produit, pas seulement technique.
- **Aucune spécification d'internationalisation** (devise, langue, fuseau horaire) alors que "plusieurs restaurants sur une même plateforme" en SaaS laisse présager une extension multi-pays à moyen terme (mentionné implicitement par "Mobile Money", pratique très répandue en Afrique de l'Ouest).
- **Le module Réservations ne précise pas la gestion des conflits** (double réservation sur une même table, no-show, liste d'attente), fonctionnalités qui existent chez tous les concurrents matures.
- **Aucune mention d'API publique / Webhooks** avant le plan Premium ("API") — mais rien sur ce que cette API expose, ni sur l'architecture d'intégration tierce (imprimantes de tickets, terminaux de paiement physiques, logiciels de comptabilité).
- **Pas de stratégie offline précisée.** Un POS restaurant doit fonctionner (au moins en mode dégradé) en cas de coupure réseau côté établissement — non mentionné, alors que c'est un standard du secteur (Toast et Square ont un mode offline).
- **Pas d'exigence d'accessibilité (a11y)** ni de contrainte RGPD/protection des données clients (pourtant le module Clients stocke un historique et un programme de fidélité).

## 1.4 Fonctionnalités manquantes (par rapport aux standards du marché)

Ces éléments ne sont pas dans le cahier des charges mais seront attendus par tout client qui compare QuickTable à Toast/Square/Lightspeed. Elles doivent être budgétées dans la roadmap (voir doc 15), même si elles ne sont pas dans le MVP :

1. **Impression physique de tickets cuisine/reçus** (intégration imprimante réseau/Bluetooth ESC/POS) — actuellement uniquement "imprimer une facture" côté caissier, rien côté cuisine.
2. **Split bill / addition séparée par convive ou par article.**
3. **Gestion des pourboires (tips)**, obligatoire dans plusieurs marchés.
4. **Gestion de la taxation (TVA multi-taux, taxes locales)**, essentielle pour la facturation légale.
5. **Programme de fidélité structuré** (points, paliers) — mentionné une fois ("fidélité") sans détail.
6. **Gestion des promotions/coupons/happy hours.**
7. **Mode offline / resynchronisation** pour la prise de commande en salle.
8. **Multi-langue / multi-devise** pour l'expansion géographique.
9. **Intégration comptable** (export FEC, Sage, QuickBooks) — mentionnée indirectement via "Premium : API".
10. **Gestion des allergènes / régimes alimentaires** sur les produits du menu (obligation légale dans plusieurs pays).
11. **App mobile native pour serveurs** (le CDC ne mentionne que "web... optimisée mobile", ce qui est acceptable pour le MVP mais à anticiper en V2 en PWA).
12. **Système d'avis clients modéré** (mentionné "laisser un avis" côté client, mais pas de modération côté restaurant).
13. **Webhooks sortants** pour que les clients Premium intègrent leurs propres outils.
14. **Facturation SaaS elle-même** (Billing du restaurant envers QuickTable) — le CDC parle de "gérer les abonnements" côté Super Admin mais pas du cycle de facturation/paiement récurrent/dunning.

## 1.5 Risques

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Fuite de données entre tenants (bug d'isolation) | Critique — perte de confiance totale, faute grave en SaaS B2B | Moyenne si non traité dès la conception | Middleware d'isolation systématique + tests automatisés d'isolation (voir doc 06) |
| Sous-estimation de la complexité temps réel (Cuisine/Commande) en cas de forte charge simultanée (rush du service) | Élevé — c'est le cœur de l'expérience produit | Moyenne | Socket.IO + Redis adapter dès le départ, tests de charge dédiés au rush du samedi soir |
| Incohérence de stock (vente concurrente du dernier article) | Moyen — expérience client dégradée | Élevée si non traité | Opérations atomiques MongoDB (`findOneAndUpdate` avec conditions), verrouillage optimiste |
| Dérive de scope ("Stock à venir" qui grossit en cours de route) | Moyen — retard planning | Élevée | Phasage strict (doc 15), gel de scope par phase |
| Dépendance à un seul développeur/petite équipe pour un produit ambitieux (comparable à Toast) | Élevé sur la durée | À évaluer avec le client | Documentation exhaustive (ce dossier), conventions strictes (doc 14) pour permettre l'onboarding rapide de renforts |
| Paiement : absence de tokenisation → exposition à la fraude / non-conformité PCI-DSS | Critique légalement | Faible si le doc 13 est respecté | Ne jamais stocker de données de carte ; passer par prestataire certifié PCI (Stripe, etc.) |
| Choix MongoDB pour des données fortement relationnelles (facturation, comptabilité) | Moyen — complexité de requêtes agrégées | Moyenne | Modélisation soignée (doc 05), dénormalisation contrôlée, agrégations précalculées |
| Montée en charge non anticipée si succès commercial rapide | Élevé sur la trajectoire produit | Faible à court terme, élevée à 2-3 ans | Architecture modulaire + patterns de scalabilité prévus dès le jour 1 (doc 18) |

## 1.6 Complexités techniques identifiées

1. **Isolation multi-tenant fiable et performante** sur une base partagée — la complexité n°1 du projet, transverse à tout le backend (doc 06).
2. **Synchronisation temps réel cohérente** entre Serveur, Cuisine, Caisse et Dashboard, avec gestion de la reconnexion réseau (le service ne doit jamais "perdre" une commande).
3. **Concurrence sur les ressources partagées** : une table, un article de stock, une réservation de créneau — nécessite des stratégies de verrouillage/atomicité.
4. **RBAC à deux niveaux** : rôle global (plateforme) + rôle par tenant + permissions fines (ex. "caissier autorisé à encaisser") — pas un simple `role: string`.
5. **Feature gating par abonnement** couplé au RBAC (un Manager d'un restaurant Starter n'a pas accès aux "statistiques avancées" même s'il a le rôle Manager).
6. **Gestion du cycle de vie d'une commande comme une machine à état** avec plusieurs acteurs qui la modifient à des étapes différentes, sans conflit ni perte de données.
7. **Modélisation MongoDB d'un domaine avec beaucoup de relations** (Restaurant → Salles → Tables → Commandes → Produits → Stock → Paiement) tout en conservant les performances d'une base documentaire (choix entre embedding et référencement, voir doc 05).
8. **QR Code = surface publique non authentifiée** exposée à des utilisateurs anonymes (clients) — nécessite un modèle de sécurité et de rate-limiting spécifique, distinct de l'espace back-office.

## 1.7 Recommandations

1. **Formaliser les règles métier manquantes avec le client avant la Phase 3** (voir doc 15) via un atelier de cadrage dédié : split bill, annulation d'article envoyé en cuisine, gestion de la TVA, pourboires. Ne pas les deviner silencieusement dans le code.
2. **Sortir le module Stock du "à venir" et le mettre dans le MVP** a minima en version simple (décrément automatique + seuil d'alerte), car son absence casse la crédibilité produit dès la démo commerciale.
3. **Introduire un prestataire de paiement tiers dès la Phase 1** de conception (Stripe ou équivalent local Mobile Money) pour ne jamais toucher de données de carte brutes.
4. **Ajouter une notion de Billing SaaS interne** (abonnement du restaurant envers QuickTable, avec statut actif/suspendu/impayé) distincte du module Paiement (qui concerne les clients du restaurant) — cf. doc 04 module `Subscriptions/Billing`.
5. **Prévoir l'internationalisation (devise, fuseau horaire, langue) dans le schéma de données dès le départ**, même si un seul marché est visé à court terme — le coût de l'ajouter après coup sur un système multi-tenant est très élevé (migration de toutes les données existantes).
6. **Traiter la conception comme si le produit devait scaler à 5000 restaurants**, conformément à la demande explicite de l'utilisateur — voir doc 18 pour la feuille de route de scalabilité.
7. **Prioriser l'audit trail et l'observabilité dès la Phase 1**, pas en fin de projet — indispensable pour le support client B2B et le debugging en production.
8. **Valider avec le client un MVP réduit et un plan produit** distinguant clairement "MVP commercialisable" vs "V2 comparable aux leaders du marché", pour cadrer les attentes issues de la comparaison à Toast/Square/Lightspeed.
