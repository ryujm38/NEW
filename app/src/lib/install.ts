// "앱으로 설치" 지원. 안드로이드·데스크톱 크롬 계열은 설치 가능해지면 beforeinstallprompt 이벤트를 보내고,
// 아이폰 Safari에는 그런 이벤트가 없어서 홈 화면에 추가하는 방법을 안내한다.

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** 앱이 시작될 때 한 번 등록한다. 이벤트가 화면이 그려지기 전에 올 수도 있어서 모듈 수준에서 잡아 둔다. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const getInstallPrompt = (): InstallPromptEvent | null => deferred

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 설치 창을 띄운다. 한 번 쓰면 이벤트는 다시 쓸 수 없다. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch {
    return 'unavailable'
  }
}

/** 이미 홈 화면에서 앱으로 열린 상태인지 */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true
}

/** 아이폰·아이패드. 아이패드는 데스크톱 사파리처럼 보이는 UA를 보내서 터치 지점 수로 구분한다. */
export function isIosDevice(ua: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)
}

/**
 * 브라우저에 "이 사이트의 저장 데이터를 지우지 마세요"라고 요청한다.
 * 이 앱은 데이터를 기기에만 저장하므로 중요하다. 허락 여부는 브라우저가 정하고, 거절돼도 앱은 그대로 동작한다.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
