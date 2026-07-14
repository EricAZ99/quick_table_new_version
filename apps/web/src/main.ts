import { createApp } from 'vue';

import App from './App.vue';

// Router, Pinia, i18n et les autres plugins (doc 03 §3.2) sont enregistrés
// ici au fil des tickets qui les introduisent (Epic 1 pour Router/Pinia,
// Feature 0.4 pour i18n) — volontairement absents de ce ticket d'amorçage.
createApp(App).mount('#app');
