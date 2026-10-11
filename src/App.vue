<script setup lang="ts">
import { onMounted } from 'vue'
import NotificationToast from './components/common/NotificationToast.vue'
import MentionUserModal from './components/chat/MentionUserModal.vue'
import AvatarPreviewModal from './components/common/AvatarPreviewModal.vue'
import { notificationService } from './services/notifications'

onMounted(() => {
  notificationService.autoRequestPermissionOnFirstOpen()
})
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden bg-[#8ea6b4] dark:bg-[#0e1621] font-sans antialiased">
    <!-- Router View for Page Components -->
    <router-view />

    <!-- Global In-App Notification Toast Banner -->
    <NotificationToast />

    <!-- Global User Mention Click Confirmation Modal -->
    <MentionUserModal />

    <!-- Global Full-Screen Avatar Preview Modal -->
    <AvatarPreviewModal />
  </div>
</template>
