# 2. Architecture générale

## 2.1 Vue d'ensemble

QuickTable est conçu comme un **modular monolith** multi-tenant : une seule application backend Express, structurée en modules métier fortement cohésifs et faiblement couplés, partageant une base MongoDB unique (mode "Pool" — voir doc 06), avec un frontend Vue 3 SPA consommant une API REST versionnée et un canal Socket.IO pour le temps réel.

Ce choix n'est pas un compromis temporaire : c'est la bonne architecture pour la taille d'équipe et le stade du produit. Les microservices ajoutent un coût opérationnel (déploiement, observabilité distribuée, cohérence transactionnelle) qui n'est justifié qu'à partir d'un certain volume d'équipe et de trafic. La modularité interne (doc 04) est conçue pour que les modules à forte charge (Orders, Kitchen, Notifications) puissent être extraits en services séparés **plus tard, sans réécriture**, si la scalabilité l'exige (voir doc 18).

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        WebApp["Web App (Back-office)\nVue 3 SPA — Vercel"]
        CustomerPWA["Interface Client (QR Code)\nVue 3 SPA — Vercel"]
    end

    subgraph Edge["Edge / CDN"]
        VercelCDN["Vercel Edge Network"]
    end

    subgraph Backend["Backend — Render.com (ADR 0013)"]
        LB["Load Balancer (Render.com)"]
        API1["API Instance 1\nExpress + Socket.IO"]
        API2["API Instance 2\nExpress + Socket.IO"]
        Workers["Workers\n(jobs asynchrones, cron)"]
    end

    subgraph Data["Données & Services"]
        Mongo[("MongoDB Atlas\nReplica Set")]
        Redis[("Redis\nCache / Pub-Sub / Queue")]
        Firebase[("Firebase Storage\nImages / Fichiers")]
        PaymentGW["Prestataire de paiement\n(Stripe / Mobile Money)"]
        EmailSMS["Email / SMS Provider"]
    end

    WebApp --> VercelCDN
    CustomerPWA --> VercelCDN
    VercelCDN -->|HTTPS REST /api/v1| LB
    VercelCDN -->|WSS| LB
    LB --> API1
    LB --> API2
    API1 <-->|pub/sub sessions & rooms| Redis
    API2 <-->|pub/sub sessions & rooms| Redis
    API1 --> Mongo
    API2 --> Mongo
    API1 --> Firebase
    API1 --> PaymentGW
    Workers --> Mongo
    Workers --> Redis
    Workers --> EmailSMS
    API1 -.enqueue jobs.-> Redis
    Redis -.dequeue.-> Workers
```

### Lecture du schéma

- **Deux fronts distincts déployés séparément mais issus du même monorepo** : le back-office (Admin/Manager/Serveur/Cuisine/Caisse) et l'interface client déclenchée par scan QR Code. Elles ont des besoins de sécurité, de performance et d'UX très différents (authentifié vs anonyme, riche vs minimaliste) — les séparer évite qu'une faille de sécurité sur l'espace public expose l'espace back-office, et permet des temps de chargement optimisés pour un client sur mobile avec un réseau restaurant faible.
- **Plusieurs instances API stateless** derrière un load balancer Render.com (ADR 0013), aucune session en mémoire locale — obligatoire pour scaler horizontalement et pour que Socket.IO fonctionne correctement en multi-instance (via l'adaptateur Redis, voir doc 10).
- **Redis** apparaît dès la Phase 1 comme brique centrale, pas comme optimisation tardive : il sert à la fois d'adaptateur Socket.IO, de cache (sessions, rate limiting, statistiques), et de broker de queue (BullMQ) pour les jobs asynchrones (emails, génération de reçus PDF, agrégations de stats, alertes de stock).
- **Workers séparés du processus API** : les tâches longues (envoi d'email, génération de rapport, recalcul de statistiques) ne doivent jamais bloquer le event-loop Node qui sert les requêtes API/Socket.IO en rush de service.

## 2.2 Architecture Frontend (vue macro)

```mermaid
flowchart LR
    subgraph VueApp["Application Vue 3"]
        Router["Vue Router\n(guards RBAC + tenant)"]
        Pages["Pages / Views"]
        Components["Components\n(UI + métier)"]
        Stores["Pinia Stores\n(état par module)"]
        Composables["Composables\n(logique réutilisable)"]
        Services["Services API\n(Axios + intercepteurs)"]
        SocketClient["Socket.IO Client"]
    end

    Router --> Pages
    Pages --> Components
    Pages --> Stores
    Components --> Composables
    Stores --> Services
    Composables --> Services
    Services -->|REST /api/v1| BackendAPI[("Backend API")]
    SocketClient <-->|WSS events| BackendAPI
    Stores <--> SocketClient
```

Le détail complet (conventions, structure de dossiers, patterns) est dans le doc 11. Le principe directeur : **les composants ne parlent jamais directement à Axios ou Socket.IO** — tout passe par la couche `services/` et les `stores/`, ce qui rend les composants testables et l'API remplaçable.

## 2.3 Architecture Backend (vue macro)

```mermaid
flowchart TB
    subgraph HTTP["Entrée HTTP/WS"]
        Routes["Routes (par module)"]
        SocketGateway["Socket.IO Gateway"]
    end

    subgraph Middlewares["Middlewares transverses"]
        MW1["Auth (JWT)"]
        MW2["Tenant Resolver"]
        MW3["RBAC / Permissions"]
        MW4["Validation (Zod DTO)"]
        MW5["Rate Limiting"]
        MW6["Audit Logger"]
    end

    subgraph AppLayer["Couche Application"]
        Controllers["Controllers"]
        Services["Services (logique métier)"]
    end

    subgraph DataLayer["Couche Données"]
        Repositories["Repositories"]
        Models["Mongoose Models / Schemas"]
    end

    Routes --> MW1 --> MW2 --> MW3 --> MW4 --> MW5 --> Controllers
    Controllers --> Services
    Services --> Repositories
    Repositories --> Models
    Models --> Mongo[("MongoDB")]
    Services -.audit.-> MW6
    Controllers --> SocketGateway
    SocketGateway --> MW1
    Services -.jobs.-> Queue[("Redis Queue")]
```

### Principe des couches

- **Routes** : déclarent uniquement le mapping HTTP → controller + chaîne de middlewares. Aucune logique.
- **Middlewares transverses** : authentification, résolution du tenant courant, vérification des permissions, validation du DTO entrant, rate limiting, journalisation d'audit. Appliqués de façon déclarative et testés indépendamment.
- **Controllers** : traduisent la requête HTTP en appel de service, et le résultat du service en réponse HTTP normalisée. Aucune logique métier, aucun accès direct à la base.
- **Services** : contiennent toute la logique métier (règles, orchestration, calculs, machine à état des commandes). Ce sont les services qui appliquent les règles multi-tenant, publient les événements Socket.IO et enfilent les jobs asynchrones.
- **Repositories** : seule couche qui connaît Mongoose/MongoDB. Isole totalement la base de données du reste de l'application — permettrait de changer de moteur de persistance sans toucher aux services (principe de Clean Architecture, appliqué pragmatiquement, pas dogmatiquement).
- **Models** : schémas Mongoose (validation de structure, index, hooks).

Le détail complet est dans le doc 12.

## 2.4 Architecture Base de données

Voir le doc 05 pour le détail complet (collections, champs, index, ERD). Principe général : **MongoDB en mode multi-tenant "Pool"** — toutes les collections tenant-scoped portent un champ `tenantId` indexé en tête de tous les index composés, et aucune requête métier ne s'exécute jamais sans un filtre `tenantId` explicite (garanti par middleware, voir doc 06).

## 2.5 Architecture Temps réel

```mermaid
flowchart TB
    subgraph Emitters["Émetteurs d'événements"]
        WaiterUI["Interface Serveur"]
        KitchenUI["Interface Cuisine"]
        CashierUI["Interface Caisse"]
        CustomerUI["Interface Client (QR)"]
    end

    subgraph SocketLayer["Couche Socket.IO"]
        Gateway["Socket.IO Gateway\n(auth JWT au handshake)"]
        RedisAdapter["@socket.io/redis-adapter"]
    end

    subgraph Rooms["Rooms par tenant"]
        RoomTenant["room: tenant:{tenantId}"]
        RoomKitchen["room: tenant:{tenantId}:kitchen"]
        RoomTable["room: tenant:{tenantId}:table:{tableId}"]
    end

    WaiterUI <--> Gateway
    KitchenUI <--> Gateway
    CashierUI <--> Gateway
    CustomerUI <--> Gateway
    Gateway <--> RedisAdapter
    Gateway --> RoomTenant
    Gateway --> RoomKitchen
    Gateway --> RoomTable
    RedisAdapter <--> Redis[("Redis Pub/Sub")]
```

Chaque tenant possède ses propres "rooms" Socket.IO, garantissant qu'un événement (nouvelle commande, statut cuisine) n'est jamais diffusé à un autre restaurant. Détail complet dans le doc 10.

## 2.6 Architecture SaaS Multi-Tenant

```mermaid
flowchart TB
    subgraph Tenants["Tenants (Restaurants)"]
        T1["Restaurant A\ntenantId: A"]
        T2["Restaurant B\ntenantId: B"]
        T3["Restaurant C (Enterprise)\ntenantId: C"]
    end

    subgraph SharedApp["Application partagée (Pool)"]
        API["API unique"]
        SharedDB[("MongoDB Atlas\nCluster partagé")]
    end

    subgraph SiloOption["Option Silo (grands comptes)"]
        DedicatedDB[("Cluster MongoDB dédié")]
    end

    T1 -->|tenantId: A| API
    T2 -->|tenantId: B| API
    T3 -->|tenantId: C| API
    API -->|filtre tenantId A, B| SharedDB
    API -.route selon config tenant.-> DedicatedDB
```

QuickTable démarre en mode **Pool** (base partagée, isolation logique) pour tous les tenants, mais l'architecture prévoit dès le départ un **routage par configuration de tenant** (`tenant.dataResidency` / `tenant.clusterId`) qui permettrait de basculer un compte Enterprise vers un cluster MongoDB Atlas dédié sans changer le code applicatif — seulement la résolution de connexion. Détail complet dans le doc 06.

## 2.7 Vue de déploiement

```mermaid
flowchart LR
    Dev["Dépôt Git (monorepo)"] -->|CI/CD| GH["GitHub Actions"]
    GH -->|build & test| GH
    GH -->|deploy frontend| Vercel["Vercel\n(Preview + Production)"]
    GH -->|deploy backend| Render["Render.com\n(Staging + Production, ADR 0013)"]
    GH -->|migrations| Atlas["MongoDB Atlas"]
    Vercel -->|env: VITE_API_URL| Render
    Render --> Atlas
    Render --> RedisCloud["Redis (Upstash)"]
    Render --> FirebaseStorage["Firebase Storage"]
```

- **Monorepo** recommandé (voir doc 03) avec deux packages déployés indépendamment (`apps/web`, `apps/api`), plus un package partagé de types TypeScript (`packages/shared-types`) généré/maintenu pour garantir la cohérence des contrats API entre front et back.
- **Environnements** : `local` → `preview` (par PR, automatique sur Vercel/Render.com) → `staging` → `production`. Aucune modification manuelle en production ; tout passe par la CI.
- **Migrations de base de données** versionnées et exécutées en étape de déploiement dédiée (voir doc 12, `scripts/migrations`), jamais au boot de l'application.
