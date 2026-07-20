# QuickTable — Checklist de développement complète

**Source** : extrait et reformaté à partir du backlog détaillé (`docs/architecture/34-backlog-epics-features.md`), dans l'ordre d'exécution du projet — Epic 0 (Infrastructure) → Epic 12 (Différenciation V3).

**Lecture du fichier** : chaque **Feature** est un **lot livrable** — un incrément démontrable et testable indépendamment, résumé en une ligne 🎯 _Livrable_. Elle se décompose en tâches ≤ 1 jour-développeur (☐), chacune assignable à une seule personne. Une Feature est "faite" quand toutes ses tâches sont cochées **et** que le livrable décrit peut être démontré tel quel (démo, revue de sprint). Pour le contexte complet (User Stories, critères d'acceptation, docs d'architecture associés), voir le doc 34.

**Repères de charge** (somme indicative des estimations, à ajuster selon l'équipe réelle) :

| Palier            | Epics | Charge indicative                                    |
| ----------------- | ----- | ---------------------------------------------------- |
| MVP               | 0 à 5 | ≈ 84 jours-développeur                               |
| V1                | 6 à 9 | ≈ 56,5 jours-développeur                             |
| V1.5              | 10    | ≈ 16 jours-développeur (+ pentest, hors granularité) |
| V2 _(provisoire)_ | 11    | ≈ 21,5 jours-développeur                             |
| V3 _(provisoire)_ | 12    | non chiffré — dépend des retours V2                  |

---

## Epic 0 — Infrastructure & Fondations `MVP`

### Feature 0.1 — Monorepo & CI/CD

🎯 **Livrable** : chaque push est linté, testé, buildé, puis déployé automatiquement en preview (web) et staging (API).

- [x] Initialiser le monorepo (workspaces `apps/`, `packages/`) — 0,5j
- [x] Configurer ESLint + Prettier + config partagée `packages/config` — 0,5j
- [x] Configurer Husky (pre-commit, commit-msg, pre-push) + lint-staged — 0,5j
- [x] Configurer Commitlint (Conventional Commits) — 0,25j
- [x] Écrire le pipeline CI GitHub Actions (lint + test + build) — 1j
- [x] Configurer déploiement auto Vercel (`apps/web`, preview + prod) — 0,5j
- [x] Configurer déploiement auto Railway (`apps/api`, staging + prod) — 0,5j — provisionné directement depuis le dashboard Railway (service `@quicktable/api`, projet `beautiful-beauty`, auto-deploy sur push GitHub `main`) plutôt que documenté au fil de l'eau, d'où ce rattrapage tardif de la case ; un seul environnement `production` partagé staging/prod (même logique budget-serré qu'Atlas/Upstash, doc lignes 38-39) ; vérifié réellement en HTTPS sur `quicktableapi.up.railway.app` : `/health/live` et `/health/ready` (Mongo + Redis connectés) et `/api/v1/restaurants/detect-location` répondent 200

### Feature 0.2 — Infrastructure de données

🎯 **Livrable** : les briques d'infrastructure (base de données, cache, stockage fichiers) sont provisionnées et accessibles depuis le code applicatif.

- [ ] Écrire `docker-compose.yml` (MongoDB replica set + Redis locaux, ADR 0012) — 0,5j — **écrit, non vérifié par exécution** (Docker Desktop non installable sur la machine de développement actuelle : Windows 10 build 19044, exige 22H2/19045+ depuis Docker Desktop 4.50 ; mise à jour Windows bloquée par une stratégie d'entreprise). N'a finalement pas bloqué `config/database.ts` : `.env` local pointe directement sur MongoDB Atlas (déjà vérifié), pas sur le Mongo dockerisé — à revérifier quand même avant qu'un développeur bascule réellement sur `docker compose up`.
- [x] Provisionner MongoDB Atlas (staging/prod) — 0,5j — un seul cluster M0 gratuit, deux bases distinctes (`quicktable` / `quicktable-staging`) plutôt que deux clusters, décision budget-serré cohérente avec Railway (un seul environnement) ; connexion vérifiée réellement sur les deux bases (ping OK, MongoDB 8.0.27)
- [x] Provisionner Redis managé (staging/prod) — 0,25j — Upstash (ADR 0009), instance gratuite unique partagée staging/prod pour l'instant (même logique que Railway/Atlas) ; connexion vérifiée réellement (PING/PONG, SET/GET) via le protocole Redis standard TLS, pas seulement l'API REST
- [ ] Configurer Firebase Storage + règles d'accès — 0,5j — **bloqué** : Google exige le plan Blaze (carte bancaire) pour activer Cloud Storage, même en usage gratuit ; pas de carte disponible actuellement. `storage.rules` écrit et prêt (deny-all, ADR 0005/doc 04 : accès exclusivement via le SDK Admin backend + URLs signées), non déployé. Pas d'alternative légitime (Firebase imposé par le cahier des charges, contrairement à Railway) — à débloquer dès qu'une carte est disponible, avant le module `uploads` (Epic 3).
- [x] Implémenter `config/env.ts` avec validation Zod fail-fast — 0,5j
- [x] Implémenter `config/database.ts` (connexion Mongoose, pool) — 0,5j

### Feature 0.3 — Socle applicatif

🎯 **Livrable** : un module de référence traverse toutes les couches (repository, erreurs typées, logs, health checks) — le patron à répliquer pour tous les modules métier suivants.

- [x] Implémenter le logger structuré (pino) + middleware `correlationId` — 0,5j
- [x] Implémenter `error-handler.middleware.ts` + classes d'erreurs typées — 1j
- [x] Implémenter `BaseRepository` générique avec `tenantId` obligatoire — 1j
- [x] Implémenter les plugins Mongoose transverses (`tenantScope`, `timestamps`) — 1j
- [x] Implémenter les health checks `/health/live`, `/health/ready` — 0,5j — `/health/ready` vérifie MongoDB + Redis ; le critère "migrations à jour" (doc 25 §25.5) n'est pas vérifiable, aucun système de migrations n'existe encore (arrivera avec le premier schéma versionné)
- [x] Créer un module de référence traversant toutes les couches (validation du pattern) — 1j

### Feature 0.4 — Internationalisation, socle

🎯 **Livrable** : le sélecteur de langue FR/EN/IT/ES fonctionne sur un écran de test ; la locale/devise/fuseau d'un pays est résolue automatiquement.

- [x] Configurer Vue I18n + scaffolding des fichiers `fr.json`/`en.json`/`it.json`/`es.json` — 0,5j
- [x] Implémenter `i18n.middleware.ts` backend (résolution de locale, catalogue de messages d'erreur) — 1j — résolution depuis `Accept-Language` (quality-values), `req.locale` typé, catalogue `error.code → message` pour FR/EN/IT/ES (doc 35 §35.4) ; placement dans la chaîne (`app.ts`, après `correlationId`, avant les routes) non documenté par doc 12 §12.4 — choix explicite fait, à valider si la chaîne documentée est mise à jour
- [x] Modéliser et seeder la collection `countryDefaults` (Bénin, France, Italie, Espagne, USA) — 0,5j — modèle Mongoose non tenant-scoped (`database/models/countryDefault.model.ts`) + seed idempotent par upsert (`database/seeders/countryDefaults.seed.ts`, `pnpm --filter @quicktable/api seed:country-defaults`) ; `{ timestamps: true }` ajouté bien qu'absent du tableau de champs doc 05 (jugé oubli plutôt que choix délibéré, documenté dans le code — pas une contradiction entre deux sections de doc) ; fuseau US simplifié à `America/New_York` (choix documenté, un restaurant peut surcharger `restaurants.timezone` après provisioning)
- [x] Implémenter le service de géolocalisation IP (`GET /restaurants/detect-location`) — 1j — fournisseur `ip-api.com` retenu (doc 35 §35.2 laissait le choix ouvert, validé avec le PO plutôt que MaxMind GeoLite2, hors budget de ce ticket) ; jamais bloquant (`{country:null,city:null}` sur IP privée/timeout/panne tierce, jamais un 500) ; `app.set('trust proxy', 1)` ajouté (nécessaire derrière le reverse proxy Railway pour que `req.ip` reflète le vrai client) ; endpoint Public, sans rate-limit (ticket transverse séparé, doc 12 §12.4, pas encore implémenté) ; vérifié en conditions réelles avec de vraies IP publiques (US, FR) via `X-Forwarded-For`

> **Critère de sortie Epic 0** : module "Hello World" déployé en staging, health checks verts, CI bloquante fonctionnelle, sélecteur de langue FR/EN/IT/ES opérationnel. — ✅ **atteint**, vérifié réellement le 2026-07-15 (`quicktableapi.up.railway.app` : `/health/live`, `/health/ready` Mongo+Redis OK, `/api/v1/hello-world` répond 200). Restent hors périmètre de ce critère, déjà documentés comme bloqués plus haut : `docker-compose.yml` non vérifié par exécution, Firebase Storage non provisionné (carte bancaire manquante).

---

## Epic 1 — Authentification, RBAC & Multi-tenant `MVP`

### Feature 1.1 — Identité (`users`, `memberships`)

🎯 **Livrable** : un compte utilisateur peut être créé et rattaché à un restaurant avec un rôle — données validées et persistées (authentification pas encore branchée).

- [x] Modéliser et implémenter le schéma `users` — 0,5j — non tenant-scoped (identité globale, doc 05 §5.3) ; `passwordHash`/`twoFactorSecret` en `select:false` (exclus des requêtes par défaut) + `toJSON`/`toObject` transform (exclus même si récupérés explicitement) ; hachage Argon2id et chiffrement AES-256 du secret TOTP volontairement hors périmètre (arrivent avec Feature 1.2, pas anticipés) ; vérifié réellement contre Atlas (création, exclusion des secrets, `.select('+passwordHash')`, rejet d'un doublon email par l'index unique)
- [x] Modéliser et implémenter le schéma `memberships` — 0,5j — tenant-scoped (`tenantScope` plugin), `role` limité aux 5 rôles à portée tenant (doc 08 §8.2 : `super_admin` et `customer` n'ont volontairement pas de membership) ; index unique composé `{tenantId,userId}` (un seul rôle par restaurant) + `{tenantId,role}` ; contrôle de visibilité de `salary` et résolution `permissionsOverrides` hors périmètre (Feature 1.4 RBAC) ; vérifié réellement contre Atlas (création, rejet du doublon `(tenantId,userId)`, `tenantScope` bloque bien un `find()` sans `tenantId`)
- [x] Implémenter `users.repository.ts` / `memberships.repository.ts` — 0,5j — `UsersRepository` (`modules/users/`) n'étend pas `BaseRepository` (collection non tenant-scoped) : `create`/`findByEmail` (normalise lowercase)/`findById` ; `MembershipsRepository` (`modules/employees/`, placement par cohérence avec l'arborescence doc 03 §3.2 — Feature 2.2 y logera la gestion business des employés — fichier nommé `memberships.repository.ts` par cohérence avec le nom de collection, checklist/doc 05) étend `BaseRepository`, ajoute `create` (injecte `tenantId` depuis le contexte) ; bug réel détecté et corrigé au passage dans `membership.model.ts` : l'interface TS utilisait `Schema.Types.ObjectId` (type constructeur de schéma) au lieu de `Types.ObjectId` (type valeur) pour `userId` ; vérifié réellement contre Atlas bout en bout (création, lookup email insensible à la casse, lookup par id, création de membership liée à un vrai user, `find()` hérité de `BaseRepository`)
- [x] Implémenter la validation Zod des DTO `users`/`memberships` — 0,5j — `createUserSchema` valide le mot de passe **en clair** (`password`, min 10 caractères, doc 07 §7.8) — pas `passwordHash` (le hachage Argon2id arrive avec l'endpoint d'inscription réel, Feature 1.2, pas construit ici) ; vérification zxcvbn contre les mots de passe fréquents volontairement non ajoutée (choix de dépendance à trancher pour l'endpoint réel, pas anticipé) ; `createMembershipSchema` n'accepte jamais `tenantId` en entrée (toujours depuis `context`, doc 06 §6.2 — un `tenantId` fourni par le client est silencieusement ignoré par Zod, jamais utilisé) ; contrôle de visibilité de `salary` hors périmètre (Feature 1.4 RBAC)

### Feature 1.2 — Authentification

🎯 **Livrable** : un utilisateur peut se connecter, se déconnecter, réinitialiser son mot de passe, activer la 2FA, et gérer ses sessions actives.

- [x] Implémenter `POST /auth/login` (vérification mot de passe, émission JWT) — 1j — Argon2id (`argon2`, prébuilt natif vérifié sous Windows) + JWT HS256 (`jsonwebtoken`, choisi avec toi plutôt que `jose`) ; nouveau modèle `refreshTokens` (non tenant-scoped, TTL index) ; résolution du tenant unique auto-sélectionné dans le token si l'utilisateur a exactement 1 membership, sinon `tenantId/role/membershipId` restent `null` et `tenants[]` liste les options (`POST /auth/select-tenant` non construit, hors périmètre) ; branche 2FA du diagramme doc 07 §7.3 volontairement non câblée (`twoFactorEnabled` toujours `false` aujourd'hui, aucun endpoint d'activation) ; anti-énumération par timing constant (`argon2.verify` toujours appelé, y compris utilisateur inconnu) ; rate limiting dédié `/auth/login` inclus dans ce ticket (choisi avec toi) — `express-rate-limit`+`rate-limit-redis`, 5/(email,IP)/15min, reset après succès, construction paresseuse pour ne jamais dépendre de Redis à l'import ; **échappatoire `ALLOW_CROSS_TENANT_OPTION` ajoutée à `tenantScope.ts`** (choisie avec toi) pour la résolution cross-tenant des memberships au login — le garde-fou doc 06 §6.4 devient non-absolu pour ce cas précis, pas encore reflété dans la doc ; `app.set('trust proxy')` et `normalizeClientIp` réutilisés (promu vers `shared/utils/`, déjà utilisé par `restaurants`) ; vérifié réellement (utilisateur Argon2id réel, login/mauvais mot de passe/email inconnu/payload invalide/verrouillage 5 tentatives + reset, tous via curl contre un serveur réel + Atlas + Redis)
- [x] Implémenter la rotation de refresh token + `POST /auth/refresh` — 1j — contexte tenant (`tenantId`/`role`/`membershipId`) repris tel quel depuis l'ancien Access Token, même expiré, envoyé via `Authorization: Bearer` en plus du cookie (décision validée avec toi, cohérente avec doc 06 §6.3 : le contexte actif persiste jusqu'à un changement explicite via `select-tenant`, pas re-résolu à chaque refresh) — signature vérifiée via `jwt.verify(..., {ignoreExpiration:true})`, jamais l'intégrité ; rotation stricte (ancien token révoqué, nouveau émis) ; **détection de rejeu** (doc 07 §7.1) : un token déjà révoqué présenté à nouveau révoque toute la famille de sessions de l'utilisateur (`refreshTokens` n'a pas de champ "famille" explicite au schéma — famille = tous les tokens actifs du `userId`) ; notification de sécurité par email volontairement non envoyée (aucun système d'envoi d'email n'existe encore, ticket séparé de cette Feature) ; `cookie-parser` ajouté (nouvelle dépendance, nécessaire pour lire le cookie `refreshToken` en retour) ; vérifié réellement (rotation légitime puis rejeu de l'ancien token détecté et rejeté avec le bon code, contre un serveur réel + Atlas)
- [x] Implémenter `POST /auth/logout` + révocation de session — 0,5j — révoque uniquement la session courante (le refresh token du cookie), jamais toutes les sessions (`204`, idempotent : pas de cookie/token inconnu/déjà révoqué ne sont jamais des erreurs) ; `res.clearCookie('refreshToken', {path:'/'})` ; effet de bord attendu et documenté : réutiliser le token après logout déclenche la détection de rejeu (`AUTH_REFRESH_TOKEN_REUSED`, même chemin de code que le vol — le serveur ne distingue pas une révocation légitime d'un rejeu, choix défendable en défense en profondeur) ; vérifié réellement (logout, logout idempotent, puis refresh avec le token révoqué correctement rejeté, contre un serveur réel + Atlas)
- [x] Implémenter `POST /auth/forgot-password` + `POST /auth/reset-password` — 1j — **nouvelle collection `passwordResetTokens`** ajoutée (choisie avec toi) : ni `users` ni aucune collection de doc 05 ne prévoyaient le stockage du token de reset, miroir de `refreshTokens` (non tenant-scoped, hash SHA-256, TTL 30min, usage unique via `usedAt`) ; `forgot-password` toujours `200 {data:null}` identique que l'email existe ou non (anti-énumération) ; rate limiting dédié 3/IP/1h (doc 13 §13.2, par IP seule contrairement au login) — factorisé dans `shared/utils/createRedisRateLimiter.ts` (extrait de `login-rate-limit.ts` après ce 2ème quasi-doublon, pour ne pas répliquer une seconde fois la construction paresseuse/IPv6/silencing déjà subtile) ; `reset-password` révoque **toutes** les sessions actives (contrairement à `logout`, une seule) ; **envoi d'email hors périmètre** (aucun worker Nodemailer/Brevo, ticket séparé) — le lien de réinitialisation est loggé en attendant, pas envoyé ; vérifié réellement (lien récupéré dans les logs serveur, reset effectif — ancien mot de passe rejeté/nouveau accepté —, rejeu du token bloqué, anti-énumération et rate limit 3/h confirmés via curl contre un serveur réel + Atlas + Redis)
- [x] Implémenter l'envoi d'email (worker, Nodemailer + relais SMTP Brevo) — 1j — `EmailSenderService` (`modules/notifications/`, doc 04 §4.1 — seul point du code qui importe Nodemailer) construit par injection de la config SMTP, **adresse d'expédition (`from`) elle-même configurable** (même convention que `connectDatabase`/`connectRedis`) ; templates fr/en/it/es pour le lien de reset et la confirmation de changement de mot de passe (`modules/notifications/email-templates/`) ; queue BullMQ nommée `email` (`jobs/queues.ts`, doc 12 §12.5) — process API = producteur (`connectEmailQueue` au démarrage de `server.ts`), process `workers/worker.ts` = consommateur, jamais partagé ; **`ioredis` épinglé en version exacte `5.10.1`** (au lieu de `^5.11.1`) pour dédupliquer avec la dépendance interne de `bullmq` — deux versions coexistantes cassaient le typage (`Redis` non assignable à `ConnectionOptions`) ; 5 retries à backoff exponentiel ; `AuthService#forgotPassword`/`#resetPassword` enfilent réellement le job (n'écrivent plus le lien en clair dans les logs) ; tests d'intégration réels vérifiant qu'un job atterrit bien dans la vraie queue BullMQ/Redis, avec nettoyage (`drain`/`obliterate`) pour ne pas accumuler de jobs orphelins entre les runs ; compte Brevo créé par toi (vérification téléphone, initialement bloquante, résolue) ; **`SMTP_FROM` ajouté** à `config/env.ts` après un premier envoi réel rejeté par Brevo (`no-reply@quicktable.io` n'est pas un expéditeur vérifié) — utilise en attendant le sender vérifié du compte (`Quick Table <azankpoeric99@gmail.com>`), `no-reply@quicktable.io` ne sera utilisable qu'après authentification du domaine (ticket suivant) ; **vérifié réellement de bout en bout** : worker + serveur réels lancés en local, `POST /forgot-password` déclenché contre MongoDB Atlas/Redis Upstash réels, job consommé par le worker, email réellement envoyé via Brevo (confirmé dans les logs Brevo eux-mêmes, pas seulement les logs applicatifs) et **reçu** dans une vraie boîte non-Gmail — Gmail a différé/absorbé silencieusement le premier envoi (réputation d'expéditeur non authentifié, cf. ticket SPF/DKIM/DMARC) ; **worker déployé comme 2ème service Railway** (`quicktable-worker`, Root Directory `/`, mêmes build/variables que `@quicktable/api`, start command `pnpm --filter @quicktable/api start:worker`) — au passage, deux incidents réels détectés et corrigés en prod : (1) `@quicktable/api` était en crash loop en production depuis l'introduction de `JWT_SECRET`/`SMTP_*` (jamais ajoutées aux Variables Railway, seulement à `.env` local et aux secrets CI) ; (2) un collage de variables via le Raw Editor Railway a failli supprimer `MONGODB_URI`/`REDIS_URL` de la prod, intercepté avant déploiement
- [ ] Configurer SPF/DKIM/DMARC sur `quicktable.io` + compte Brevo — 0,5j — **bloqué : le domaine `quicktable.io` n'est pas encore enregistré/acheté** (nom utilisé dans tout le projet — reset links, `security@quicktable.io` doc13 §13.9 — mais pas de domaine réel côté registrar à ce jour). Compte Brevo déjà créé (ticket précédent) et prêt à recevoir un domaine dès qu'il existera. **Note doc** (signalée, non corrigée) : doc04 §4.1 renvoie à doc13 §13.8bis pour ce prérequis, mais cette section traite en réalité de Secrets Management, pas de SPF/DKIM/DMARC — référence croisée incorrecte, ce sujet n'est documenté nulle part ailleurs. Reprendre ce ticket une fois le domaine acheté : ajouter le domaine dans Brevo (Settings > Senders, Domains and Dedicated IPs > Domaines), créer les enregistrements DNS générés, puis basculer `SMTP_FROM` de `Quick Table <azankpoeric99@gmail.com>` vers `no-reply@quicktable.io`.
- [x] Implémenter la 2FA TOTP (enable/confirm/verify/disable) — 1j — **`middlewares/auth.middleware.ts` créé** (`requireAuth`, doc 03 §3.3 : "Vérification JWT") — premier endpoint de l'Epic exigeant un utilisateur authentifié ; volontairement limité à vérifier le JWT et attacher `req.auth`, sans résolution tenant (`tenant.middleware.ts`, Feature 1.3) ni RBAC (`rbac.middleware.ts`, Feature 1.4), tickets séparés. TOTP via `otplib` (API fonctionnelle v13 : `generateSecret`/`generateURI`/`verify`, pas la classe `authenticator` des versions antérieures) + QR Code via `qrcode` (data URI PNG) ; **`otplib.verify()` lève une exception sur un token qui n'a pas la forme d'un code TOTP** (ex. un code de récupération) au lieu de renvoyer `valid:false` — bug réel trouvé par les tests d'intégration (500 au lieu de 200/401), corrigé en enveloppant `verifyTotpCode` d'un try/catch. Secret chiffré AES-256-GCM (`twoFactorSecret.util.ts`, `crypto` natif, pas de nouvelle dépendance) avec **nouvelle clé `TWO_FACTOR_ENCRYPTION_KEY`** (doc 07 §7.6, doc 13 §13.6) — distincte de `JWT_SECRET` (deux fonctions cryptographiques ne partagent jamais une même clé). **10 codes de récupération** (`recoveryCode.util.ts`, hash SHA-256 même convention que `refreshTokens`/`passwordResetTokens`) stockés en tableau embarqué sur `users.twoFactorRecoveryCodes` (pas de collection séparée : pas de TTL, cycle de vie 1:1 avec l'utilisateur) — nouveau champ non documenté au doc 05, ajouté par cohérence avec le pattern déjà établi. **`challengeToken` du flux `/2fa/verify`** (doc 07 §7.3) implémenté en JWT signé à TTL court (5 min, claim `purpose`) plutôt qu'un token opaque stocké en base (décision validée avec toi) — aucune nouvelle collection, cohérent avec le choix JWT déjà fait pour le reste de l'auth. **Réponse `/2fa/enable` inclut aussi le secret en clair** (pas seulement le QR Code) — non explicitement prévu par doc 07 §7.6, mais UX standard ("impossible de scanner ? saisissez ce code") et nécessaire pour rendre le flux testable de bout en bout sans décoder une image PNG. `/2fa/verify` accepte indifféremment un code TOTP ou l'un des 10 codes de récupération non consommés (marqué utilisé après coup) ; rate limiting dédié ajouté sur `/2fa/verify` (5 tentatives/5 min par `(challengeToken, IP)`, même factory `createRedisRateLimiter`) — code à 6 chiffres brute-forçable, non listé au doc 13 §13.2 (rédigé avant l'implémentation 2FA) mais découlant directement du principe OWASP A07 déjà documenté ; `confirmTwoFactor`/`disableTwoFactor` révoquent **toutes** les sessions actives et enfilent un email de notification de sécurité (doc 07 §7.7, nouveau template `twoFactorStatusChanged`) — simplification assumée : la doc mentionne "sauf la session à l'origine de l'action, si applicable", non implémentée (aurait exigé de faire remonter le refresh token courant jusqu'au service, non fait ici, cohérent avec le comportement déjà existant de `resetPassword`) ; **incohérence de doc signalée, non corrigée** : doc04 §4.1 renvoie à doc13 §13.8bis (Secrets Management) pour SPF/DKIM/DMARC, sans rapport avec le sujet réel. Vérifié réellement de bout en bout : suite d'intégration réelle (enable→confirm avec un vrai code TOTP généré par `otplib`→login exigeant le challenge→verify TOTP→verify code de récupération à usage unique→disable→nouveau login direct) contre MongoDB Atlas/Redis Upstash réels, puis re-vérifié manuellement via un serveur réel + de vrais codes TOTP générés à la volée
- [x] Implémenter `GET/DELETE /auth/sessions` — 0,5j — doc 07 §7.7 : `GET /auth/sessions` liste les sessions actives (non révoquées, non expirées) de l'utilisateur avec `deviceInfo`/`createdAt`/`expiresAt`, jamais `tokenHash` (opaque côté client, doc 05) ; `isCurrent` calculé en comparant le hash du cookie `refreshToken` de la requête courante — permet au front de distinguer "cet appareil" sans logique supplémentaire. `DELETE /auth/sessions/:id` révoque une session précise avec **404 générique anti-IDOR** (`AUTH_SESSION_NOT_FOUND`, doc 06) si elle n'existe pas _ou_ appartient à un autre utilisateur — aucune distinction dans la réponse. `DELETE /auth/sessions` ("déconnecter tous les autres appareils") exclut la session courante identifiée via le même cookie ; si absent, révoque tout sans exclusion (comportement de repli explicite, pas une erreur). Toutes les routes protégées par `requireAuth` (`middlewares/auth.middleware.ts`, construit au ticket 2FA précédent) — aucune nouvelle infrastructure d'authentification nécessaire. `AuthRepository` gagne `findActiveRefreshTokensByUserId`/`findRefreshTokenById`/`revokeAllUserRefreshTokensExcept`, aucun changement de schéma (les champs `deviceInfo`/`createdAt` existaient déjà sur `refreshTokens` depuis la Feature 1.2 initiale). Vérifié réellement : suite d'intégration réelle (liste avec 2 appareils simulés via `User-Agent` distincts, révocation ciblée avec disparition de la liste, rejet anti-IDOR d'une session d'un autre utilisateur, révocation de toutes les sessions sauf la courante) contre MongoDB Atlas/Redis Upstash réels, puis re-vérifié manuellement via un serveur réel + deux sessions simulées
- [x] Tests d'intégration complets du module `auth` (doc 31 §31.3) — 1j — **incohérence de doc signalée, non corrigée** : doc31 §31.3 prescrit `mongodb-memory-server` pour les tests d'intégration, mais **aucun** test d'intégration du projet ne l'utilise (`mongodb-memory-server` n'est même pas une dépendance) — `hello-world.integration.spec.ts` (module de référence, Feature 0.3) a délibérément posé le pattern MongoDB Atlas + Redis Upstash réels dès le premier ticket, suivi scrupuleusement depuis par tous les modules ; décision validée avec toi de garder ce pattern pour ce ticket, la doc restant à corriger séparément. Audité chaque endpoint du module contre l'exigence doc31 §31.3 ("nominal + au moins un cas d'erreur : 401/400/409 selon la règle métier de l'endpoint") et comblé les 17 cas manquants trouvés : `forgot-password` (400 payload invalide, 429 rate limit 3/IP/h) ; `2fa/enable` (409 déjà activé) ; `2fa/confirm` (401 sans token, 400 payload, 401 code TOTP incorrect, 409 rejeu après confirmation) ; `2fa/verify` (400 payload, 401 challengeToken invalide/corrompu, 429 rate limit 5/(challengeToken,IP)/5min) ; `2fa/disable` (401 sans token, 400 payload, 401 2FA non activée, 401 mauvais mot de passe même avec bon code, 401 mauvais code même avec bon mot de passe) ; `DELETE /sessions/:id` et `DELETE /sessions` (401 sans token). 403/404-hors-tenant non applicables à ce module (aucune ressource tenant-scoped dans `auth` — arrive avec Feature 1.3/1.4) ; tests de l'Event Bus non applicables (`AuthService` ne publie aucun événement dans `eventOutbox`). **Bug de test découvert et corrigé en cours de route** : le nouveau test de rate limit `forgot-password` héritait un quota déjà partiellement consommé par les tests précédents du même bloc (le rate limiter compte toute requête, même à payload invalide, avant la validation Zod) — corrigé en réinitialisant les clés Redis du rate limiter juste avant ce test spécifique, pour ne pas dépendre de l'ordre d'exécution des autres tests du bloc. Suite passée de 26 à 43 tests d'intégration réels ; 421 tests au total dans `apps/api`, tous verts

### Feature 1.3 — Multi-tenant

🎯 **Livrable** : l'isolation des données entre restaurants est garantie et vérifiée par une suite de tests automatisés bloquante en CI.

- [x] Implémenter `tenant.middleware.ts` (résolution depuis JWT) — 1j — **version minimale choisie avec toi** (doc 06 §6.3 décrit un Tenant Resolver complet incluant vérification du statut du restaurant et injection de la souscription/feature gating) : `restaurants`/`subscriptions` n'existent pas encore (Feature 2.1, pas commencée), donc `403 TENANT_SUSPENDED` et `req.context.subscription` sont explicitement hors périmètre ici, pas anticipés (doc 14 §14.5 KISS) — à ajouter quand ces collections existeront. Résolution du `clusterId` (mode Silo, doc 06 §6.1) également hors périmètre : aucun tenant Silo n'existe tant que le mode Pool est seul actif. Ce que la version actuelle fait réellement : relit `req.auth` (déjà validé par `requireAuth`, Feature 1.2) et revérifie que le membership actif référencé par le JWT existe toujours et est `employmentStatus:'active'` en base — referme la fenêtre de 15 min (durée de vie de l'Access Token) pendant laquelle un JWT reste valide après qu'un employé a été désactivé/retiré, plutôt que d'attendre l'expiration naturelle du token. Nouveau `req.context: TenantContext` (`tenantId`/`userId`/`membershipId`/`role`/`isSuperAdmin`) posé comme seule source de vérité tenant en aval (jamais relu depuis `req.body`/`req.query`/`req.params`, doc 06 §6.2, dernier rempart anti-IDOR). `isSuperAdmin` avec `tenantId:null` (cas normal au login, un super admin n'a généralement aucun membership) passe avec `context.tenantId = null` (doc 06 §6.3 "routes platform-admin, bypass du Tenant Resolver") ; un utilisateur non super_admin sans `tenantId` (multi-membership sans `select-tenant` préalable) rejeté avec un nouveau **400 `TENANT_CONTEXT_REQUIRED`** ; membership introuvable ou inactif rejeté avec un nouveau **403 `TENANT_MEMBERSHIP_INACTIVE`**. Exporté en deux fonctions comme `asyncHandler` (`shared/utils/asyncHandler.ts`) le fait déjà ailleurs, mais inlinées ici plutôt que réutilisées pour rester directement montable (`requireAuth, resolveTenant`) sans wrapper supplémentaire par route : `resolveTenantAsync` (logique réelle, `await`ée directement dans les tests unitaires) et `resolveTenant` (wrapper synchrone `.catch(next)`, la seule montée sur une route Express) — nécessaire car Express 4 ne rattrape pas un rejet de promesse dans un middleware. `tenant.middleware.ts` n'est encore consommé par **aucune route de production** (aucun endpoint tenant-scoped n'existe avant Epic 2) ; vérifié via une mini-app Express dédiée (`requireAuth` → `resolveTenant` → handler retournant `req.context`) contre un vrai MongoDB Atlas plutôt que par mocks seuls (doc 14 §14.6). Vérifié réellement : 7 tests unitaires (mock `MembershipModel`) + 5 tests d'intégration réels contre MongoDB Atlas (membership actif → 200, `employmentStatus:'inactive'` → 403, `membershipId` inexistant/JWT périmé → 403, super_admin sans tenantId → 200 bypass, utilisateur normal sans tenantId → 400) ; suite complète `apps/api` passée de 421 à 433 tests, tous verts
- [x] ~~Implémenter le plugin Mongoose `tenantScope` (garde-fou ORM) — 0,5j~~ doublon avec Feature 0.3 (déjà fait là-bas, le plugin n'a pas de dépendance sur `tenant.middleware.ts`)
- [ ] Implémenter `TenantProvisioningService` (transaction multi-documents) — 1j — **reporté, bloqué** (signalé et validé avec toi, "Reporter le ticket") : doc 06 §6.7 décrit ce service comme orchestrant dans une transaction MongoDB multi-documents la création du document `restaurants` (le tenant lui-même), de l'abonnement par défaut (`subscriptions`), du premier `membership` `restaurant_owner`, et de données de référence minimales (salle par défaut, catégories de base). Or **aucun modèle Mongoose `restaurants` ni `subscriptions` n'existe** à ce jour (`modules/restaurants/` ne contient que le endpoint public `detect-location`, Feature 0.3) — ces deux collections sont explicitement prévues pour la Feature 2.1, pas commencée (même constat déjà fait au ticket précédent, `tenant.middleware.ts`). Contrairement à ce ticket précédent, une version minimale n'a ici aucun sens : sans document `restaurants`, il n'y a littéralement aucun tenant à provisionner — construire ce service maintenant reviendrait à anticiper le travail de schéma de la Feature 2.1, pas seulement à réduire un périmètre. **Reprendre ce ticket une fois la Feature 2.1 livrée** (modèles `restaurants`/`subscriptions` disponibles).
- [x] Écrire la suite de tests d'isolation multi-tenant — infrastructure de test — 1j — **premier module sous `shared/testing/`** (aucune convention préexistante de dossier de test-utils transverse dans le projet — chaque `__tests__` co-localisait jusqu'ici ses propres helpers). `tenantIsolationFixtures.ts` : `createTenantFixture({tenantId, jwtSecret, role?})` crée un couple `users`/`memberships` réel et signe l'Access Token correspondant (exploitable directement contre `requireAuth`/`resolveTenant`) ; `cleanupTenantFixtures(fixtures)` supprime par `_id` exact (jamais par simple filtre `tenantId`, pour que deux suites utilisant des tenants différents ne puissent jamais se marcher dessus en cas d'exécution parallèle). Volontairement limité à la fabrication des fixtures (doc 14 §14.5 KISS) : pas d'assertion HTTP générique fournie — la forme des réponses variant par endpoint, chaque suite (ticket suivant) écrit ses propres assertions 404 anti-IDOR plutôt qu'une abstraction plus complexe à maintenir qu'explicite. **Note de séquencement** : `hello-world` reste à ce jour le seul modèle tenant-scoped existant, mais son unique route n'est pas branchée sur `requireAuth`/`resolveTenant` (tenant de démonstration fixé côté serveur, `DEMO_TENANT_ID`, Feature 0.3 — le brancher sur l'auth réelle est noté hors périmètre de ce ticket, à trancher au ticket suivant). Démonstration de bout en bout de l'infrastructure faite via une mini-app Express dédiée (même pattern que `tenant.middleware.integration.spec.ts`) : `requireAuth` → `resolveTenant` → deux routes ad hoc (`GET`/`DELETE /resources/:id`) utilisant `HelloWorldRepository.findOne`/`deleteOne` (hérités de `BaseRepository`) pour prouver, à travers la chaîne complète et contre un vrai MongoDB Atlas, qu'un tenant B ne peut ni lire ni supprimer une ressource de tenant A (404 `RESOURCE_NOT_FOUND` dans les deux cas, jamais 403 — doc 06 §6.4 point 3, doc 06 §6.2 anti-IDOR). Vérifié réellement : 3 tests unitaires (mocks `UserModel`/`MembershipModel`/`signAccessToken`) + 3 tests d'intégration réels contre Atlas ; suite complète passée de 433 à 439 tests, tous verts
- [x] Écrire les tests d'isolation pour les endpoints Epic 1 — 0,5j — **décision de portée validée avec toi** ("Brancher hello-world sur l'auth réelle") : aucun endpoint tenant-scoped d'Epic 1 n'était réellement branché sur l'auth avant ce ticket (`memberships` n'a pas de routes HTTP, `auth` est user-scoped et non tenant-resource-scoped) — `hello-world` (Feature 0.3) restait le seul modèle tenant-scoped existant, mais son contrôleur utilisait encore un `DEMO_TENANT_ID` fixe, avec un commentaire déjà présent dans le code anticipant ce changement ("à remplacer par `req.context.tenantId` dès que `tenant.middleware.ts` existe — seule ligne à changer"). Ce ticket réalise ce changement anticipé : `hello-world.routes.ts` monte désormais `requireAuth, resolveTenant` sur ses deux routes ; `hello-world.controller.ts` lit `req.context.tenantId` via un nouveau `requireTenantContext(req)` qui rejette en **400 `TENANT_CONTEXT_REQUIRED`** (même code que `tenant.middleware.ts`, même situation : aucun tenant actif résolu) le cas d'un super_admin sans restaurant sélectionné appelant directement un endpoint métier (jamais anticipé auparavant, `DEMO_TENANT_ID` masquait ce cas). `DEMO_TENANT_ID` supprimé entièrement (plus de raison d'être). `hello-world.integration.spec.ts` réécrit pour consommer directement `shared/testing/tenantIsolationFixtures.ts` (ticket précédent) au lieu de requêtes anonymes : nouveau test 401 `AUTH_TOKEN_MISSING` sans token, test d'isolation réécrit avec deux vrais tenants A/B via la chaîne HTTP complète (`requireAuth`→`resolveTenant`→`BaseRepository`→`tenantScope`) plutôt qu'en insérant un document directement en base avec un `tenantId` arbitraire. `hello-world.controller.spec.ts` étendu (2 nouveaux tests) pour couvrir le rejet `TENANT_CONTEXT_REQUIRED`. Vérifié réellement : 21 tests dans `hello-world`+`shared/testing` (dont 7 d'intégration réelle contre MongoDB Atlas/Redis Upstash), suite complète `apps/api` passée de 439 à 442 tests, tous verts

### Feature 1.4 — RBAC

🎯 **Livrable** : chaque action est vérifiée contre les permissions du rôle de l'utilisateur, avec cache Redis pour la performance.

- [x] Modéliser `roleDefinitions` et seed des rôles système — 0,5j — `database/models/roleDefinition.model.ts` : `roleCode` réutilise `MEMBERSHIP_ROLES`/`MembershipRole` (`membership.model.ts`, jamais une seconde liste des 5 rôles tenant qui pourrait diverger) ; collection **non tenant-scoped** (rôles système, doc 08 §8.1, support de rôles custom par tenant explicitement V2, pas construit ici) ; versionné (doc 22 §22.4) via index partiel unique `{roleCode:1, isCurrent:true}` — une seule version courante par rôle, l'historique des versions précédentes est conservé (jamais modifié en place) pour l'audit "quelles permissions un Manager avait-il le 3 mars ?". `roleDefinitions.seed.ts` transcrit **littéralement** la matrice doc 08 §8.4 (seules les cellules ✅ incluses, jamais les 🔒 — accordées uniquement via `permissionsOverrides`, pas par défaut) ; idempotent et versionnant : une nouvelle version n'est insérée que si les permissions cibles diffèrent de la version courante (comparaison indépendante de l'ordre), l'ancienne passe `isCurrent:false` sans être modifiée. **Deux incohérences de doc signalées, non corrigées** (décisions validées avec toi) : (1) doc 08 §8.8 (portée `own`, ex. `orders:read` pour `waiter`) suppose que `roleDefinitions.permissions` porte un scope par permission, mais le schéma doc 22 §22.4 n'est qu'un `string[]` plat, sans mécanisme pour ça — sans impact aujourd'hui, le module `orders` n'existe pas encore (Epic 3), permission accordée telle quelle (portée `all` par défaut) en attendant ; (2) **"seeder strictement la matrice écrite"** : plusieurs permissions du catalogue §8.3 n'apparaissent dans **aucune** ligne de la matrice §8.4 pour aucun rôle — `employees:read`, `tables:read`, `menus:read`, `payments:read`, `subscriptions:read`, tout le groupe `notifications:*`, `qrcode:regenerate` — probablement un oubli (un manager sans `employees:read` ne pourrait jamais lister son équipe) mais non deviné ici, donc accordées à aucun rôle pour l'instant ; sans impact fonctionnel aujourd'hui (Epic 2+, pas commencé). Script CLI `run-role-definitions.ts` + `pnpm --filter @quicktable/api seed:role-definitions` (même pattern que `seed:country-defaults`). Vérifié réellement : 7 tests de schéma + 7 tests unitaires du seed (mocks, dont le comportement versionnant : version 1 si aucune courante, aucune écriture si déjà à jour, nouvelle version + ancienne désactivée si changement) + 3 tests d'intégration réels contre MongoDB Atlas (idempotence, versionnement réel, rejet d'une seconde version courante par l'index partiel unique) — 17/17 verts, indépendants de Redis (cette collection n'y touche pas). **Suite complète `apps/api` non revérifiée de bout en bout à ce stade** : le quota Upstash Redis du plan Free Tier est épuisé (500 006/500 000 requêtes ce mois-ci, confirmé sur le dashboard), ce qui fait échouer tous les tests d'intégration touchant Redis déjà en place (`auth.integration.spec.ts`, `hello-world.integration.spec.ts`) — sans lien avec ce ticket. Réinitialisation prévue le 16 août (dashboard Upstash) ; passage au plan payant refusé pour l'instant (choix de toi). En conséquence, **ce commit reste local, non poussé** (le hook pre-push relance la suite complète, qui échouera tant que Redis est bloqué ; la CI GitHub Actions échouerait de la même façon via les mêmes secrets) — la vérification CI de ce ticket et des suivants est différée au déblocage du quota.
- [x] Implémenter `rbac.middleware.ts` (`requirePermission`) — 1j — version 1/3 de la vérification à trois niveaux de doc 08 §8.1 : uniquement "le rôle possède-t-il la permission" via `roleDefinitions` (doc 22 §22.4, résolu à chaque requête, aucun cache). La résolution combinée avec `permissionsOverrides` (niveau 3) et le cache Redis `rbac:resolved:{membershipId}` sont les deux tickets suivants de cette Feature, volontairement pas anticipés ici (doc 14 §14.5 KISS) ; le niveau 2 (feature gating par abonnement, doc 08 §8.6) reste hors périmètre de toute la Feature 1.4 (`subscriptions` n'existe pas encore, Feature 2.1). Pattern `requirePermission`/`requirePermissionAsync` identique à `resolveTenant`/`resolveTenantAsync` (Feature 1.3) : wrapper synchrone `.catch(next)` monté sur les routes, fonction async exportée séparément pour les tests unitaires. **Comportement `super_admin` validé avec toi** ("aucun bypass, sauf `platform:*`") : doc 08 §8.4 dit qu'un super_admin possède implicitement toutes les permissions `platform:*` mais "jamais un accès en écriture direct" aux données tenant — bypass automatique donc limité aux permissions préfixées `platform:*`, toute permission tenant traite un super_admin comme un utilisateur normal (`role` généralement `null` faute de membership → 403) ; l'"accès lecture seule cross-tenant à des fins de support" évoqué par la doc reste un mécanisme séparé, non construit ici (aucune route platform-admin n'existe encore pour le consommer, sa mécanique concrète n'est décrite nulle part ailleurs). Nouveau code **403 `RBAC_PERMISSION_DENIED`** (fr/en/it/es). `rbac.middleware.ts` n'est encore consommé par aucune route de production (même situation que `tenant.middleware.ts` à son ticket). Vérifié réellement : 8 tests unitaires (mock `RoleDefinitionModel`) + 4 tests d'intégration réels contre MongoDB Atlas via une mini-app `requireAuth`→`resolveTenant`→`requirePermission`→handler avec de vrais `roleDefinitions`/memberships (`waiter` autorisé sur `orders:read` refusé sur `settings:update`, `restaurant_owner` autorisé sur `settings:update`, 401 sans token) — indépendant de Redis. **Toujours pas repoussé sur `origin`** : quota Upstash épuisé, réinitialisation prévue le 16 août (voir ticket précédent) ; suite complète relancée pour confirmer l'absence de régression (428 tests verts, seul `auth.integration.spec.ts` échoue encore, cause déjà identifiée — queue email dépendante de Redis, sans lien avec ce ticket).
- [x] Implémenter la résolution combinée rôle + `permissionsOverrides` — 0,5j — **incohérence de doc signalée, non corrigée** (décision validée avec toi, "ajouts uniquement pour le MVP") : doc 05 décrit `permissionsOverrides: string[]` comme "permissions ajoutées/retirées au cas par cas", et le diagramme doc 08 §8.1 évoque explicitement un cas de retrait — mais un simple tableau de chaînes ne permet pas de distinguer un ajout d'un retrait, et aucune convention d'encodage (préfixe, champ séparé) n'est documentée nulle part ; le seul exemple concret donné dans toute la doc (`payments:refund` pour un Caissier) est un ajout. `permissionsOverrides` ne gère donc que les ajouts pour l'instant — le retrait reste non implémenté, à trancher si un vrai besoin métier apparaît. **`TenantContext` étendu** (`tenant.middleware.ts`, Feature 1.3, ticket déjà clos) d'un nouveau champ `permissionsOverrides: string[]`, peuplé directement depuis le document `membership` déjà chargé par `resolveTenantAsync` pour la vérification `employmentStatus` — évite une seconde requête `memberships` dans `rbac.middleware.ts` (choix architectural fait ici plutôt que d'anticiper le ticket cache suivant). `requirePermissionAsync` accorde désormais la permission si le rôle **ou** `permissionsOverrides` la contient (vérifié avant la lecture de `roleDefinitions`, court-circuit si l'override suffit déjà). Tests unitaires `tenant.middleware.spec.ts`/`.integration.spec.ts` mis à jour pour le nouveau champ (dont un cas vérifiant que `permissionsOverrides` du membership réel remonte bien dans `req.context`) ; `rbac.middleware.spec.ts`/`.integration.spec.ts` étendus avec le cas `payments:refund` accordé à un `cashier`/`waiter` par override alors qu'absent de son rôle. **Bug de test découvert et corrigé au passage** : `rbac.middleware.spec.ts` (ticket précédent) n'avait jamais de `beforeEach(vi.clearAllMocks())` — les appels à `RoleDefinitionModel.findOne` s'accumulaient silencieusement entre tests du même fichier sans jamais faire échouer une assertion existante (aucun test n'affirmait "pas appelé"), jusqu'à ce que le nouveau test de court-circuit par override le révèle. `shared/testing/tenantIsolationFixtures.ts` (Feature 1.3) gagne un paramètre optionnel `permissionsOverrides` sur `createTenantFixture`, réutilisé par le test d'intégration de ce ticket. Vérifié réellement : suite `middlewares`+`shared/testing` (58 tests, dont 4 tests d'intégration réels contre MongoDB Atlas nouveaux/modifiés) tous verts ; suite complète relancée, toujours aucune régression (seul `auth.integration.spec.ts` échoue, cause Upstash déjà identifiée, sans lien). **Toujours pas repoussé sur `origin`** : quota Upstash toujours épuisé (réinitialisation 16 août).
- [ ] Implémenter le cache Redis `rbac:resolved:{membershipId}` — 0,5j
- [ ] Écrire les tests de la matrice de permissions — 1j

> **Critère de sortie Epic 1** : suites de tests isolation + RBAC vertes et bloquantes en CI.

---

## Epic 2 — Structure du restaurant `MVP`

### Feature 2.1 — Restaurants

🎯 **Livrable** : un restaurant est configurable de bout en bout (identité, horaires, logo), avec devise/langue/fuseau déduits automatiquement du pays.

- [ ] Modéliser/implémenter `restaurants` (CRUD) avec `country`/`locale`/`currency` dérivés — 1j
- [ ] Implémenter la dérivation automatique devise/langue/fuseau depuis `countryDefaults` — 0,5j
- [ ] Écran d'inscription : saisie manuelle du pays ou confirmation de la détection automatique — 1j
- [ ] Écran back-office : création/édition restaurant (horaires, logo, coordonnées) — 1j

### Feature 2.2 — Employés

🎯 **Livrable** : le gérant invite, gère et retire des employés, dans la limite du quota de son plan.

- [ ] Implémenter `POST/GET/PATCH/DELETE /employees` — 1j
- [ ] Implémenter la limite `maxEmployees` du plan (`409`) — 0,5j
- [ ] Implémenter le flux d'invitation employé (email + activation) — 1j
- [ ] Écran back-office : liste et gestion des employés — 1j

### Feature 2.3 — Salles & Tables

🎯 **Livrable** : le plan de salle est configuré avec des tables, chacune dotée d'un QR Code fonctionnel.

- [ ] Implémenter `rooms` CRUD — 0,5j
- [ ] Implémenter `tables` CRUD + statuts — 1j
- [ ] Implémenter la génération de QR Code (token opaque + image) — 1j
- [ ] Implémenter `POST /tables/:id/qrcode/regenerate` — 0,5j
- [ ] Écran back-office : gestion des salles et tables (vue plan) — 1,5j

> **Critère de sortie Epic 2** : un restaurant peut être entièrement configuré (équipe, salles, tables, QR codes) via le back-office.

---

## Epic 3 — Menu & Stock `MVP`

### Feature 3.1 — Uploads

🎯 **Livrable** : une image peut être uploadée vers Firebase Storage et supprimée à la demande.

- [ ] Implémenter `POST /uploads` (SDK Firebase, validation type/taille) — 1j
- [ ] Implémenter `DELETE /uploads/:fileId` — 0,5j

### Feature 3.2 — Catalogue

🎯 **Livrable** : le menu complet (catégories, plats, photos, disponibilité) est visible et modifiable depuis le back-office.

- [ ] Implémenter `categories` CRUD + ordonnancement — 0,5j
- [ ] Implémenter `menuItems` CRUD (avec `recipe[]`) — 1j
- [ ] Implémenter `PATCH /menu-items/:id/availability` — 0,25j
- [ ] Écran back-office : gestion du menu avec upload photo — 1,5j

### Feature 3.3 — Stock simple

🎯 **Livrable** : le stock d'ingrédients est suivi, avec alerte automatique en cas de rupture imminente.

- [ ] Implémenter `ingredients`/`suppliers` CRUD — 1j
- [ ] Implémenter `POST /stock/movements` (mouvements manuels) — 0,5j
- [ ] Implémenter le Domain Event `StockLevelLow` + alerte — 1j
- [ ] Écran back-office : gestion du stock et seuils — 1j

> **Critère de sortie Epic 3** : un menu complet avec photos et stock associé est configurable et consultable.

---

## Epic 4 — Commandes & Cuisine `MVP` (le plus critique)

### Feature 4.1 — Cycle de vie de la commande

🎯 **Livrable** : une commande peut être créée, envoyée en cuisine, modifiée, transférée et annulée en respectant toutes les règles métier (dont l'annulation post-envoi tant qu'un plat n'est pas encore en préparation).

- [ ] Implémenter `POST /orders` (création, `OrderCreated`) — 0,5j
- [ ] Implémenter `POST/PATCH/DELETE /orders/:id/items` (opérations atomiques ciblées) — 1j
- [ ] Implémenter `POST /orders/:id/send-to-kitchen` + vérification stock synchrone (`pending → queued`) — 1j
- [ ] Implémenter `POST /orders/:id/items/:itemId/cancel` (annulation post-envoi tant que `queued`) + réintégration stock — 1j
- [ ] Implémenter `PATCH /orders/:id/status` + verrouillage optimiste `If-Match` — 1j
- [ ] Implémenter `POST /orders/:id/transfer` — 0,5j
- [ ] Implémenter `POST /orders/:id/cancel` (avec réintégration stock) — 1j
- [ ] Implémenter le décrément automatique de stock (couplage synchrone) — 1j
- [ ] Tests unitaires de la machine à état `Order`/`OrderItem` (toutes transitions + interdictions) — 1j

### Feature 4.2 — Cuisine (KDS)

🎯 **Livrable** : les cuisiniers voient les tickets arriver en temps réel et font progresser chaque plat sur un écran dédié.

- [ ] Implémenter `GET /kitchen/tickets` (agrégation, tri) — 1j
- [ ] Implémenter `PATCH /kitchen/tickets/:orderId/items/:itemId/status` — 0,5j
- [ ] Écran Kitchen Display System (layout dédié) — 1,5j

### Feature 4.3 — Temps réel

🎯 **Livrable** : toute mise à jour (commande, table) est propagée instantanément à tous les postes concernés, avec resynchronisation automatique après une coupure réseau.

- [ ] Implémenter le Socket Gateway (auth handshake) — 1j
- [ ] Configurer l'adaptateur Redis Socket.IO — 0,5j
- [ ] Implémenter la gestion des rooms par tenant/rôle — 1j
- [ ] Implémenter les événements `order:*`, `table:*` — 1j
- [ ] Implémenter le mécanisme de resynchronisation client (`client:resync`) — 1j
- [ ] Intégrer Socket.IO côté frontend (`services/socket/`) — 1j
- [ ] Tests Socket.IO, y compris test multi-instance — 1j

### Feature 4.4 — Validation de charge

🎯 **Livrable** : le système encaisse un pic de charge simulé ("rush du samedi soir") en respectant les cibles de performance du doc 29.

- [ ] Écrire le scénario k6 "Rush du samedi soir" — 1j
- [ ] Exécuter et documenter les résultats vs cibles de performance — 0,5j

> **Critère de sortie Epic 4** : parcours complet commande → cuisine → service validé en E2E et sous charge.

---

## Epic 5 — Paiement `MVP`

_Rescopé au cadrage PO du 2026-07-13 : Stripe + Mobile Money retenus, mais UI/flux seuls en MVP (confirmation manuelle) ; intégration API réelle en V1 (Feature 5.2). Split bill et pourboires confirmés dès le MVP._

### Feature 5.1 — Encaissement, split bill, pourboires

🎯 **Livrable** : un service complet peut être encaissé de bout en bout — espèces, carte/Mobile Money (confirmation manuelle), addition partagée entre convives, pourboire tracé, remboursement possible. **→ Fin du MVP.**

- [ ] Définir l'interface `PaymentProviderAdapter` + implémentation `ManualProviderAdapter` — 1j
- [ ] Implémenter `POST /payments` avec `Idempotency-Key`, support `splitCount`/`coveredItemIds` — 1,5j
- [ ] Implémenter l'incrément atomique `orders.amountPaid` + transition `served → partially_paid → paid` — 1j
- [ ] Implémenter la gestion des pourboires (`tipAmount`, `tipRecipientId`) — 0,5j
- [ ] Implémenter `POST /payments/:id/refund` — 1j
- [ ] Implémenter la génération de reçu (worker asynchrone), avec détail du split — 1j
- [ ] Écran caisse : sélection du mode de paiement, saisie split égal/par article, saisie pourboire — 2j
- [ ] Tests d'intégration paiement (nominal, split égal, split par article, montant excédentaire) — 1j
- [ ] Tests unitaires de la machine à état `Order` avec `partially_paid` — 0,5j

### Feature 5.2 — Intégration réelle des prestataires de paiement `V1`

🎯 **Livrable** : les paiements carte et Mobile Money sont réellement débités via Stripe et l'agrégateur retenu, sans changement d'API côté frontend.

- [ ] Sélectionner le compte Stripe (mode production) — 0,5j
- [ ] Implémenter `StripeAdapter` (tokenisation) — 1,5j
- [ ] Implémenter `MobileMoneyAdapter` pour le marché béninois via FedaPay (doc adr/0011) — 2j
- [ ] Basculer `POST /payments` du provider `manual` vers `stripe`/`mobile_money` selon `method` — 0,5j
- [ ] Revue de sécurité dédiée paiement (aucune donnée de carte ne transite par le backend) — 0,5j
- [ ] Tests d'intégration avec sandbox Stripe + sandbox Mobile Money — 1j

---

## Epic 6 — Réservations & Clients `V1`

### Feature 6.1 — Module `reservations`

🎯 **Livrable** : une réservation peut être prise, confirmée avec assignation de table, annulée ou marquée no-show, sans jamais permettre de double-booking.

- [ ] Modéliser le schéma `reservations` — 0,5j
- [ ] Implémenter le Domain Service `ReservationConflictDetector` — 1j
- [ ] Implémenter `POST/GET/PATCH /reservations` — 1j
- [ ] Implémenter `PATCH /reservations/:id/confirm` (assignation table) — 0,5j
- [ ] Implémenter `POST /reservations/:id/cancel` — 0,5j
- [ ] Implémenter `PATCH /reservations/:id/no-show` — 0,25j
- [ ] Implémenter le cron `reservation-reminder.cron.ts` — 1j
- [ ] Publier les Domain Events `ReservationCreated`/`Cancelled`/`NoShow` — 0,5j
- [ ] Tests de la state machine `Reservation` — 0,5j
- [ ] Écran back-office Réservations — vue du jour + tiroir de conflit — 1,5j

### Feature 6.2 — Module `customers`

🎯 **Livrable** : un client est identifié, son historique de commandes/réservations consultable, et ses points de fidélité s'accumulent automatiquement.

- [ ] Modéliser le schéma `customers` — 0,5j
- [ ] Implémenter `POST/GET/PATCH /customers` — 1j
- [ ] Implémenter `GET /customers/:id/history` (agrégation commandes + réservations) — 1j
- [ ] Implémenter l'incrément de `loyaltyPoints`/`totalSpent`/`visitsCount` sur `PaymentCompleted` — 1j
- [ ] Écran back-office Clients — liste + fiche détail avec ligne sélectionnée — 1,5j

> **Critère de sortie Epic 6** : un client peut être identifié, son historique consulté, et une réservation créée sans conflit possible.

---

## Epic 7 — Expérience Client QR `V1`

### Feature 7.1 — Namespace public (module `qrcode`)

🎯 **Livrable** : le menu et les actions client (appeler serveur, demander l'addition) sont accessibles publiquement via un QR Code, sans exposer aucune donnée du back-office.

- [ ] Implémenter `publicTenant.middleware.ts` (résolution via `qrCodeToken`) — 1j
- [ ] Implémenter le rate limiting dédié aux routes publiques — 0,5j
- [ ] Implémenter `GET /public/qr/:token/menu` + cache Redis `menu:public:{tenantId}` — 1j
- [ ] Implémenter `POST /public/qr/:token/call-waiter` — 0,5j
- [ ] Implémenter `POST /public/qr/:token/request-bill` — 0,5j
- [ ] Gérer les erreurs `410 QR_CODE_REVOKED` / `423 TABLE_OUT_OF_SERVICE` — 0,5j

### Feature 7.2 — Commande client directe (si activée)

🎯 **Livrable** : un client peut, si le restaurant l'autorise, commander et suivre sa commande directement depuis son téléphone.

- [ ] Implémenter le paramètre `restaurants.settings.allowCustomerOrdering` — 0,25j
- [ ] Implémenter `POST /public/qr/:token/orders` — 1j
- [ ] Implémenter `GET /public/qr/:token/orders/:orderId` (suivi) — 0,5j

### Feature 7.3 — Avis (`reviews`)

🎯 **Livrable** : un client laisse un avis après son passage, modéré avant publication.

- [ ] Modéliser le schéma `reviews` — 0,5j
- [ ] Implémenter `POST /public/qr/:token/reviews` — 0,5j
- [ ] Implémenter la modération back-office (`isPublished` toggle) — 0,5j

### Feature 7.4 — Front client

🎯 **Livrable** : l'application client (accueil, menu, suivi, avis, réservation) est utilisable de bout en bout, dans sa langue, sur mobile.

- [ ] Implémenter `CustomerLayout.vue` + code-splitting dédié — 1j
- [ ] Écran Accueil après scan — 1j
- [ ] Écran Menu — filtres allergènes, actions flottantes sémantiques — 1,5j
- [ ] Écran Suivi de commande — 1j
- [ ] Écran Avis (notation accessible en `radiogroup`) — 0,5j
- [ ] Écran Réservation client — 0,5j
- [ ] Sélecteur de langue FR/EN/IT/ES sur l'interface client — 0,5j

> **Critère de sortie Epic 7** : un client scanne un QR Code, consulte le menu dans sa langue, appelle le serveur ou demande l'addition, sans jamais voir le back-office.

---

## Epic 8 — Statistiques, Notifications, Audit `V1`

### Feature 8.1 — Module `statistics`

🎯 **Livrable** : le gérant consulte un dashboard de statistiques (CA, top produits, rentabilité selon le plan) mis à jour en continu.

- [ ] Modéliser `dailyStatistics` — 0,5j
- [ ] Implémenter le worker `statistics.worker.ts` (recalcul incrémental) — 1,5j
- [ ] Implémenter le cron `daily-statistics.cron.ts` (agrégation nocturne) — 1j
- [ ] Implémenter `GET /statistics/dashboard`, `/revenue`, `/top-products`, `/top-waiters` — 1j
- [ ] Implémenter `GET /statistics/profitability` (feature gating Business+) — 1j
- [ ] Implémenter `GET /statistics/trends?granularity=` — 0,5j
- [ ] Écran Statistiques détaillées — graphique + panneau verrouillé par plan — 1,5j

### Feature 8.2 — Module `notifications`

🎯 **Livrable** : chaque utilisateur reçoit les notifications pertinentes à son rôle (stock bas, nouvelle réservation, paiement) et peut gérer ses préférences.

- [ ] Modéliser `notifications` (TTL 90 jours) — 0,5j
- [ ] Implémenter `GET/PATCH /notifications` (+ `read-all`) — 1j
- [ ] Implémenter `GET/PATCH /notifications/preferences` — 0,5j
- [ ] Implémenter le panneau de notifications frontend (composant canonique) — 1j
- [ ] Brancher les handlers Domain Event → notification — 1j

### Feature 8.3 — Module `audit-logs`

🎯 **Livrable** : toute action sensible est tracée et consultable avec le détail avant/après dans un journal d'audit dédié.

- [ ] Modéliser `businessAuditLogs` avec `expiresAt` calculé par catégorie (10 ans finance, 3 ans reste, permanent RGPD, doc 24 §24.4) + index TTL — 0,5j
- [ ] Implémenter le plugin Mongoose `auditable` restreint aux actions sensibles — 1j
- [ ] Implémenter `GET /audit-logs` (filtrable) — 0,5j
- [ ] Écran Journal d'audit — liste + détail avant/après — 1,5j

> **Critère de sortie Epic 8** : le gérant voit ses statistiques, reçoit des notifications pertinentes, et toute action sensible est tracée.

---

## Epic 9 — SaaS : Abonnements, Billing, Plateforme `V1`

### Feature 9.1 — Module `subscriptions` & feature gating

🎯 **Livrable** : un restaurant peut comparer, souscrire et changer de plan ; les fonctionnalités hors plan sont bloquées avec un message d'upgrade clair.

- [ ] Modéliser `subscriptionPlans`/`subscriptions` versionnées — 1j
- [ ] Implémenter le Domain Service `FeatureGateResolver` — 1j
- [ ] Implémenter le middleware de feature gating (`402 PLAN_UPGRADE_REQUIRED`) — 1j
- [ ] Implémenter `GET /subscriptions/plans`, `/subscriptions/me`, `PATCH` upgrade/downgrade — 1j
- [ ] Écran Abonnement & Billing — comparatif de plans — 1,5j

### Feature 9.2 — Module `billing`

🎯 **Livrable** : les factures sont consultables, et un abonnement expiré suspend automatiquement l'accès.

- [ ] Modéliser `invoices` — 0,5j
- [ ] Implémenter `GET /billing/invoices`, `/billing/payment-methods` — 1j
- [ ] Implémenter le cron `subscription-expiry.cron.ts` (suspension automatique) — 1j

### Feature 9.3 — Module `platform-admin`

🎯 **Livrable** : le Super Admin pilote depuis un dashboard dédié tous les restaurants, tous les plans tarifaires, tous les pays, et la conversion de devises, sans intervention manuelle en base.

- [ ] Implémenter `GET/POST/PATCH /platform/restaurants` (provisioning, suspend/reactivate) — 1,5j
- [ ] Implémenter `GET/POST/PATCH /platform/subscription-plans` (CRUD versionné) — 1,5j
- [ ] Implémenter `GET/POST/PATCH /platform/country-defaults` — 1j
- [ ] Implémenter le Currency Conversion Service + cache Redis `fx:rate:*` + cron de rafraîchissement — 1,5j
- [ ] Implémenter `GET /platform/statistics` (cross-tenant) — 1j
- [ ] Écrans Platform Admin — restaurants, plans, pays, statistiques globales — 2j

> **Critère de sortie Epic 9 = fin de la V1 complète** : un restaurant peut s'inscrire, payer et s'auto-gérer sans intervention humaine ; le Super Admin pilote toute la tarification depuis son dashboard.

---

## Epic 10 — Durcissement `V1.5`

### Feature 10.1 — Event-Driven en production

🎯 **Livrable** : les événements métier sont publiés de façon transactionnelle et fiable (outbox), avec garantie de traitement une seule fois.

- [ ] Modéliser la collection `eventOutbox` + `EventBus.publish()` transactionnel — 1j
- [ ] Implémenter le worker `outbox-relay.worker.ts` — 1j
- [ ] Migrer les couplages événementiels simplifiés vers l'Outbox réel — 2j
- [ ] Implémenter l'idempotence des handlers (`processedEvents`) — 1j

### Feature 10.2 — Observabilité

🎯 **Livrable** : l'équipe dispose de métriques, traces et alertes pour diagnostiquer un incident en production sans accès direct à la base.

- [ ] Implémenter les métriques Prometheus `/internal/metrics` — 1j
- [ ] Implémenter le tracing OpenTelemetry (propagation `correlationId`) — 1,5j
- [ ] Implémenter `GET /health/deep` — 0,5j
- [ ] Brancher Grafana Cloud (logs/métriques/traces) et Sentry (erreurs) + configurer les alertes — 1j

### Feature 10.3 — Cache & Recherche

🎯 **Livrable** : les listes volumineuses se chargent par pagination performante, et une recherche texte fonctionne sur le menu et les clients.

- [ ] Généraliser le cache Redis à tous les modules restants — 1j
- [ ] Implémenter la pagination cursor sur `orders`/`payments`/`notifications`/`audit-logs` — 1,5j
- [ ] Implémenter MongoDB Text Search sur `menuItems`/`customers` — 1j

### Feature 10.4 — Conformité & sécurité renforcée

🎯 **Livrable** : un client peut demander l'effacement de ses données personnelles, les secrets sont gérés hors du code, et un pentest externe ne remonte aucune faille critique ouverte.

- [ ] Implémenter `DELETE /customers/:id/personal-data` (export/anonymisation) — 1j
- [ ] Outiller le Secrets Management avec Infisical — 1j
- [ ] Implémenter le multi-site pour le plan Premium — 1,5j
- [ ] Pentest externe + corrections — _hors granularité 1j_

> **Critère de sortie Epic 10 = V1.5** : SLA 99,9 % tenu sur 3 mois, pentest sans faille critique ouverte.

---

## Epic 11 — Parité marché `V2` _(provisoire — contenu à confirmer avec le Product Owner)_

_Correction du 2026-07-13 : split bill et pourboires retirés de cette liste — déjà remontés au MVP (Epic 5)._

### Feature 11.1 — Impression ticket physique (ESC/POS)

🎯 **Livrable** : chaque commande envoyée en cuisine et chaque paiement encaissé déclenchent une impression physique automatique.

- [ ] Étudier le protocole ESC/POS et sélectionner le mode d'intégration — 1j
- [ ] Implémenter le service d'impression cuisine (sur `OrderSentToKitchen`) — 1,5j
- [ ] Implémenter l'impression de reçu caisse (sur `PaymentCompleted`) — 1j
- [ ] Écran Paramètres — configuration imprimante(s) — 1j

### Feature 11.2 — TVA multi-taux & export comptable

🎯 **Livrable** : la comptabilité du restaurant peut exporter ses données avec une TVA correctement ventilée par taux.

- [ ] Étendre `restaurants.taxSettings[]` pour plusieurs taux par catégorie — 1j
- [ ] Implémenter le calcul de taxe par ligne de commande (`PricingService`) — 1j
- [ ] Implémenter l'export comptable (format à définir avec le PO) — 1,5j

### Feature 11.3 — API publique & Webhooks (plan Premium)

🎯 **Livrable** : un intégrateur tiers peut consommer l'API QuickTable avec sa propre clé et recevoir des webhooks en temps réel.

- [ ] Générer la documentation OpenAPI publique depuis les schémas Zod — 1j
- [ ] Implémenter la gestion de clés API (scoping, rate limiting dédié) — 1,5j
- [ ] Implémenter le système de webhooks sortants (signature HMAC, retry) — 2j

### Feature 11.4 — Mode offline / resynchronisation

🎯 **Livrable** : le poste serveur continue de fonctionner sans connexion et se resynchronise automatiquement au retour du réseau.

- [ ] Étudier la stratégie de synchronisation (Service Worker + IndexedDB) — 1j
- [ ] Implémenter la file d'actions en attente (queue locale) — 2j
- [ ] Implémenter la résolution de conflit à la reconnexion — 1,5j

### Feature 11.5 — Fidélité structurée & Promotions

🎯 **Livrable** : le gérant configure des paliers de fidélité et des promotions/coupons appliqués automatiquement en caisse.

- [ ] Modéliser les paliers de fidélité et règles de récompense — 1j
- [ ] Implémenter le moteur de promotions/coupons/happy hours — 2j
- [ ] Écrans back-office correspondants — 1,5j

---

## Epic 12 — Différenciation `V3` _(provisoire — dépend des retours V2)_

- [ ] Menus multi-langue — traduction du contenu métier, modèle de données, interface de traduction (~4-5j)
- [ ] Marketplace d'intégrations — registre d'intégrations tierces au-dessus de l'API publique (~5j+)
- [ ] App mobile native serveur — projet à part entière (React Native/Flutter à évaluer)
- [ ] Silo Enterprise — routage `clusterId` + automatisation du provisioning dédié (~3j)
- [ ] IA prévisionnelle — projet data science à part entière
- [ ] Certification SOC 2 — démarche organisationnelle, hors granularité de développement

---

## Dépendances entre Epics

```
Epic 0 → Epic 1 → Epic 2 → Epic 3 → Epic 4 → Epic 5
                     ↓                  ↓        ↓
                  Epic 6 ──────────→ Epic 7   Epic 8
                     ↓                          ↓
                  Epic 1 ──────────────────→ Epic 9
                                                 ↓
                                             Epic 10
                                                 ↓
                                             Epic 11
                                                 ↓
                                             Epic 12
```

Détail complet et diagramme Mermaid : `docs/architecture/34-backlog-epics-features.md` §34.15.
