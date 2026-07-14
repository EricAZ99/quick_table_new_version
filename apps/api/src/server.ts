import { createApp } from "./app.js";

/**
 * Point d'entrée process de l'API.
 *
 * `PORT` est lu directement ici pour ce ticket d'initialisation ; la Feature
 * 0.2 (`config/env.ts`, validation Zod fail-fast, doc 12 §12.9) remplacera
 * cette lecture ad hoc par la configuration validée centrale.
 */
const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  // Remplacé par le logger structuré pino (doc 12 §12.8) dès la Feature 0.3.
  // eslint-disable-next-line no-console -- pas de logger structuré avant la Feature 0.3
  console.log(`[quicktable-api] démarré sur le port ${PORT}`);
});
