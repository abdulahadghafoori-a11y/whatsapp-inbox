/** Lets the inbox tab bar button scroll the list to the top when re-tapped. */
let scrollToTopHandler: (() => void) | null = null

export function registerInboxScrollToTop(handler: (() => void) | null) {
  scrollToTopHandler = handler
}

export function inboxScrollToTop() {
  scrollToTopHandler?.()
}
