# ADR 0012 — Docker Compose pour l'environnement de développement local

Statut : Accepté
Date : 2026-07-13

## Contexte

Le dossier d'architecture (doc 02 §2.7, doc 15 Phase 0) mentionnait MongoDB Atlas et Redis comme "provisionnés (dev/staging/prod)" sans jamais préciser si l'environnement "dev" désignait un cluster cloud partagé entre développeurs ou un environnement local individuel. L'audit CTO pré-développement (doc 37, constat F10) a identifié cette absence comme un point à trancher avant l'Epic 0, faute de quoi le tout premier livrable du projet (socle d'infrastructure) aurait été construit sur une hypothèse implicite non documentée.

## Alternatives considérées

1. **Environnement "dev" cloud partagé unique** (un cluster MongoDB Atlas M0/M2 + une instance Redis cloud, utilisés par tous les développeurs) : coût d'infrastructure minimal, aucune configuration locale à maintenir.
2. **MongoDB + Redis conteneurisés localement via Docker Compose**, Atlas/Redis cloud réservés à `staging`/`production` (choix retenu).

## Décision

Chaque développeur exécute MongoDB et Redis **localement via Docker Compose** (`docker-compose.yml` à la racine du monorepo, doc 03 §3.1) pour le développement individuel. Les environnements `staging` et `production` restent sur MongoDB Atlas et Redis managé (Railway/Upstash), inchangé par rapport au reste du dossier d'architecture (doc 02 §2.7).

Contenu minimal du `docker-compose.yml` :
- Service `mongodb` (image officielle `mongo`, version alignée sur celle d'Atlas, volume nommé pour la persistance locale, réplicaset à un seul nœud activé pour permettre les transactions multi-documents en local, doc 05 §5.8).
- Service `redis` (image officielle `redis`, sans persistance AOF nécessaire en local).
- Le fichier `.env.example` (doc 12 §12.9) documente les variables de connexion pointant vers ces services locaux par défaut.

## Conséquences

- **Positif** : isolation totale entre développeurs (aucune donnée de test partagée, aucune migration concurrente non désirée), capacité de développement hors-ligne, onboarding accéléré (`docker-compose up` remplace la création manuelle de credentials cloud dès le premier jour), et surtout un environnement local qui **valide déjà les transactions MongoDB multi-documents** (doc 05 §5.8, doc 19 §19.1) grâce au replica set à un seul nœud — un point invisible avec un simple MongoDB `standalone`.
- **Négatif accepté** : un fichier de configuration supplémentaire à maintenir (`docker-compose.yml`), et une dépendance à Docker Desktop (ou équivalent) sur chaque poste de développement — coût jugé négligeable au regard des bénéfices, Docker étant déjà un outil standard pour une équipe de ce profil.
- **Cohérence avec le reste du dossier** : ne change rien à l'architecture de déploiement (doc 02 §2.7, ADR 0006/0007) — uniquement l'environnement de développement local, hors du chemin de production.
