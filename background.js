/**
 * background.js
 * Service Worker - Supabase 통신을 담당합니다.
 * content.js에서 오는 메시지를 받아 Supabase DB와 통신합니다.
 */

import { createClient } from './supabase-bundle.js'

const SUPABASE_URL = 'https://wccoqnnzcyueokxufbhj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_wWDN3L3XOSWAwZiN_RouBQ_jgKs-khP'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── 현재 로그인된 유저 ID 가져오기 ────────────────────────────────────────────
async function getUserId() {
  // chrome.storage.local에 저장된 세션에서 user_id 가져오기
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

  // .upsert()를 사용하여 (user_id, password_hash, domain) 조합이 겹치면 last_seen만 업데이트합니다.
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

  if (action === 'recordHash') {
    recordHash(payload.hash, payload.domain).then(sendResponse)
    return true // 비동기 응답
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
