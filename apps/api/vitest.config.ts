import { defineConfig } from 'vitest/config';

/**
 * Absent jusqu'ici (Vitest tournait sur ses défauts). Introduit pour
 * désactiver le parallélisme entre fichiers de test (doc 14 §14.5) :
 * ~70 fichiers, dont une soixantaine de tests d'intégration réels contre
 * MongoDB Atlas M0 (staging, doc 02 §2.7) et Redis Upstash — tous deux en
 * tier gratuit, capacité modeste — exécutés en parallèle par défaut par
 * Vitest, dépassaient régulièrement cette capacité en fin de run complet.
 * Symptôme observé (pas un bug de code, reproduit sur plusieurs runs
 * consécutifs, locaux et CI, un fichier différent à chaque fois) : des
 * échecs intermittents et non reproductibles (`Cannot read properties of
 * undefined`/`AssertionError` sur des données attendues d'un appel HTTP ou
 * d'une lecture juste après écriture réels). `fileParallelism: false` fait
 * tourner les fichiers de test en série — la suite est plus lente, mais la
 * charge simultanée sur l'infra partagée reste bornée, éliminant la classe
 * de flakiness observée à la source plutôt que de la contourner par des
 * relances répétées.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
