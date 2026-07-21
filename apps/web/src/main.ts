import { createApp } from 'vue';

import './assets/tokens.css';
import App from './App.vue';
import { i18n } from './plugins/i18n.plugin';

// Router et Pinia (doc 03 §3.2) restent volontairement absents : aucun
// ticket construit à ce jour n'en a encore eu besoin (Feature 2.1,
// "Écran d'inscription", reste un composant autonome monté directement
// par App.vue — pas de navigation entre écrans encore à gérer).
createApp(App).use(i18n).mount('#app');
