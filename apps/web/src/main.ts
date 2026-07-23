import { createPinia } from 'pinia';
import { createApp } from 'vue';

import './assets/tokens.css';
import App from './App.vue';
import { i18n } from './plugins/i18n.plugin';
import { router } from './router';

// Pinia (doc 03 §3.2) : état partagé entre plusieurs composants
// (`stores/auth.store.ts`). Router (doc 11 §11.5) : introduit avec le
// ticket "écran Employés", l'app bascule désormais entre deux écrans
// authentifiés adressables (`/restaurant`, `/employees`), pas seulement
// entre connecté/non connecté (toujours géré par une condition dans
// `App.vue`, hors router).
createApp(App).use(i18n).use(createPinia()).use(router).mount('#app');
