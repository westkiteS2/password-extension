/**
 * background.js
 * Service Worker - Supabase 통신 및 로그인 데이터 덮어쓰기 로직
 */

import { createClient } from './supabase-bundle.js'

const SUPABASE_URL = 'https://wccoqnnzcyueokxufbhj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_wWDN3L3XOSWAwZiN_RouBQ_jgKs-khP'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let pendingLogin = null

async function getUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['session'], (result) => {
      resolve(result.session?.user?.id || null)
    })
  })
}

// 아이디(username)별 도메인 관리 및 덮어쓰기
async function recordHash(hash, domain, username) {
  const userId = await getUserId()
  if (!userId) return { error: '로그인 필요' }

  // 해당 도메인과 추출한 아이디가 일치하는 행 조회
  const { data: existingData } = await supabase
    .from('password_analytics')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('username', username)

  if (existingData && existingData.length > 0) {
    // 이미 계정 행이 있으면 비밀번호 해시만 새것으로 수정(UPDATE)
    const { error: updateError } = await supabase
      .from('password_analytics')
      .update({
        password_hash: hash,
        last_seen: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('username', username)

    if (updateError)
      console.error('[PwGuard] 비밀번호 갱신 실패:', updateError.message)
    else
      console.log(
        `[PwGuard] ${domain} (${username}) 계정 비밀번호가 안전하게 교체되었습니다.`,
      )
  } else {
    // 없으면 신규 삽입
    const { error: insertError } = await supabase
      .from('password_analytics')
      .insert({
        user_id: userId,
        password_hash: hash,
        domain: domain,
        username: username,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      })

    if (insertError)
      console.error('[PwGuard] 비밀번호 신규 저장 실패:', insertError.message)
    else
      console.log(
        `[PwGuard] ${domain} (${username}) 계정이 새로 생성 및 저장되었습니다.`,
      )
  }

  return { success: true }
}

// [수정 핵심] 계정이 달라도 해시값이 같으면 재사용된 사이트 목록을 모두 수집하되,
// 현재 내가 입력 중인 바로 그 사이트의 그 계정(기존 데이터)은 검사에서 제외합니다.
async function checkReuse(hash, currentDomain, currentUsername) {
  const userId = await getUserId()
  if (!userId)
    return { isReused: false, otherSites: [], reuseCount: 0, daysSinceFirst: 0 }

  // 동일 유저가 쓰는 모든 데이터 중 현재 전송된 해시와 일치하는 전체 사이트 조회
  const { data, error } = await supabase
    .from('password_analytics')
    .select('domain, username, first_seen')
    .eq('user_id', userId)
    .eq('password_hash', hash)

  if (error || !data || data.length === 0)
    return { isReused: false, otherSites: [], reuseCount: 0, daysSinceFirst: 0 }

  // 🚨 [가장 중요한 필터링]
  // "현재 켜져 있는 탭의 도메인"과 "현재 입력 중인 폼의 아이디"가 DB와 똑같다면,
  // 그건 재사용이 아니라 '내 원래 비밀번호'를 치고 있는 것이므로 목록에서 걸러냅니다.
  const filteredData = data.filter((item) => {
    return !(item.domain === currentDomain && item.username === currentUsername)
  })

  // 걸러내고 남은 것(진짜 타 사이트 혹은 동일 사이트의 타 계정)의 도메인만 추출
  const otherSites = filteredData.map((s) => s.domain)

  // 중복 도메인 명칭 제거 처리
  const uniqueSites = [...new Set(otherSites)]

  const allFirstSeen = data.map((s) => new Date(s.first_seen).getTime())
  const earliest = Math.min(...allFirstSeen)
  const daysSinceFirst = Math.floor(
    (Date.now() - earliest) / (1000 * 60 * 60 * 24),
  )

  // filteredData에 데이터가 남아있다면 명백히 재사용된 것임
  return {
    isReused: filteredData.length > 0,
    otherSites: uniqueSites,
    reuseCount: filteredData.length,
    daysSinceFirst,
  }
}

async function getDaysUsedOnSite(hash, currentDomain) {
  const userId = await getUserId()
  if (!userId) return 0
  const { data, error } = await supabase
    .from('password_analytics')
    .select('first_seen')
    .eq('user_id', userId)
    .eq('password_hash', hash)
    .eq('domain', currentDomain)
    .limit(1)

  if (error || !data || data.length === 0) return 0
  return Math.floor(
    (Date.now() - new Date(data[0].first_seen).getTime()) /
      (1000 * 60 * 60 * 24),
  )
}

async function checkLeaked(sha1Hash) {
  const prefix = sha1Hash.slice(0, 5)
  const suffix = sha1Hash.slice(5).toUpperCase()
  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { headers: { 'Add-Padding': 'true' } },
    )
    if (!response.ok)
      return { leaked: false, count: 0, error: `HTTP ${response.status}` }
    const text = await response.text()
    for (const line of text.split('\r\n')) {
      const [hashSuffix, countStr] = line.split(':')
      if (hashSuffix && hashSuffix.toUpperCase() === suffix)
        return { leaked: true, count: parseInt(countStr, 10) || 0 }
    }
    return { leaked: false, count: 0 }
  } catch (err) {
    return { leaked: false, count: 0, error: err.message }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message
  if (action === 'checkLeaked') {
    checkLeaked(payload.sha1Hash).then(sendResponse)
    return true
  }
  if (action === 'attemptLogin') {
    pendingLogin = {
      hash: payload.hash,
      domain: payload.domain,
      username: payload.username || 'unknown',
      tabId: sender.tab.id,
    }
    sendResponse({ status: 'pending' })
    return true
  }
  if (action === 'checkReuse') {
    // payload에서 넘어온 username도 함께 넘겨줍니다.
    checkReuse(
      payload.hash,
      payload.domain,
      payload.username || 'unknown',
    ).then(sendResponse)
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

chrome.webNavigation.onCompleted.addListener((details) => {
  if (
    details.frameId === 0 &&
    pendingLogin &&
    details.tabId === pendingLogin.tabId
  ) {
    recordHash(pendingLogin.hash, pendingLogin.domain, pendingLogin.username)
    pendingLogin = null
  }
})
