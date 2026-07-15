import { createApp } from 'vue';

import App from './App.vue';
import { i18n } from './plugins/i18n.plugin';

// Router et Pinia (doc 03 §3.2) arrivent avec l'Epic 1 — volontairement
// absents de ce ticket.
createApp(App).use(i18n).mount('#app');
