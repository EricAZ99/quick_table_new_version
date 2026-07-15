const IPV6_MAPPED_IPV4_PREFIX = '::ffff:';

/**
 * `req.ip` (Express, `trust proxy` activé, `app.ts`) peut renvoyer une IPv4
 * mappée en IPv6 (`::ffff:127.0.0.1`) selon la pile réseau — utilisé
 * partout où l'IP client réelle doit être comparée/transmise telle quelle
 * (géolocalisation IP, doc 35 §35.2 ; clé de rate limiting du login, doc 07
 * §7.8/doc 13 §13.2) : promu ici depuis `modules/restaurants/geolocation.service.ts`
 * dès qu'un deuxième module en a eu besoin (doc 03 : la logique
 * transverse à plusieurs modules vit en `shared/`, pas dans un module qui
 * n'a plus le monopole de son usage).
 */
export function normalizeClientIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }
  return ip.startsWith(IPV6_MAPPED_IPV4_PREFIX) ? ip.slice(IPV6_MAPPED_IPV4_PREFIX.length) : ip;
}
