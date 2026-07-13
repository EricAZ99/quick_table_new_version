# 29. Performance & Objectifs de service (SLO)

## 29.1 Pourquoi (doc 19 §19.11-9)

Le cahier des charges original ne fixait aucun chiffre (doc 01 §1.3, faiblesse identifiée dès la première analyse), et aucun document ultérieur ne l'avait comblé. Un SLO non chiffré ne peut pas être testé (doc 14 §14.6 "test de charge") ni alerté (doc 25 §25.7) — ce document fournit les cibles par défaut, à confirmer/ajuster avec le Product Owner selon les retours des premiers clients pilotes (doc 15).

## 29.2 Temps de réponse API (P50 / P95 / P99)

| Endpoint / catégorie | P50 | P95 | P99 | Justification |
|---|---|---|---|---|
| `POST /auth/login` | 150ms | 400ms | 800ms | Argon2id volontairement coûteux (doc 07 §7.8) — borne haute acceptée |
| `GET /orders`, `GET /tables`, listes courantes | 80ms | 250ms | 500ms | Lecture indexée simple |
| `POST /orders`, `POST /orders/:id/items` | 100ms | 300ms | 600ms | Écriture simple, pas de calcul lourd |
| `POST /orders/:id/send-to-kitchen` | 150ms | 400ms | 800ms | Inclut vérification stock synchrone (doc 20 §20.5) |
| `POST /payments` | 300ms | 1000ms | 2000ms | Dépend de la latence du prestataire externe (hors contrôle direct) |
| `GET /public/qr/:token/menu` | 50ms | 150ms | 300ms | Doit être quasi-instantané (première impression client, doc 11 §11.4), fortement caché (doc 26) |
| `GET /statistics/*` | 200ms | 600ms | 1200ms | Lecture de projections précalculées (doc 05 `dailyStatistics`), jamais d'agrégation à la volée sur gros volume |

**Définition d'engagement** : ces cibles s'entendent **hors latence réseau client** (mesurées côté serveur, `http_request_duration_seconds`, doc 25 §25.3) et **par instance non saturée** — le comportement en cas de charge extrême est couvert par les tests de charge (doc 31 §31.4), pas par ce tableau.

## 29.3 Temps de chargement frontend

| Métrique (Core Web Vitals) | Cible | Écran concerné |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.0s (réseau 4G simulé) | Interface client QR Code (doc 11 §11.4) — priorité maximale, premier contact d'un client potentiellement sur Wi-Fi restaurant faible |
| LCP | < 2.5s | Back-office (dashboard, prise de commande) |
| TTI (Time To Interactive) | < 3.5s | Kitchen Display System — doit rester utilisable même sur tablette d'entrée de gamme |
| Bundle JS initial (gzip) | < 150 Ko | Interface client QR Code (doc 11 §11.4, code-splitting) |
| Bundle JS initial (gzip) | < 350 Ko | Back-office |

Suivi en continu via Lighthouse CI (doc 11 §11.8), échec de CI si régression > 10% sur une métrique sans justification documentée dans la PR.

## 29.4 Temps réel (Socket.IO)

| Métrique | Cible | Contexte |
|---|---|---|
| Latence de diffusion d'un événement (émission serveur → réception client) | < 300ms P95 | Doc 10, tous événements confondus |
| Latence perçue "commande envoyée en cuisine → ticket affiché" | < 500ms P95 | Flux critique produit (doc 10 §10.1) |
| Temps de reconnexion après coupure réseau courte (< 5s) | < 2s | Reconnexion Socket.IO native |
| Taux d'événements perdus (mesuré par le mécanisme de resynchronisation, doc 10 §10.7) | 0% (garanti par "REST fait foi", pas par la fiabilité du transport) | — |

## 29.5 MongoDB

| Métrique | Cible | Action si dépassée |
|---|---|---|
| Durée de requête P95 (lecture indexée simple) | < 20ms | Vérifier plan d'exécution (`explain()`), index manquant |
| Durée de requête P95 (agrégation `dailyStatistics`) | < 500ms (exécutée en worker, pas dans le chemin de requête HTTP, doc 12 §12.5) | Optimiser le pipeline d'agrégation, envisager une projection intermédiaire |
| Taux d'utilisation du pool de connexions | < 70% en soutenu | Augmenter le pool ou le nombre d'instances (doc 18 §18.5) |
| Ratio index/working set en RAM (Atlas) | Working set doit tenir en RAM du tier Atlas | Upgrade de tier ou sharding (doc 18 §18.5) |

## 29.6 Disponibilité (SLA cible par plan, doc 08 §8.6)

| Plan | Disponibilité cible | Fenêtre de maintenance |
|---|---|---|
| Starter | 99.5% (best effort) | Annoncée 48h à l'avance |
| Business | 99.9% | Annoncée 48h à l'avance, hors heures de service (22h-6h locales du tenant, doc 05 `timezone`) |
| Premium | 99.9% + support prioritaire (doc 04) | Idem, fenêtre négociable |

99.9% mensuel = ≈ 43 minutes d'indisponibilité tolérée/mois — objectif réaliste pour l'infrastructure Railway/Atlas/Vercel sans sur-ingénierie de redondance multi-région dès le MVP (doc 18 §18.2).

## 29.7 Budget de performance par palier de charge (lien avec doc 18)

| Palier (doc 18 §18.2) | Débit cible à supporter | Composant sous tension en premier |
|---|---|---|
| 100 tenants | ~50 req/s soutenu, ~500 req/s en pic rush | Instance API unique suffisante |
| 1 000 tenants | ~300 req/s soutenu, ~3000 req/s en pic | MongoDB (read replicas), Redis cache généralisé |
| 10 000 tenants | ~2000 req/s soutenu | Sharding MongoDB, plusieurs instances API + Socket.IO |
| 50 000+ tenants | Charge multi-région | Architecture multi-région (doc 18 §18.9) |

## 29.8 Revue

Ce tableau est un point de départ, pas une garantie contractuelle figée — il doit être **révisé après les premiers tests de charge réels** (doc 15 Phase 10) et après les premiers mois de production avec de vrais tenants (données réelles de rush de service). Toute révision est documentée en ADR (doc 17 §17.3, dossier `adr/`).
