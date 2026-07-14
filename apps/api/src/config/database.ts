import mongoose from 'mongoose';

/**
 * Point de connexion unique à MongoDB (doc 12 §12.7). Prend l'URI en
 * paramètre plutôt que de lire `getEnv()` en interne : découple ce module
 * de la configuration globale (doc 14 §14.4, Dependency Inversion), et
 * évite qu'un test unitaire de la connexion n'ait besoin d'un `.env` réel.
 *
 * Le dimensionnement du pool reste aux défauts Mongoose (`maxPoolSize: 100`)
 * tant qu'aucun palier de doc 18 ne justifie de le retoucher — pas
 * d'optimisation prématurée (doc 14 §14.5).
 */
export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  return mongoose.connect(uri);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
