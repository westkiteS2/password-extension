/**
 * storage.js
 * Supabase 기반 비밀번호 해시 기록 관리 모듈
 */

import { supabase } from './supabaseClient.js'

// ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────

async function getUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

// ─── 공개 함수 ──────────────────────────────────────────────────────────────

/**
 * 비밀번호 해시와 현재 도메인을 기록합니다.
 * Supabase의 upsert를 사용하여 데이터가 있으면 업데이트, 없으면 생성합니다.
 */
async function recordHash(hash, domain) {
  const userId = await getUserId()
  if (!userId || !hash || !domain) return

  const { error } = await supabase.from('password_analytics').upsert(
    {
      user_id: userId,
      password_hash: hash,
      domain: domain,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'user_id, password_hash, domain' },
  )

  if (error) console.error('[PwGuard] Supabase 기록 오류:', error)
}

/**
 * 특정 해시가 현재 도메인 외 다른 곳에서도 사용됐는지 확인합니다.
 */
async function checkReuse(hash, currentDomain) {
  const userId = await getUserId()
  if (!userId || !hash) {
    return { isReused: false, otherSites: [], reuseCount: 0, daysSinceFirst: 0 }
  }

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

  // 가장 처음 기록된 날짜 계산
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

/**
 * 현재 도메인에서 동일 해시를 사용한 기간(일수)을 반환합니다.
 */
async function getDaysUsedOnSite(hash, currentDomain) {
  const userId = await getUserId()
  if (!userId || !hash || !currentDomain) return 0

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
