import { useState, useSyncExternalStore } from 'react'
import { getInstallPrompt, isIosDevice, isStandalone, promptInstall, subscribeInstall } from '../lib/install'

const KEY = 'travel-planner:install-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** 앱으로 설치할 수 있을 때만 보이는 안내. 이미 설치해서 열었거나 닫았으면 보이지 않는다. */
export function InstallHint() {
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt)
  const [hidden, setHidden] = useState(readDismissed)

  // 파일 하나로 합친 미리보기 버전(임베디드)에서는 설치 기능이 없다.
  if (import.meta.env.VITE_EMBEDDED || hidden || isStandalone()) return null
  const ios = isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
  if (!prompt && !ios) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // 저장할 수 없으면 이번 방문 동안만 숨긴다.
    }
  }

  return (
    <aside className="card install" aria-label="앱으로 설치">
      {prompt ? (
        <>
          <strong>앱으로 설치할 수 있어요</strong>
          <p className="muted">홈 화면에 추가하면 앱처럼 열리고, 인터넷이 없어도 쓸 수 있어요.</p>
          <div className="row actions">
            <button className="ghost" onClick={dismiss}>
              나중에
            </button>
            <button className="primary" onClick={() => void promptInstall()}>
              설치하기
            </button>
          </div>
        </>
      ) : (
        <>
          <strong>홈 화면에 추가해서 앱처럼 쓰세요</strong>
          <p className="muted">Safari 아래쪽의 공유 버튼(네모에 위쪽 화살표)을 누르고 '홈 화면에 추가'를 선택하세요.</p>
          <div className="row actions">
            <button className="ghost" onClick={dismiss}>
              닫기
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
