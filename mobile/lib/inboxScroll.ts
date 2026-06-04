/** Lets the inbox tab bar button scroll the list to the top on double-tap. */
let scrollToTopHandler: (() => void) | null = null

export function registerInboxScrollToTop(handler: (() => void) | null) {
  scrollToTopHandler = handler
}

export function inboxScrollToTop() {
  scrollToTopHandler?.()
}
