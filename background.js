/**
 * background.js
 * Service Worker - Supabase 통신 및 로그인 성공 감지 저장 로직
 */

import { createClient } from './supabase-bundle.js'

const SUPABASE_URL = 'https://wccoqnnzcyueokxufbhj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_wWDN3L3XOSWAwZiN_RouBQ_jgKs-khP'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// [추가] 로그인 성공 판단을 위한 임시 저장 변수
let pendingLogin = null

// ─── 현재 로그인된 유저 ID 가져오기 ────────────────────────────────────────────
async function getUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['session'], (result) => {
      resolve(result.session?.user?.id || null)
    })
  })
}

// ─── 비밀번호 해시 기록 ────────────────────────────────────────────────────────
async function recordHash(hash, domain) {
  const userId = await getUserId()
  if (!userId) return { error: '로그인 필요' }

  const { error } = await supabase.from('password_analytics').upsert(
    {
      user_id: userId,
      password_hash: hash,
      domain: domain,
      last_seen: new Date().toISOString(),
    },
    {
      onConflict: 'user_id, password_hash, domain',
    },
  )

  if (error) {
    console.error('[PwGuard] Supabase upsert 오류:', error.message)
    return { error: error.message }
  }

  return { success: true }
}

// ─── 재사용 체크 ───────────────────────────────────────────────────────────────
async function checkReuse(hash, currentDomain) {
  const userId = await getUserId()
  if (!userId)
    return { isReused: false, otherSites: [], reuseCount: 0, daysSinceFirst: 0 }

  const { data, error } = await supabase
    .from('password_analytics')
    .select('domain, first_seen')
    .eq('user_id', userId)
    .eq('password_hash', hash)

  if (error || !data || data.length === 0) {
    return { isReused: false, otherSites: [], reuseCount: 0, daysSinceFirst: 0 }
  }

  const otherSites = data
    .filter((s) => s.domain !== currentDomain)
    .map((s) => s.domain)

  const allFirstSeen = data.map((s) => new Date(s.first_seen).getTime())
  const earliest = Math.min(...allFirstSeen)
  const daysSinceFirst = Math.floor(
    (Date.now() - earliest) / (1000 * 60 * 60 * 24),
  )

  return {
    isReused: otherSites.length > 0,
    otherSites,
    reuseCount: otherSites.length,
    daysSinceFirst,
  }
}

// ─── 사이트 사용 일수 체크 ─────────────────────────────────────────────────────
async function getDaysUsedOnSite(hash, currentDomain) {
  const userId = await getUserId()
  if (!userId) return 0

  const { data, error } = await supabase
    .from('password_analytics')
    .select('first_seen')
    .eq('user_id', userId)
    .eq('password_hash', hash)
    .eq('domain', currentDomain)
    .single()

  if (error || !data) return 0

  return Math.floor(
    (Date.now() - new Date(data.first_seen).getTime()) / (1000 * 60 * 60 * 24),
  )
}

// ─── 메시지 리스너 ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message

  // [수정] 즉시 기록 대신 '시도' 정보를 보관
  if (action === 'attemptLogin') {
    pendingLogin = {
      hash: payload.hash,
      domain: payload.domain,
      tabId: sender.tab.id,
    }
    sendResponse({ status: 'pending' })
    return true
  }

  if (action === 'recordHash') {
    recordHash(payload.hash, payload.domain).then(sendResponse)
    return true
  }

  if (action === 'checkReuse') {
    checkReuse(payload.hash, payload.domain).then(sendResponse)
    return true
  }

  if (action === 'getDaysUsedOnSite') {
    getDaysUsedOnSite(payload.hash, payload.domain).then(sendResponse)
    return true
  }

  if (action === 'getSession') {
    chrome.storage.local.get(['session'], (result) => {
      sendResponse({ session: result.session || null })
    })
    return true
  }
})

// [추가] 페이지 내비게이션 완료 시 로그인 성공으로 간주하여 저장
chrome.webNavigation.onCompleted.addListener((details) => {
  // 메인 프레임의 이동이고, 보관된 로그인 시도 정보가 현재 탭과 일치할 때
  if (
    details.frameId === 0 &&
    pendingLogin &&
    details.tabId === pendingLogin.tabId
  ) {
    console.log('[PwGuard] 로그인 성공 감지: DB에 기록을 수행합니다.')
    recordHash(pendingLogin.hash, pendingLogin.domain)
    pendingLogin = null // 기록 후 초기화
  }
})
