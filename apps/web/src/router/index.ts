import { createRouter, createWebHashHistory } from 'vue-router';

import EmployeesScreen from '@/components/employees/EmployeesScreen.vue';
import RestaurantSettingsScreen from '@/components/restaurant/RestaurantSettingsScreen.vue';

/**
 * Introduit avec ce ticket (Feature 2.2, écran Employés) : décision validée
 * avec toi — l'app passe de 1 à 2 écrans authentifiés adressables, le point
 * de bascule que doc 11 §11.5 anticipait déjà pour un vrai Router. Reste
 * minimal (2 routes) : le découpage en modules lazy-loadés par domaine que
 * documente doc 11 §11.5 est reporté jusqu'à en avoir réellement besoin
 * (doc 14 §14.5 KISS).
 *
 * `createWebHashHistory` plutôt que `createWebHistory` : aucune règle de
 * rewrite SPA (`vercel.json` ou équivalent) n'existe encore côté hébergement
 * — l'historique "hash" (`/#/employees`) fonctionne sans configuration serveur
 * supplémentaire, en dev comme en prod. À reconsidérer si/quand une config
 * de déploiement dédiée est mise en place.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/restaurant' },
    { path: '/restaurant', name: 'restaurant', component: RestaurantSettingsScreen },
    { path: '/employees', name: 'employees', component: EmployeesScreen },
    { path: '/:pathMatch(.*)*', redirect: '/restaurant' },
  ],
});
