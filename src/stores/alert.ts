import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AlertType = 'info' | 'success' | 'warning' | 'error'

export interface AlertOptions {
  title?: string
  message: string
  type?: AlertType
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  isDestructive?: boolean
}

export const useAlertStore = defineStore('alert', () => {
  const isOpen = ref(false)
  const title = ref('')
  const message = ref('')
  const type = ref<AlertType>('info')
  const confirmText = ref('OK')
  const cancelText = ref('Cancel')
  const showCancel = ref(false)
  const isDestructive = ref(false)

  let resolvePromise: ((value: boolean) => void) | null = null

  function showAlert(msg: string, options?: Partial<AlertOptions>): Promise<boolean> {
    message.value = msg || ''
    title.value =
      options?.title ||
      (options?.type === 'error'
        ? 'Error'
        : options?.type === 'warning'
        ? 'Warning'
        : options?.type === 'success'
        ? 'Success'
        : 'Notice')
    type.value = options?.type || 'info'
    confirmText.value = options?.confirmText || 'OK'
    cancelText.value = options?.cancelText || 'Cancel'
    showCancel.value = options?.showCancel ?? false
    isDestructive.value = options?.isDestructive ?? false
    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function showConfirm(msg: string, options?: Partial<AlertOptions>): Promise<boolean> {
    return showAlert(msg, {
      title: options?.title || 'Confirmation',
      type: options?.type || (options?.isDestructive ? 'error' : 'warning'),
      confirmText: options?.confirmText || 'Confirm',
      cancelText: options?.cancelText || 'Cancel',
      showCancel: true,
      isDestructive: options?.isDestructive ?? false,
      ...options
    })
  }

  function handleConfirm() {
    isOpen.value = false
    if (resolvePromise) {
      resolvePromise(true)
      resolvePromise = null
    }
  }

  function handleCancel() {
    isOpen.value = false
    if (resolvePromise) {
      resolvePromise(false)
      resolvePromise = null
    }
  }

  return {
    isOpen,
    title,
    message,
    type,
    confirmText,
    cancelText,
    showCancel,
    isDestructive,
    showAlert,
    showConfirm,
    handleConfirm,
    handleCancel
  }
})

// Convenience global shortcuts
export function showAlert(msg: string, options?: Partial<AlertOptions>): Promise<boolean> {
  const alertStore = useAlertStore()
  return alertStore.showAlert(msg, options)
}

export function showConfirm(msg: string, options?: Partial<AlertOptions>): Promise<boolean> {
  const alertStore = useAlertStore()
  return alertStore.showConfirm(msg, options)
}
