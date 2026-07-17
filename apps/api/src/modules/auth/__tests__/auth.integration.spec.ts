import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { generate } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../../config/redis.js';
import { connectEmailQueue, disconnectEmailQueue, getEmailQueue } from '../../../jobs/queues.js';
import { MembershipModel } from '../../../database/models/membership.model.js';
import { PasswordResetTokenModel } from '../../../database/models/passwordResetToken.model.js';
import { RefreshTokenModel } from '../../../database/models/refreshToken.model.js';
import { UserModel } from '../../../database/models/user.model.js';
import { generatePasswordResetToken, hashPasswordResetToken } from '../passwordResetToken.util.js';

// Même convention que hello-world.integration.spec.ts (doc 14 §14.6).
const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const redisUrl = process.env.REDIS_URL;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && redisUrl && jwtSecret);

// Ce fichier grandit à chaque nouveau ticket auth (login, 2FA, sessions...)
// et chaque test enchaîne plusieurs aller-retours HTTP réels contre
// MongoDB Atlas/Redis Upstash — le défaut vitest (5s) devenait trop court
// au fur et à mesure, faisant échouer un test différent à chaque run selon
// la latence réseau du moment plutôt qu'un vrai bug applicatif.
vi.setConfig({ testTimeout: 15000 });

interface SuccessBody {
  success: true;
  data: {
    accessToken: string;
    user: { email: string; passwordHash?: string };
    tenants: { tenantId: string; role: string; membershipId: string }[];
  };
}
interface RefreshBody {
  success: true;
  data: { accessToken: string };
}
interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

function extractRefreshTokenCookie(setCookieHeader: string[]): string {
  const cookie = setCookieHeader.find((c) => c.startsWith('refreshToken='));
  if (!cookie) {
    throw new Error('Aucun cookie refreshToken trouvé dans la réponse — bug dans le test lui-même');
  }
  return cookie.split(';')[0] ?? '';
}

/**
 * `queue.add()` est attendu par `AuthService` avant que la réponse HTTP ne
 * parte (donc le job est déjà écrit quand le test lit la réponse), mais
 * cette suite tourne contre un vrai Redis managé (Upstash) partagé avec
 * beaucoup d'autres commandes concurrentes (rate limiting, autres tests) —
 * un court polling absorbe une éventuelle latence de visibilité plutôt que
 * de supposer un bug applicatif sur un simple flake d'infra.
 */
async function waitForEmailJobTo(recipient: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const jobs = await getEmailQueue().getJobs(['waiting', 'delayed', 'active', 'completed']);
    if (jobs.some((job) => job.data.to === recipient)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * Intégration Express réelle bout en bout (doc 12, Feature 1.2) :
 * HTTP -> controller -> service -> Argon2id -> repositories -> vrai
 * MongoDB Atlas + vrai Redis Upstash (rate limiting), pas des mocks.
 */
describe.skipIf(!hasRealCredentials)('POST /api/v1/auth/login — intégration réelle', () => {
  const password = 'un-mot-de-passe-de-test-solide';
  let email: string;

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await connectRedis(redisUrl as string);
    connectEmailQueue(redisUrl as string);
  });

  afterAll(async () => {
    const testUsers = await UserModel.find({ email: /^auth-integration-/ });
    await RefreshTokenModel.deleteMany({ userId: { $in: testUsers.map((u) => u._id) } });
    await PasswordResetTokenModel.deleteMany({ userId: { $in: testUsers.map((u) => u._id) } });
    await UserModel.collection.deleteMany({ email: /^auth-integration-/ });
    await MembershipModel.collection.deleteMany({ tenantId: 'auth-integration-tenant' });
    // Aucun worker ne consomme la queue pendant ces tests (doc 12 §12.5,
    // le worker est un process séparé) — sans ce nettoyage, les jobs
    // `waiting` s'accumuleraient indéfiniment sur la vraie instance Redis
    // d'un run de test à l'autre.
    await getEmailQueue().drain(true);
    await disconnectDatabase();
    await disconnectRedis();
    await disconnectEmailQueue();
  });

  beforeAll(() => {
    email = `auth-integration-${Date.now()}@quicktable.io`;
  });

  it('connecte avec succès un utilisateur avec un seul membership, résout automatiquement le tenant', async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await UserModel.create({ email, passwordHash, fullName: 'Intégration Login' });
    await MembershipModel.create({
      tenantId: 'auth-integration-tenant',
      userId: user._id,
      role: 'waiter',
    });

    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email, password });
    const body = response.body as SuccessBody;

    expect(response.status).toBe(200);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.passwordHash).toBeUndefined();
    expect(body.data.tenants).toHaveLength(1);
    expect(body.data.tenants[0]).toMatchObject({
      tenantId: 'auth-integration-tenant',
      role: 'waiter',
    });
    expect(typeof body.data.tenants[0]?.membershipId).toBe('string');

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((cookie) => cookie.startsWith('refreshToken='))).toBe(true);
    expect(setCookie.some((cookie) => /httponly/i.test(cookie))).toBe(true);
  });

  it('rejette un mot de passe incorrect avec un code générique (401 AUTH_INVALID_CREDENTIALS)', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejette un email inconnu avec le même code générique (anti-énumération)', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: `inconnu-${Date.now()}@quicktable.io`, password });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejette un payload invalide en 400 AUTH_INVALID_PAYLOAD', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'pas-un-email' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('AUTH_INVALID_PAYLOAD');
  });

  it('verrouille progressivement après 5 tentatives échouées (doc 07 §7.8, doc 13 §13.2)', async () => {
    const lockedEmail = `auth-integration-ratelimit-${Date.now()}@quicktable.io`;
    const app = createApp();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: lockedEmail, password: 'toujours-faux' });
      expect(response.status).toBe(401);
    }

    const sixthAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: lockedEmail, password: 'toujours-faux' });
    const body = sixthAttempt.body as ErrorBody;

    expect(sixthAttempt.status).toBe(429);
    expect(body.error.code).toBe('AUTH_LOGIN_RATE_LIMITED');
  }, 20000);

  describe('POST /api/v1/auth/refresh', () => {
    it('effectue la rotation : émet un nouveau couple access/refresh token, reprend le même contexte tenant', async () => {
      const refreshEmail = `auth-integration-refresh-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: refreshEmail,
        passwordHash,
        fullName: 'Intégration Refresh',
      });
      await MembershipModel.create({
        tenantId: 'auth-integration-tenant',
        userId: user._id,
        role: 'manager',
      });

      const app = createApp();
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: refreshEmail, password });
      const loginBody = loginResponse.body as SuccessBody;
      const oldRefreshTokenCookie = extractRefreshTokenCookie(
        loginResponse.headers['set-cookie'] as unknown as string[],
      );

      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldRefreshTokenCookie)
        .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
        .send();
      const refreshBody = refreshResponse.body as RefreshBody;

      expect(refreshResponse.status).toBe(200);
      expect(refreshBody.data.accessToken).toEqual(expect.any(String));
      // Le contexte tenant doit être repris tel quel (doc 06 §6.3) — on
      // compare les claims décodés, pas la chaîne du token : les deux
      // tokens peuvent être byte-identiques si login et refresh tombent
      // dans la même seconde (`iat`/`exp` ont une granularité à la
      // seconde), ce qui n'est ni un bug ni un problème de sécurité (seule
      // la rotation du refresh token, vérifiée ci-dessous, importe).
      expect(jwt.decode(refreshBody.data.accessToken)).toMatchObject({
        tenantId: 'auth-integration-tenant',
        role: 'manager',
      });

      const newRefreshTokenCookie = extractRefreshTokenCookie(
        refreshResponse.headers['set-cookie'] as unknown as string[],
      );
      expect(newRefreshTokenCookie).not.toBe(oldRefreshTokenCookie);
    });

    it('rejette le rejeu du refresh token déjà utilisé (401 AUTH_REFRESH_TOKEN_REUSED) et révoque toute la famille de sessions', async () => {
      const reuseEmail = `auth-integration-reuse-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: reuseEmail,
        passwordHash,
        fullName: 'Intégration Reuse',
      });
      await MembershipModel.create({
        tenantId: 'auth-integration-tenant',
        userId: user._id,
        role: 'cashier',
      });

      const app = createApp();
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: reuseEmail, password });
      const loginBody = loginResponse.body as SuccessBody;
      const oldRefreshTokenCookie = extractRefreshTokenCookie(
        loginResponse.headers['set-cookie'] as unknown as string[],
      );

      // Premier refresh : légitime, fait tourner le token.
      const firstRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldRefreshTokenCookie)
        .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
        .send();
      expect(firstRefresh.status).toBe(200);

      // Rejeu de l'ancien token (déjà révoqué par la rotation ci-dessus) :
      // signe de vol (doc 07 §7.1), doit révoquer toute la famille.
      const replay = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldRefreshTokenCookie)
        .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
        .send();
      const replayBody = replay.body as ErrorBody;

      expect(replay.status).toBe(401);
      expect(replayBody.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');

      const activeSessions = await RefreshTokenModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      });
      expect(activeSessions).toBe(0);
    });

    it('rejette une requête sans cookie refreshToken ni Access Token (401 AUTH_REFRESH_TOKEN_INVALID)', async () => {
      const response = await request(createApp()).post('/api/v1/auth/refresh').send();
      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('révoque la session courante en base et efface le cookie refreshToken', async () => {
      const logoutEmail = `auth-integration-logout-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: logoutEmail,
        passwordHash,
        fullName: 'Intégration Logout',
      });
      await MembershipModel.create({
        tenantId: 'auth-integration-tenant',
        userId: user._id,
        role: 'waiter',
      });

      const app = createApp();
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: logoutEmail, password });
      const refreshTokenCookie = extractRefreshTokenCookie(
        loginResponse.headers['set-cookie'] as unknown as string[],
      );

      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', refreshTokenCookie)
        .send();

      expect(logoutResponse.status).toBe(204);
      const clearedCookie = (logoutResponse.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith('refreshToken='),
      );
      expect(clearedCookie).toMatch(/refreshToken=;/);

      const activeSessions = await RefreshTokenModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      });
      expect(activeSessions).toBe(0);
    });

    it('reste idempotent (204) sans cookie refreshToken', async () => {
      const response = await request(createApp()).post('/api/v1/auth/logout').send();

      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    // Verrouillage par IP seule (doc 13 §13.2 : 3/h) — sans ce nettoyage,
    // des exécutions répétées de la suite depuis la même machine (même IP)
    // épuiseraient le quota entre les runs et ce bloc deviendrait flaky,
    // indépendamment du code applicatif.
    beforeAll(async () => {
      const keys = await getRedisClient().keys('auth:forgot-password-rl:*');
      if (keys.length > 0) {
        await getRedisClient().del(keys);
      }
    });

    it("génère et stocke réellement un token quand l'email existe (200, réponse identique dans les deux cas)", async () => {
      const forgotEmail = `auth-integration-forgot-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: forgotEmail,
        passwordHash,
        fullName: 'Intégration Forgot',
      });

      const response = await request(createApp())
        .post('/api/v1/auth/forgot-password')
        .send({ email: forgotEmail });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });

      const storedTokens = await PasswordResetTokenModel.find({ userId: user._id });
      expect(storedTokens).toHaveLength(1);
      expect(storedTokens[0]?.usedAt).toBeNull();

      // Vérifie que l'email de réinitialisation a bien été enfilé sur la
      // vraie queue BullMQ/Redis (pas juste que le token a été stocké).
      expect(await waitForEmailJobTo(forgotEmail)).toBe(true);
    });

    it('répond de façon identique (200, data:null) pour un email inconnu — anti-énumération, aucun token créé', async () => {
      const countBefore = await PasswordResetTokenModel.countDocuments({});

      const response = await request(createApp())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `jamais-vu-forgot-${Date.now()}@quicktable.io` });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
      expect(await PasswordResetTokenModel.countDocuments({})).toBe(countBefore);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('change réellement le mot de passe, marque le token utilisé, révoque toutes les sessions actives', async () => {
      const resetEmail = `auth-integration-reset-${Date.now()}@quicktable.io`;
      const oldPasswordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: resetEmail,
        passwordHash: oldPasswordHash,
        fullName: 'Intégration Reset',
      });
      await MembershipModel.create({
        tenantId: 'auth-integration-tenant',
        userId: user._id,
        role: 'waiter',
      });

      const app = createApp();
      // Session active avant reset, pour vérifier qu'elle est bien révoquée après.
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resetEmail, password });
      expect(loginResponse.status).toBe(200);

      const rawResetToken = generatePasswordResetToken();
      await PasswordResetTokenModel.create({
        userId: user._id,
        tokenHash: hashPasswordResetToken(rawResetToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const newPassword = 'un-nouveau-mot-de-passe-solide';
      const resetResponse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawResetToken, newPassword });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body).toEqual({ success: true, data: null });

      // L'ancien mot de passe ne fonctionne plus, le nouveau si.
      const loginWithOldPassword = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resetEmail, password });
      expect(loginWithOldPassword.status).toBe(401);

      const loginWithNewPassword = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resetEmail, password: newPassword });
      expect(loginWithNewPassword.status).toBe(200);

      const usedToken = await PasswordResetTokenModel.findOne({
        tokenHash: hashPasswordResetToken(rawResetToken),
      });
      expect(usedToken?.usedAt).not.toBeNull();

      const activeSessions = await RefreshTokenModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      });
      // Toutes les sessions d'avant le reset sont révoquées ; seule la
      // nouvelle session issue de `loginWithNewPassword` ci-dessus reste active.
      expect(activeSessions).toBe(1);

      expect(await waitForEmailJobTo(resetEmail)).toBe(true);
    });

    it('rejette un token inconnu (401 AUTH_RESET_TOKEN_INVALID)', async () => {
      const response = await request(createApp())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'token-jamais-emis', newPassword: 'un-nouveau-mdp-solide' });
      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
    });

    it('rejette le rejeu du même token de reset déjà utilisé (usage unique)', async () => {
      const reuseEmail = `auth-integration-reset-reuse-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await UserModel.create({
        email: reuseEmail,
        passwordHash,
        fullName: 'Intégration Reset Reuse',
      });
      const rawResetToken = generatePasswordResetToken();
      await PasswordResetTokenModel.create({
        userId: user._id,
        tokenHash: hashPasswordResetToken(rawResetToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const app = createApp();
      const firstReset = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawResetToken, newPassword: 'un-premier-nouveau-mdp' });
      expect(firstReset.status).toBe(200);

      const secondReset = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawResetToken, newPassword: 'un-second-nouveau-mdp' });
      const body = secondReset.body as ErrorBody;

      expect(secondReset.status).toBe(401);
      expect(body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
    });

    it('rejette un payload invalide (mot de passe trop court) en 400 AUTH_INVALID_PAYLOAD', async () => {
      const response = await request(createApp())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'peu-importe', newPassword: 'court' });
      const body = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('AUTH_INVALID_PAYLOAD');
    });
  });

  describe('POST /api/v1/auth/2fa/* — activation, login avec 2FA, désactivation', () => {
    interface EnableBody {
      success: true;
      data: { qrCodeDataUrl: string; secret: string; recoveryCodes: string[] };
    }
    interface TwoFactorLoginBody {
      success: true;
      data: { requires2FA?: true; accessToken?: string; challengeToken?: string };
    }

    async function createUserAndLogin(app: ReturnType<typeof createApp>) {
      const twoFactorEmail = `auth-integration-2fa-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.create({
        email: twoFactorEmail,
        passwordHash,
        fullName: 'Intégration 2FA',
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const loginBody = loginResponse.body as SuccessBody;

      return { twoFactorEmail, accessToken: loginBody.data.accessToken };
    }

    it('active réellement la 2FA (enable + confirm), puis exige un challenge au login suivant, vérifiable par un vrai code TOTP', async () => {
      const app = createApp();
      const { twoFactorEmail, accessToken } = await createUserAndLogin(app);

      const enableResponse = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();
      const enableBody = enableResponse.body as EnableBody;

      expect(enableResponse.status).toBe(200);
      expect(enableBody.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(enableBody.data.recoveryCodes).toHaveLength(10);

      const totpCode = await generate({ secret: enableBody.data.secret });
      const confirmResponse = await request(app)
        .post('/api/v1/auth/2fa/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: totpCode });
      expect(confirmResponse.status).toBe(200);

      const userAfterConfirm = await UserModel.findOne({ email: twoFactorEmail });
      expect(userAfterConfirm?.twoFactorEnabled).toBe(true);

      // doc 07 §7.7 : confirmer la 2FA révoque toutes les sessions actives
      // — l'Access Token émis au login initial reste valide 15 minutes
      // (JWT stateless), mais le refresh token de cette session est révoqué.
      const activeSessions = await RefreshTokenModel.countDocuments({
        userId: userAfterConfirm?._id,
        revokedAt: null,
      });
      expect(activeSessions).toBe(0);

      const secondLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const secondLoginBody = secondLoginResponse.body as TwoFactorLoginBody;

      expect(secondLoginResponse.status).toBe(200);
      expect(secondLoginBody.data.requires2FA).toBe(true);
      expect(secondLoginBody.data.accessToken).toBeUndefined();
      expect(secondLoginResponse.headers['set-cookie']).toBeUndefined();

      const verifyCode = await generate({ secret: enableBody.data.secret });
      const verifyResponse = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: secondLoginBody.data.challengeToken, code: verifyCode });
      const verifyBody = verifyResponse.body as SuccessBody;

      expect(verifyResponse.status).toBe(200);
      expect(verifyBody.data.accessToken).toEqual(expect.any(String));
      const setCookie = verifyResponse.headers['set-cookie'] as unknown as string[];
      expect(setCookie.some((cookie) => cookie.startsWith('refreshToken='))).toBe(true);

      expect(await waitForEmailJobTo(twoFactorEmail)).toBe(true);
    });

    it('rejette /2fa/verify avec un code incorrect (401 AUTH_2FA_INVALID_CODE)', async () => {
      const app = createApp();
      const { twoFactorEmail, accessToken } = await createUserAndLogin(app);
      const enableResponse = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();
      const enableBody = enableResponse.body as EnableBody;
      const totpCode = await generate({ secret: enableBody.data.secret });
      await request(app)
        .post('/api/v1/auth/2fa/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: totpCode });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const loginBody = loginResponse.body as TwoFactorLoginBody;

      const verifyResponse = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: loginBody.data.challengeToken, code: '000000' });
      const verifyBody = verifyResponse.body as ErrorBody;

      expect(verifyResponse.status).toBe(401);
      expect(verifyBody.error.code).toBe('AUTH_2FA_INVALID_CODE');
    });

    it('accepte un code de récupération à la place du TOTP, et le rend inutilisable une seconde fois', async () => {
      const app = createApp();
      const { twoFactorEmail, accessToken } = await createUserAndLogin(app);
      const enableResponse = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();
      const enableBody = enableResponse.body as EnableBody;
      const totpCode = await generate({ secret: enableBody.data.secret });
      await request(app)
        .post('/api/v1/auth/2fa/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: totpCode });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const loginBody = loginResponse.body as TwoFactorLoginBody;
      const recoveryCode = enableBody.data.recoveryCodes[0] as string;

      const firstVerify = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: loginBody.data.challengeToken, code: recoveryCode });
      expect(firstVerify.status).toBe(200);

      // Un second challenge (nouveau login) tente de réutiliser le même code de récupération.
      const secondLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const secondLoginBody = secondLoginResponse.body as TwoFactorLoginBody;

      const secondVerify = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken: secondLoginBody.data.challengeToken, code: recoveryCode });
      const secondVerifyBody = secondVerify.body as ErrorBody;

      expect(secondVerify.status).toBe(401);
      expect(secondVerifyBody.error.code).toBe('AUTH_2FA_INVALID_CODE');
    });

    it('désactive réellement la 2FA (password + code), un login suivant redevient direct', async () => {
      const app = createApp();
      const { twoFactorEmail, accessToken } = await createUserAndLogin(app);
      const enableResponse = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();
      const enableBody = enableResponse.body as EnableBody;
      const confirmCode = await generate({ secret: enableBody.data.secret });
      await request(app)
        .post('/api/v1/auth/2fa/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: confirmCode });

      const disableCode = await generate({ secret: enableBody.data.secret });
      const disableResponse = await request(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password, code: disableCode });
      expect(disableResponse.status).toBe(200);

      const userAfterDisable = await UserModel.findOne({ email: twoFactorEmail });
      expect(userAfterDisable?.twoFactorEnabled).toBe(false);

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: twoFactorEmail, password });
      const loginBody = loginResponse.body as TwoFactorLoginBody;

      expect(loginBody.data.requires2FA).toBeUndefined();
      expect(loginBody.data.accessToken).toEqual(expect.any(String));
    });

    it('rejette /2fa/enable sans Access Token (401 AUTH_TOKEN_MISSING)', async () => {
      const response = await request(createApp()).post('/api/v1/auth/2fa/enable').send();
      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_TOKEN_MISSING');
    });
  });

  describe('GET/DELETE /api/v1/auth/sessions — gestion des sessions', () => {
    interface SessionsBody {
      success: true;
      data: {
        sessions: {
          id: string;
          deviceInfo: { userAgent?: string; ip?: string };
          isCurrent: boolean;
        }[];
      };
    }

    async function loginAs(
      app: ReturnType<typeof createApp>,
      sessionEmail: string,
      userAgent: string,
    ) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', userAgent)
        .send({ email: sessionEmail, password });
      const body = response.body as SuccessBody;
      const setCookie = response.headers['set-cookie'] as unknown as string[];
      return {
        accessToken: body.data.accessToken,
        refreshTokenCookie: extractRefreshTokenCookie(setCookie),
      };
    }

    it('liste les sessions actives avec deviceInfo, marque isCurrent sur celle de la requête courante', async () => {
      const app = createApp();
      const sessionsEmail = `auth-integration-sessions-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.create({
        email: sessionsEmail,
        passwordHash,
        fullName: 'Intégration Sessions',
      });

      const deviceA = await loginAs(app, sessionsEmail, 'device-A-agent');
      await loginAs(app, sessionsEmail, 'device-B-agent');

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      const body = response.body as SessionsBody;

      expect(response.status).toBe(200);
      expect(body.data.sessions).toHaveLength(2);
      const current = body.data.sessions.find((s) => s.isCurrent);
      expect(current?.deviceInfo.userAgent).toBe('device-A-agent');
      expect(body.data.sessions.filter((s) => !s.isCurrent)).toHaveLength(1);
    });

    it('révoque une session spécifique par id, qui disparaît ensuite de la liste', async () => {
      const app = createApp();
      const sessionsEmail = `auth-integration-sessions-revoke-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.create({
        email: sessionsEmail,
        passwordHash,
        fullName: 'Intégration Sessions Revoke',
      });

      const deviceA = await loginAs(app, sessionsEmail, 'device-A-agent');
      await loginAs(app, sessionsEmail, 'device-B-agent');

      const listBefore = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      const bodyBefore = listBefore.body as SessionsBody;
      const deviceBSession = bodyBefore.data.sessions.find((s) => !s.isCurrent);

      const deleteResponse = await request(app)
        .delete(`/api/v1/auth/sessions/${deviceBSession?.id}`)
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      expect(deleteResponse.status).toBe(204);

      const listAfter = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      const bodyAfter = listAfter.body as SessionsBody;

      expect(bodyAfter.data.sessions).toHaveLength(1);
      expect(bodyAfter.data.sessions[0]?.isCurrent).toBe(true);
    });

    it("rejette (404 anti-IDOR) la révocation d'une session appartenant à un autre utilisateur", async () => {
      const app = createApp();
      const userAEmail = `auth-integration-sessions-idor-a-${Date.now()}@quicktable.io`;
      const userBEmail = `auth-integration-sessions-idor-b-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.create({ email: userAEmail, passwordHash, fullName: 'Intégration IDOR A' });
      await UserModel.create({ email: userBEmail, passwordHash, fullName: 'Intégration IDOR B' });

      const userA = await loginAs(app, userAEmail, 'device-A-agent');
      const userB = await loginAs(app, userBEmail, 'device-B-agent');

      const userBSessions = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .set('Cookie', userB.refreshTokenCookie);
      const userBSessionId = (userBSessions.body as SessionsBody).data.sessions[0]?.id;

      const response = await request(app)
        .delete(`/api/v1/auth/sessions/${userBSessionId}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .set('Cookie', userA.refreshTokenCookie);
      const body = response.body as ErrorBody;

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('AUTH_SESSION_NOT_FOUND');
    });

    it('révoque toutes les autres sessions (garde uniquement la session courante)', async () => {
      const app = createApp();
      const sessionsEmail = `auth-integration-sessions-others-${Date.now()}@quicktable.io`;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.create({
        email: sessionsEmail,
        passwordHash,
        fullName: 'Intégration Sessions Others',
      });

      const deviceA = await loginAs(app, sessionsEmail, 'device-A-agent');
      await loginAs(app, sessionsEmail, 'device-B-agent');
      await loginAs(app, sessionsEmail, 'device-C-agent');

      const deleteResponse = await request(app)
        .delete('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      expect(deleteResponse.status).toBe(204);

      const listAfter = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${deviceA.accessToken}`)
        .set('Cookie', deviceA.refreshTokenCookie);
      const bodyAfter = listAfter.body as SessionsBody;

      expect(bodyAfter.data.sessions).toHaveLength(1);
      expect(bodyAfter.data.sessions[0]?.isCurrent).toBe(true);
    });

    it('rejette GET /sessions sans Access Token (401 AUTH_TOKEN_MISSING)', async () => {
      const response = await request(createApp()).get('/api/v1/auth/sessions');
      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_TOKEN_MISSING');
    });
  });
});
