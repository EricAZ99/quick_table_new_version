# 26. Stratégie Cache Redis

## 26.1 Constat de la revue (doc 19 §19.11-6)

Redis était mentionné dans 6 documents différents (doc 02, 06, 07, 10, 12, 18) sans jamais centraliser une convention de nommage de clés ni une politique de TTL homogène — risque réel qu'une équipe crée `session:{id}` pendant qu'une autre crée `sessions:{userId}` pour des besoins voisins. Ce document est la **source de vérité unique** de tout usage Redis.

## 26.2 Convention de nommage des clés

Format : `{domaine}:{sous-clé}[:{qualifieur}]`, toujours préfixé par domaine fonctionnel, jamais de clé "nue".

| Domaine | Clé | TTL | Contenu |
|---|---|---|---|
| Auth | `auth:permissionsVersion:{userId}` | Pas de TTL (mis à jour à chaque changement) | Compteur, doc 07 §7.2 |
| Auth | `auth:revoked:{jti}` | = durée de vie résiduelle du token (≤15 min) | Liste de révocation d'urgence (doc 19 §19.6, amendement) |
| Auth | `auth:rateLimit:login:{email}:{ip}` | 15 min (fenêtre glissante) | Compteur de tentatives (doc 13 §13.2) |
| Idempotence | `idempotency:{tenantId}:{key}` | 24h | Résultat mis en cache d'une opération financière (doc 09 §9.1) |
| RBAC | `rbac:resolved:{membershipId}` | 10 min ou invalidé sur `EmployeeRoleChanged` (doc 20) | Permissions résolues pour éviter un recalcul à chaque requête |
| Menu public | `menu:public:{tenantId}` | 5 min ou invalidé sur `MenuItemAvailabilityChanged`/`menuItem` mutation | Réponse complète de `GET /public/qr/:token/menu` (doc 09 §9.20) |
| QR Code | `qrcode:token:{token}` → `tableId, tenantId` | Invalidé sur régénération (`POST /tables/:id/qrcode/regenerate`) | Résolution rapide sans requête Mongo à chaque scan |
| Dashboard | `stats:dashboard:{tenantId}:{date}` | 60s (rafraîchi par le worker à chaque `PaymentCompleted`, doc 20) | Snapshot du dashboard temps réel (doc 09 §9.15) |
| Statistiques | `stats:daily:{tenantId}:{date}` | 24h | Miroir cache de `dailyStatistics` (doc 05) pour lecture ultra-rapide |
| Rate limiting global | `ratelimit:{scope}:{key}` | Selon la fenêtre (doc 13 §13.2) | Compteurs `express-rate-limit` (store Redis) |
| Socket.IO | (géré en interne par `@socket.io/redis-adapter`) | — | Pub/Sub, pas de convention applicative directe |
| Recherche | `search:autocomplete:{tenantId}:{scope}:{query_hash}` | 5 min | Résultats d'autocomplétion fréquents (doc 27) |
| Session (refresh) | *(volontairement absent de Redis)* | — | Les refresh tokens restent en MongoDB (doc 05, TTL index natif) — pas dupliqués en Redis, une seule source de vérité pour éviter une désynchronisation |

## 26.3 Politique d'invalidation

Deux mécanismes, jamais mélangés pour une même clé :
1. **TTL naturel** (péremption automatique) pour tout ce qui tolère une fraîcheur relative (statistiques, autocomplete, menu public).
2. **Invalidation événementielle explicite** (abonnement à l'Event Bus, doc 20) pour tout ce qui doit refléter un changement immédiatement perceptible par l'utilisateur (permissions après changement de rôle, menu après désactivation d'un plat, QR Code après régénération). Chaque handler d'invalidation est déclaré à côté du service concerné (`menus.service.ts` s'abonne à ses propres mutations pour invalider `menu:public:{tenantId}`), jamais un job générique qui "vide tout le cache" (trop coûteux à grande échelle, doc 18).

## 26.4 Sessions

Précision importante : QuickTable est **stateless côté Access Token** (doc 07, doc 19 §19.6) — Redis n'est donc pas un magasin de session au sens classique. Son rôle se limite à :
- La liste de révocation d'urgence à courte durée de vie (§26.2, amendement doc 19 §19.6).
- Le cache de permissions résolues (`rbac:resolved:*`) pour éviter une jointure `memberships` + `roleDefinitions` (doc 22 §22.4) à chaque requête.

## 26.5 Cache HTTP (CDN) vs Cache applicatif (Redis)

| Niveau | Portée | Exemple |
|---|---|---|
| CDN (Vercel Edge, doc 02 §2.7) | Assets statiques du frontend, images Firebase via `Cache-Control` long | Photos de plats, logo |
| Redis applicatif | Données dynamiques mais réutilisables entre requêtes | Menu public, dashboard, permissions |
| Aucun cache | Données transactionnelles à cohérence forte requise | `orders` en cours, `payments`, disponibilité de table en temps réel |

Règle du comité (doc 19) : **ne jamais mettre en cache une donnée qui conditionne une décision d'écriture** (ex. le stock disponible au moment de l'envoi en cuisine n'est jamais lu depuis un cache — toujours une lecture directe MongoDB, cohérent avec doc 20 §20.5 sur les couplages synchrones).

## 26.6 Dimensionnement et haute disponibilité

- Instance Redis managée (Railway Redis ou Upstash) avec persistance activée (AOF) pour ne pas perdre les compteurs de rate limiting/idempotence lors d'un redémarrage — mais Redis reste un **cache et un bus pub/sub**, jamais une source de vérité métier (aucune donnée dans Redis n'est irremplaçable ; en cas de perte totale, le pire cas est un recalcul/recache, jamais une perte de donnée métier).
- À partir du palier "5 000 restaurants" (doc 18 §18.2), séparation de l'instance Redis en deux : une pour le pub/sub Socket.IO (latence critique), une pour le cache applicatif/rate limiting (tolère plus de latence) — évite qu'un pic de cache invalidation ne dégrade la diffusion temps réel.

## 26.7 Anti-pattern explicitement rejeté par le comité

Mettre en cache la résolution `tenantId` du JWT ou tout élément du chemin de sécurité multi-tenant (doc 06) est **interdit** : le Tenant Resolver doit toujours retraiter le JWT signé à chaque requête. Cacher cette résolution introduirait une fenêtre où une révocation de tenant (`suspended`) ne serait pas immédiatement respectée — inacceptable pour une garantie de sécurité (doc 06 §6.2).
