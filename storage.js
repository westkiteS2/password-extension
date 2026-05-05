/**
 * storage.js
 * chrome.storage.local 기반 비밀번호 해시 기록 관리 모듈
 */

async function recordHash(hash, domain) {
  if (!hash || !domain) return
  return new Promise((resolve) => {
    chrome.storage.local.get(['pwguard_records'], (result) => {
      const records = result.pwguard_records || {}
      const key = `${domain}::${hash}`
      if (!records[key]) {
        records[key] = {
          domain,
          hash,
          first_seen: Date.now(),
          last_seen: Date.now(),
        }
      } else {
        records[key].last_seen = Date.now()
      }
      chrome.storage.local.set({ pwguard_records: records }, resolve)
    })
  })
}

async function checkReuse(hash, currentDomain) {
  if (!hash)
    return {
      isReused: false,
      otherSites: [],
      reuseCount: 0,
      daysSinceFirst: 0,
    }
  return new Promise((resolve) => {
    chrome.storage.local.get(['pwguard_records'], (result) => {
      const records = result.pwguard_records || {}
      const otherSites = Object.values(records)
        .filter((r) => r.hash === hash && r.domain !== currentDomain)
        .map((r) => r.domain)
      const allEntries = Object.values(records).filter((r) => r.hash === hash)
      const earliest =
        allEntries.length > 0
          ? Math.min(...allEntries.map((r) => r.first_seen))
          : Date.now()
      const daysSinceFirst = Math.floor(
        (Date.now() - earliest) / (1000 * 60 * 60 * 24),
      )
      resolve({
        isReused: otherSites.length > 0,
        otherSites,
        reuseCount: otherSites.length,
        daysSinceFirst,
      })
    })
  })
}

async function getDaysUsedOnSite(hash, currentDomain) {
  if (!hash || !currentDomain) return 0
  return new Promise((resolve) => {
    chrome.storage.local.get(['pwguard_records'], (result) => {
      const records = result.pwguard_records || {}
      const key = `${currentDomain}::${hash}`
      const entry = records[key]
      if (!entry) return resolve(0)
      resolve(
        Math.floor((Date.now() - entry.first_seen) / (1000 * 60 * 60 * 24)),
      )
    })
  })
}
