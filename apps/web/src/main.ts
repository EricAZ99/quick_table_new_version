import { createPinia } from 'pinia';
import { createApp } from 'vue';

import './assets/tokens.css';
import App from './App.vue';
import { i18n } from './plugins/i18n.plugin';

// Pinia (doc 03 §3.2) introduit ici : premier état réellement partagé entre
// plusieurs composants (`LoginScreen`/`RestaurantSettingsScreen`, Feature
// 2.1, `stores/auth.store.ts`). Le Router, lui, reste absent — l'app ne
// bascule qu'entre deux états (connecté / non connecté), une simple
// condition dans `App.vue` suffit, aucune navigation par URL distincte n'est
// encore nécessaire.
createApp(App).use(i18n).use(createPinia()).mount('#app');
