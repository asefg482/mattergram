import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../components/auth/LoginView.vue'
import ChatView from '../views/ChatView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresGuest: true }
  },
  {
    path: '/',
    name: 'home',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/c/:channelId',
    name: 'chat',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/c/:channelId/settings',
    name: 'chat-settings',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

let authInitialized = false

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  if (!authInitialized) {
    await authStore.initAuth()
    authInitialized = true
  }

  const isAuth = authStore.isAuthenticated

  if (to.meta.requiresAuth && !isAuth) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (to.meta.requiresGuest && isAuth) {
    const redirect = (to.query.redirect as string) || '/'
    return next(redirect)
  }

  next()
})

export default router
