# 32. Définition MVP / V1 / V1.5 / V2 / V3

## 32.1 Pourquoi (doc 19 §19.11-12)

Le doc 15 découpait le développement en phases **techniques** (séquencement d'implémentation), sans jamais répondre à la question produit : *qu'est-ce qu'on a le droit de vendre, et quand ?* Ce document comble ce manque et sert de grille de lecture pour le backlog (doc 34).

## 32.2 MVP — "Vendable à un premier restaurant pilote, sans honte"

**Objectif** : un restaurant indépendant peut faire tourner son service complet avec QuickTable, sans fonctionnalité critique manquante, même si le confort n'est pas encore au niveau des leaders (doc 33).

**Mise à jour suite au cadrage Product Owner du 2026-07-13** : plusieurs éléments initialement prévus en V2/V3 sont **remontés au MVP** — le split bill, les pourboires, l'annulation d'un plat après envoi en cuisine (tant qu'il n'est pas encore en préparation), et l'internationalisation de base (langue + devise par pays) sont désormais des exigences confirmées dès le MVP, pas des extensions futures.

**Contenu** (correspond aux Phases 0-5 du doc 15, modules doc 04) :
- Auth + RBAC + multi-tenant (socle).
- Restaurant, Employés, Salles, Tables — **avec pays obligatoire à l'inscription (saisi ou détecté par géolocalisation), langue et devise dérivées automatiquement** (doc 35).
- Interface multi-langue **FR/EN/IT/ES** dès le MVP (doc 35 §35.4) — pas seulement le français.
- Menu + Catégories + Stock simple (décrément auto + seuil d'alerte — **confirmé dans le MVP**, doc 01 §1.7 recommandation n°2).
- Commandes + Cuisine + Socket.IO temps réel, avec **fenêtre d'annulation post-envoi en cuisine tant que le plat n'est pas encore en préparation** (doc 21 §21.1 amendement).
- Paiement : **UI et flux complets** (encaissement, choix du mode, split bill égal et par article, gestion des pourboires) mais **sans intégration réelle des prestataires Stripe/Mobile Money** — le paiement carte/Mobile Money est enregistré manuellement par le caissier en MVP (confirmation de réception), l'intégration API réelle des deux prestataires est un chantier séparé qui vient après (doc 34 §34.7 amendement). Le paiement espèces fonctionne pleinement sans dépendance externe.
- QR Code basique : consultation du menu + appel serveur + demande d'addition (**sans** commande client directe — activable en V1).
- Grille tarifaire des plans (Starter/Business/Premium), période d'essai et accès par fonctionnalité **entièrement configurables depuis le dashboard Super Admin**, avec conversion automatique de devise selon le pays du restaurant (doc 35 §35.6) — confirmé comme socle MVP puisque c'est la mécanique même du modèle SaaS.

**Explicitement hors MVP** : réservations, statistiques avancées, intégration réelle des prestataires de paiement (Stripe/Mobile Money — UI prête, API à brancher en V1), avis clients, notifications riches, traduction du contenu métier (menus) au-delà de la langue saisie par le restaurant.

**Critère de sortie** : au moins un restaurant pilote fait tourner un service réel complet sur QuickTable pendant 2 semaines sans incident bloquant, y compris un service avec split bill et pourboires.

## 32.3 V1 — "Commercialisable en autonomie (self-service SaaS)"

**Objectif** : un restaurant peut s'inscrire, payer, configurer et utiliser QuickTable sans intervention manuelle de l'équipe QuickTable.

**Ajouts** (Phases 6-9 du doc 15) :
- Réservations + Clients (historique, fidélité basique).
- Commande client directe via QR Code (si activée par le restaurant).
- Statistiques (dashboard basique + avancé selon plan).
- Notifications complètes (in-app, email).
- Abonnements + Billing self-service + feature gating complet.
- Platform Admin (back-office Super Admin opérationnel).
- Avis clients modérés.
- **Intégration réelle des prestataires de paiement** (Stripe + FedaPay pour le Mobile Money béninois, décision Product Owner du 2026-07-13, doc 34 §34.7, doc adr/0011) — l'UI et le flux existent depuis le MVP (doc 32 §32.2), V1 branche les appels API réels aux prestataires.

**Critère de sortie** : un restaurant peut passer de l'inscription au premier service payé, encaissé par carte ou Mobile Money via un prestataire réel, sans qu'un humain de l'équipe QuickTable n'intervienne.

## 32.4 V1.5 — "Durcissement & confiance" (Phase 10 du doc 15 + amendements de cette revue)

**Objectif** : le produit peut être vendu à des clients plus exigeants (chaînes de 2-5 restaurants) en confiance.

**Ajouts** :
- Event-Driven Architecture complète (doc 20) et Outbox pattern en production.
- Observabilité complète (doc 25), SLO suivis (doc 29).
- Cache Redis généralisé (doc 26), recherche optimisée (doc 27).
- Audit métier/technique séparé (doc 24), conformité RGPD de base (export/anonymisation, doc 23 §23.6).
- Sécurité durcie (pentest, doc 13), 2FA élargie.
- Multi-site pour un même propriétaire (plan Premium, doc 08 §8.6).

**Critère de sortie** : SLA 99.9% tenu sur 3 mois consécutifs, pentest externe sans faille critique ouverte.

## 32.5 V2 — "Comparable aux acteurs establis sur les fonctionnalités cœur" (doc 33)

**Objectif** : combler les écarts fonctionnels identifiés dans la comparaison concurrentielle (doc 33) qui bloquent la vente face à Toast/Square/Lightspeed sur des critères non négociables pour une partie du marché.

**Ajouts (priorisés selon doc 33, mis à jour — split bill/pourboires retirés, déjà en MVP depuis le cadrage PO du 2026-07-13)** :
- Impression physique de tickets (intégration imprimante ESC/POS réseau).
- Gestion fine de la TVA multi-taux et export comptable.
- API publique + Webhooks (doc 18 §18.9) pour le plan Premium.
- Mode offline / resynchronisation pour la prise de commande en salle (doc 01 §1.3).
- Programme de fidélité structuré (paliers, récompenses).
- Promotions / coupons / happy hours.
- Ajout de langues au-delà de FR/EN/IT/ES si un nouveau marché l'exige (doc 35 §35.7).

## 32.6 V3 — "Expansion et différenciation"

**Objectif** : dépasser la simple parité fonctionnelle, exploiter les atouts structurels de QuickTable (architecture multi-tenant moderne, event-driven, doc 18 §18.9) pour se différencier.

**Ajouts** :
- Traduction du contenu métier (menus multi-langue) — au-delà de la simple traduction d'interface déjà en MVP (doc 35 §35.4).
- Marketplace d'intégrations (comptabilité, terminaux de paiement physiques).
- App mobile native serveur (au-delà du PWA responsive existant).
- Silo dédié pour comptes Enterprise (doc 06 §6.1), SLA différenciés.
- IA appliquée : prévision de la demande (aide au réapprovisionnement stock), suggestions de menu basées sur les ventes (doc 09 §9.15 statistiques comme fondation).
- Certification de conformité (SOC 2 Type II, doc 18 §18.11).

## 32.7 Tableau de synthèse

| Version | Cible | Différenciateur clé | Statut vs concurrence (doc 33) |
|---|---|---|---|
| MVP | 1 restaurant pilote | Fonctionne en conditions réelles, split bill/pourboires/i18n dès le départ | En retrait sur le paiement réel (UI seule) et le confort, déjà à parité sur split bill/pourboires/multi-langue |
| V1 | Self-service SaaS | Autonomie totale du client | En retrait sur le confort, à parité sur le cœur |
| V1.5 | Chaînes 2-5 restaurants | Confiance (SLA, sécurité, conformité) | À parité sur la fiabilité |
| V2 | Marché large | Parité fonctionnelle | À parité sur les fonctionnalités cœur |
| V3 | Différenciation | Avantages structurels (event-driven, multi-tenant natif) | Potentiellement en avance sur certains axes |

## 32.8 Ce document est un point à valider avec le Product Owner

Le séquencement V1→V3 est une proposition d'architecte, pas une décision produit finale. Suite au cadrage du 2026-07-13 (split bill, pourboires, annulation post-cuisine, multi-langue/devise remontés au MVP ; marché prioritaire = Bénin), l'ordre exact des fonctionnalités restantes de V2 (impression ticket vs mode offline vs API publique en premier) dépend désormais surtout du retour des restaurants pilotes béninois du MVP plutôt que d'une comparaison concurrentielle abstraite (voir rapport final de la revue, doc 99).
