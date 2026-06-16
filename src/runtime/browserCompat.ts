export function createJobId(cryptoSource: Crypto | undefined = globalThis.crypto): string {
  if (typeof cryptoSource?.randomUUID === 'function') {
    return cryptoSource.randomUUID()
  }

  const values = new Uint32Array(4)
  if (typeof cryptoSource?.getRandomValues === 'function') {
    cryptoSource.getRandomValues(values)
    return `job-${Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('-')}`
  }

  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function randomInt(maxExclusive: number, cryptoSource: Crypto | undefined = globalThis.crypto): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0

  if (typeof cryptoSource?.getRandomValues === 'function') {
    const value = new Uint32Array(1)
    cryptoSource.getRandomValues(value)
    return value[0] % maxExclusive
  }

  return Math.floor(Math.random() * maxExclusive)
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Safari can expose Clipboard API but reject it outside narrow gesture/permission windows.
    }
  }

  return copyTextWithTextArea(text)
}

function copyTextWithTextArea(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'

  const selection = document.getSelection()
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
    if (selection && selectedRange) {
      selection.removeAllRanges()
      selection.addRange(selectedRange)
    }
  }
}
