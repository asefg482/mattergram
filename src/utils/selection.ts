import type { MattermostPost } from '../types/mattermost'

/**
 * Returns currently selected text in the browser.
 * If a post is specified, verifies that the selection belongs to or intersects
 * with that message bubble. If the user right-clicked on an unrelated message,
 * the stale selection is cleared and an empty string is returned.
 */
export function getSelectedTextForPost(post?: MattermostPost | null): string {
  if (typeof window === 'undefined') return ''
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const text = sel.toString()
  if (!text.trim()) return ''

  if (!post) return text

  const msgEl = document.getElementById(`msg-${post.id}`)
  if (!msgEl) {
    return text
  }

  try {
    const range = sel.getRangeAt(0)
    const isInside =
      msgEl.contains(range.commonAncestorContainer) ||
      msgEl.contains(range.startContainer) ||
      msgEl.contains(range.endContainer) ||
      (typeof range.intersectsNode === 'function' && range.intersectsNode(msgEl))

    if (isInside) {
      return text
    } else {
      // User right-clicked on an unrelated message: clear the foreign selection
      sel.removeAllRanges()
      return ''
    }
  } catch {
    return text
  }
}
