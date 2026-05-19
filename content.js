/**
 * content.js
 * 비밀번호 보안 분석 패널 메인 컨트롤러
 */

const getSiteName = () => {
  let host = window.location.hostname || ''
  host = host.replace(/^www\./, '') // www. 부분 제거
  const parts = host.split('.')

  // 도메인이 3마디 이상일 때 (예: unistudy.co.kr, lms.cau.ac.kr)
  if (parts.length >= 3) {
    const tld = parts[parts.length - 1] // 맨 뒤 (kr)
    const sld = parts[parts.length - 2] // 중간 (co, ac 등)

    // 한국에서 자주 쓰는 2단계 도메인 목록
    const krDomains = [
      'co',
      'ac',
      'go',
      'or',
      'ne',
      're',
      'pe',
      'hs',
      'ms',
      'es',
    ]

    // 끝이 .kr 로 끝나고, 중간이 co, ac 등에 해당한다면 그 앞의 진짜 이름을 가져옴
    if (tld === 'kr' && krDomains.includes(sld)) {
      return parts[parts.length - 3] // unistudy
    }
  }

  // 일반적인 .com, .net 이거나 위의 예외에 해당하지 않는 경우 (기존 로직 유지)
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0]
}

const isVisiblePasswordInput = (el) =>
  window.PwUtils?.isPasswordInput(el) ?? el?.type === 'password'

const normalizeAnalyzerResult = (result) => ({
  score: result?.score || 0,
  status: result?.statusClass || 'danger',
  warnings: result?.warnings || [],
})

;(function () {
  'use strict'

  const PANEL_ID = 'pwguard-panel'
  const DEBOUNCE_DELAY = 300
  const REUSE_DELAY = 800
  const LEAK_DELAY = 700

  let activeInput = null
  let panel = null
  let strengthDebounceTimer = null
  let reuseDebounceTimer = null
  let leakDebounceTimer = null
  let isDetailOpen = false
  let isMinimized = false
  const leakCache = new Map()

  let isDragging = false
  let offset = { x: 0, y: 0 }

  function isJuminInput(el) {
    if (!el) return false
    const keywords = ['jumin', 'rrn', 'ssn', 'regno', 'resident', 'residentno']
    const attrs = [
      el.id,
      el.name,
      el.getAttribute('title'),
      el.getAttribute('placeholder'),
      el.className,
    ]
    return attrs.some((attr) => {
      if (!attr) return false
      return keywords.some((key) => attr.toLowerCase().includes(key))
    })
  }

  // 🚀 [보안 핵심] 네이버 RSA 암호화 무력화: 0.2초마다 순수 입력 텍스트 백업 시스템 가동
  const passwordBackups = new Map()
  let lastTypedPassword = ''

  setInterval(() => {
    const inputs = document.querySelectorAll('input[type="password"]')
    inputs.forEach((input) => {
      if (isJuminInput(input)) return

      const val = input.value
      // 네이버가 제출 시 생성하는 엄청 긴 암호문(50자 초과)은 철저히 무시
      if (val !== undefined && val.length <= 50) {
        if (val.length >= 4) {
          passwordBackups.set(input, val.trim())
          lastTypedPassword = val.trim()
        } else if (val.length === 0) {
          passwordBackups.delete(input) // 다 지웠을 땐 백업도 비워줌
        }
      }
    })
  }, 200)

  function createPanel() {
    if (document.getElementById(PANEL_ID)) {
      panel = document.getElementById(PANEL_ID)
      return
    }

    panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.className = 'pwguard-panel'
    panel.style.cssText =
      'position: absolute; z-index: 2147483647; display: none;'

    panel.innerHTML = `
      <div class="pwguard-header" style="cursor: move;" title="드래그 이동 / 더블클릭 최소화">
        <span class="pwguard-title">🔒 비밀번호 보안 분석</span>
        <div class="pwguard-controls">
          <button class="pwguard-minimize-btn" title="최소화">-</button>
          <button class="pwguard-close" aria-label="닫기">✕</button>
        </div>
      </div>
      <div class="pwguard-body">
        <div class="pwguard-score-row">
          <span class="pwguard-status-badge">—</span>
          <span class="pwguard-score-text">입력 대기 중</span>
        </div>
        <div class="pwguard-strength-bar-wrap">
          <div class="pwguard-strength-bar" style="width:0%"></div>
        </div>
        <ul class="pwguard-warnings"></ul>

        <div class="pwguard-reuse-section" style="display:none">
          <div class="pwguard-reuse-header">
            <span class="pwguard-reuse-badge">⚠️ 재사용 감지</span>
            <button class="pwguard-detail-toggle">자세히 보기 ▾</button>
          </div>
          <ul class="pwguard-reuse-warnings"></ul>
          <ul class="pwguard-reuse-details" style="display:none"></ul>
        </div>

        <div class="pwguard-longuse-section" style="display:none">
          <span class="pwguard-longuse-badge">🕐 장기 사용 감지</span>
          <ul class="pwguard-longuse-warnings"></ul>
        </div>

        <div class="pwguard-leak-section pwguard-leak-row" style="display:none">
          <span class="pwguard-leak-dot"></span>
          <span class="pwguard-leak-label">유출 이력 있음</span>
          <span class="pwguard-leak-sub pwguard-leak-count"></span>
        </div>

        <div class="pwguard-leak-safe-section pwguard-leak-row" style="display:none">
          <span class="pwguard-leak-dot"></span>
          <span class="pwguard-leak-label">유출 이력 없음</span>
        </div>

        <div class="pwguard-leak-checking pwguard-leak-row" style="display:none">
          <span class="pwguard-leak-dot"></span>
          <span class="pwguard-leak-label">유출 여부 확인 중...</span>
        </div>
      </div>
    `
    document.body.appendChild(panel)
    setupPanelEvents()
  }

  function setupPanelEvents() {
    const header = panel.querySelector('.pwguard-header')
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return
      isDragging = true
      const rect = panel.getBoundingClientRect()
      offset.x = e.clientX - rect.left
      offset.y = e.clientY - rect.top
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })
    header.addEventListener('dblclick', (e) => {
      if (e.target.tagName !== 'BUTTON') toggleMinimize()
    })
    panel.querySelector('.pwguard-minimize-btn').onclick = (e) => {
      e.stopPropagation()
      toggleMinimize()
    }
    panel.querySelector('.pwguard-close').onclick = (e) => {
      e.stopPropagation()
      hidePanel()
    }
    panel.querySelector('.pwguard-detail-toggle').onclick = (e) => {
      isDetailOpen = !isDetailOpen
      const detailList = panel.querySelector('.pwguard-reuse-details')
      detailList.style.display = isDetailOpen ? 'block' : 'none'
      e.target.textContent = isDetailOpen ? '접기 ▴' : '자세히 보기 ▾'
    }
  }

  function onMouseMove(e) {
    if (!isDragging || !panel) return
    panel.style.left = e.clientX - offset.x + window.scrollX + 'px'
    panel.style.top = e.clientY - offset.y + window.scrollY + 'px'
  }

  function onMouseUp() {
    isDragging = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function positionPanel(inputEl) {
    if (!panel || !inputEl || isDragging) return
    const rect = inputEl.getBoundingClientRect()
    const panelWidth = 280
    let left = rect.right + window.scrollX + 12
    let top = rect.top + window.scrollY

    if (left + panelWidth > window.innerWidth + window.scrollX - 12) {
      left = rect.left + window.scrollX - panelWidth - 12
      if (left < 10) {
        left = rect.left + window.scrollX
        top = rect.bottom + window.scrollY + 12
      }
    }
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'
  }

  function toggleMinimize() {
    isMinimized = !isMinimized
    panel.classList.toggle('minimized', isMinimized)
    panel.querySelector('.pwguard-minimize-btn').textContent = isMinimized
      ? '+'
      : '-'
  }

  function hidePanel() {
    if (panel) panel.style.display = 'none'
    isDetailOpen = false
  }

  function renderStrength(result) {
    if (!panel) return
    const badge = panel.querySelector('.pwguard-status-badge')
    const scoreText = panel.querySelector('.pwguard-score-text')
    const bar = panel.querySelector('.pwguard-strength-bar')
    const warningList = panel.querySelector('.pwguard-warnings')

    const statusMap = {
      danger: { label: '위험', cls: 'status-danger' },
      normal: { label: '보통', cls: 'status-normal' },
      safe: { label: '안전', cls: 'status-safe' },
    }
    const s = statusMap[result.status] || statusMap.danger

    badge.textContent = s.label
    badge.className = `pwguard-status-badge ${s.cls}`
    scoreText.textContent = `점수: ${result.score}점`
    bar.style.width = Math.min(100, Math.max(0, result.score)) + '%'
    bar.className = `pwguard-strength-bar bar-${result.status}`
    warningList.innerHTML = (result.warnings || [])
      .map((w) => `<li class="pwguard-warning-item">${w}</li>`)
      .join('')
  }

  function renderReuse(reuseResult) {
    if (!panel) return
    const msgs = window.buildReuseMessages
      ? window.buildReuseMessages(reuseResult)
      : { warnings: [], details: [], allSites: [] }
    const { warnings = [], details = [], allSites = [] } = msgs

    const reuseSection = panel.querySelector('.pwguard-reuse-section')
    const reuseWarnList = panel.querySelector('.pwguard-reuse-warnings')
    const reuseDetailList = panel.querySelector('.pwguard-reuse-details')

    if (reuseResult.isReused) {
      reuseSection.style.display = 'block'
      reuseWarnList.innerHTML = warnings
        .filter((w) => !w.includes('일째'))
        .map((w) => `<li>${w}</li>`)
        .join('')
      reuseDetailList.innerHTML = ''

      details.forEach((d) => {
        const li = document.createElement('li')
        li.className = 'pwguard-detail-item'
        li.textContent = d
        reuseDetailList.appendChild(li)
      })

      if (allSites && allSites.length > 0) {
        const PREVIEW_LIMIT = 3
        const preview = allSites.slice(0, PREVIEW_LIMIT)
        const extra = allSites.slice(PREVIEW_LIMIT)

        const previewLi = document.createElement('li')
        previewLi.className = 'pwguard-detail-item'
        previewLi.style.fontWeight = 'bold'
        previewLi.textContent = `사용된 사이트: ${preview.join(', ')}`
        reuseDetailList.appendChild(previewLi)

        if (extra.length > 0) {
          const moreLi = document.createElement('li')
          moreLi.className = 'pwguard-detail-item'
          const moreBtn = document.createElement('button')
          moreBtn.className = 'pwguard-site-more-btn'
          moreBtn.textContent = `외 ${extra.length}개 더 보기 ▾`
          moreBtn.style.cssText =
            'background: none; border: none; color: #007bff; cursor: pointer; padding: 0; font-size: 12px; margin-top: 4px;'

          const extraUl = document.createElement('ul')
          extraUl.className = 'pwguard-site-extra-list'
          extraUl.style.display = 'none'
          extraUl.style.paddingLeft = '15px'
          extraUl.style.marginTop = '4px'

          extra.forEach((s) => {
            const li = document.createElement('li')
            li.textContent = s
            extraUl.appendChild(li)
          })

          moreBtn.onclick = () => {
            const isOpen = extraUl.style.display === 'block'
            extraUl.style.display = isOpen ? 'none' : 'block'
            moreBtn.textContent = isOpen
              ? `외 ${extra.length}개 더 보기 ▾`
              : '접기 ▴'
          }
          moreLi.appendChild(moreBtn)
          moreLi.appendChild(extraUl)
          reuseDetailList.appendChild(moreLi)
        }
      }
      reuseDetailList.style.display = isDetailOpen ? 'block' : 'none'
    } else {
      reuseSection.style.display = 'none'
    }
  }

  function renderLeakChecking(isChecking) {
    if (!panel) return
    const checkingEl = panel.querySelector('.pwguard-leak-checking')
    const leakSection = panel.querySelector('.pwguard-leak-section')
    const leakSafeSection = panel.querySelector('.pwguard-leak-safe-section')
    if (!checkingEl) return
    if (isChecking) {
      leakSection.style.display = 'none'
      leakSafeSection.style.display = 'none'
      checkingEl.style.display = 'flex'
    } else {
      checkingEl.style.display = 'none'
    }
  }

  function renderLeak(leakResult) {
    if (!panel) return
    const leakSection = panel.querySelector('.pwguard-leak-section')
    const leakSafeSection = panel.querySelector('.pwguard-leak-safe-section')
    const checkingEl = panel.querySelector('.pwguard-leak-checking')
    const countEl = panel.querySelector('.pwguard-leak-count')

    leakSection.style.display = 'none'
    leakSafeSection.style.display = 'none'
    checkingEl.style.display = 'none'

    if (leakResult === null) return
    if (leakResult.leaked) {
      leakSection.style.display = 'flex'
      if (countEl)
        countEl.textContent = leakResult.count
          ? `(${leakResult.count.toLocaleString()}회 노출)`
          : ''
    } else {
      leakSafeSection.style.display = 'flex'
    }
  }

  function handleInput(e) {
    const input = e.target
    let value = input.value
    const domain = getSiteName()

    if (value.length > 50) return // 오염된 값 무시
    value = value.trim()

    // 이벤트가 발생할 때마다 백업도 함께 업데이트
    passwordBackups.set(input, value)
    lastTypedPassword = value

    if (isJuminInput(input)) return
    positionPanel(input)

    let username = 'unknown'
    const form = input.closest('form')
    if (form) {
      const idInput = form.querySelector(
        'input[type="text"], input[type="email"], input[name*="id" i], input[name*="user" i], input[name*="login" i]',
      )
      if (idInput && idInput.value) {
        username = idInput.value.trim()
      }
    }

    clearTimeout(strengthDebounceTimer)
    strengthDebounceTimer = setTimeout(() => {
      const raw = window.PwAnalyzer?.evaluatePassword(value, {
        siteName: domain,
        reuseCount: 0,
      })
      renderStrength(normalizeAnalyzerResult(raw))
    }, DEBOUNCE_DELAY)

    clearTimeout(reuseDebounceTimer)
    if (value.length >= 4) {
      reuseDebounceTimer = setTimeout(async () => {
        try {
          const reuseResult = await window.analyzeReuse(value, domain, username)
          renderReuse(reuseResult)
          const updatedRaw = window.PwAnalyzer?.evaluatePassword(value, {
            siteName: domain,
            reuseCount: reuseResult.reuseCount,
          })
          renderStrength(normalizeAnalyzerResult(updatedRaw))
        } catch (err) {}
      }, REUSE_DELAY)
    }

    clearTimeout(leakDebounceTimer)
    if (value.length >= 4) {
      renderLeak(null)
      leakDebounceTimer = setTimeout(async () => {
        if (leakCache.has(value)) {
          const cached = leakCache.get(value)
          renderLeak(cached)
          return
        }
        try {
          renderLeakChecking(true)
          const sha1Hash = await window.PwUtils?.sha1Hex(value)
          if (!sha1Hash) return
          const leakResult = await chrome.runtime.sendMessage({
            action: 'checkLeaked',
            payload: { sha1Hash },
          })
          leakCache.set(value, leakResult)
          renderLeak(leakResult)
        } catch (err) {
          renderLeakChecking(false)
        }
      }, LEAK_DELAY)
    } else {
      renderLeak(null)
    }
  }

  function trackLoginAttempt(e) {
    if (activeInput && isJuminInput(activeInput)) return

    let form = null
    if (e && e.target && e.target.closest) form = e.target.closest('form')
    if (!form && activeInput) form = activeInput.closest('form')

    let targetPassword = ''
    const domain = getSiteName()
    let username = 'unknown'

    if (form) {
      const idInput = form.querySelector(
        'input[type="text"], input[type="email"], input[name*="id" i], input[name*="user" i], input[name*="login" i]',
      )
      if (idInput && idInput.value) {
        username = idInput.value.trim()
      }

      const pwInputs = Array.from(
        form.querySelectorAll('input[type="password"]'),
      ).filter((input) => !isJuminInput(input))
      for (let i = pwInputs.length - 1; i >= 0; i--) {
        // [중요] 네이버가 폼 값을 오염시켰더라도, 우리의 안전한 백업(passwordBackups)에서 값을 꺼내옵니다.
        const val = passwordBackups.get(pwInputs[i]) || pwInputs[i].value
        if (val && val.trim().length >= 4 && val.trim().length <= 50) {
          targetPassword = val.trim()
          break
        }
      }
    }

    if (!targetPassword && activeInput) {
      const val = passwordBackups.get(activeInput) || activeInput.value
      if (val && val.trim().length >= 4 && val.trim().length <= 50)
        targetPassword = val.trim()
    }

    if (!targetPassword && lastTypedPassword)
      targetPassword = lastTypedPassword.trim()
    if (!targetPassword || targetPassword.length < 4) return

    // 💡 [디버깅] 여기서 콘솔창(F12)을 확인하세요! 진짜 비밀번호가 무사히 구출되었는지 뜹니다.
    console.log('=====================================')
    console.log('[PwGuard] 🚀 로그인/변경 시도 감지!')
    console.log('[PwGuard] 👤 계정(ID):', username)
    console.log('[PwGuard] 🔑 추출된 순수 비밀번호:', targetPassword)
    console.log('=====================================')

    clearTimeout(window.trackTimer)
    window.trackTimer = setTimeout(() => {
      window.PwUtils?.sha1Hex(targetPassword).then((hash) => {
        console.log('[PwGuard] 🔒 생성된 해시값:', hash) // 아이디가 달라도 이 해시값이 똑같이 나오면 대성공!
        chrome.runtime.sendMessage({
          action: 'attemptLogin',
          payload: { hash, domain, username },
        })
      })
    }, 300)
  }

  function attachEvents(root) {
    const selector = 'input[type="password"]'
    const inputs = root.querySelectorAll ? root.querySelectorAll(selector) : []
    inputs.forEach((input) => {
      if (input.dataset.pwguardAttached) return
      input.dataset.pwguardAttached = 'true'
      input.addEventListener('focus', (e) => {
        if (isJuminInput(e.target)) return
        activeInput = e.target
        createPanel()
        positionPanel(e.target)
        panel.style.display = 'block'
      })
      input.addEventListener('input', handleInput)
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (!isDragging && !panel?.contains(document.activeElement))
            hidePanel()
        }, 150)
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') trackLoginAttempt(e)
      })

      const parentForm = input.closest('form')
      if (parentForm && !parentForm.dataset.pwguardFormAttached) {
        parentForm.dataset.pwguardFormAttached = 'true'
        parentForm.addEventListener('submit', (e) => {
          trackLoginAttempt(e)
        })
      }
    })

    const submitButtons = root.querySelectorAll(
      'button[type="submit"], input[type="submit"], .login-btn, #login-btn, ' +
        '#loginBtn, .btn_login, .login_btn, a[href*="login"], a[onclick*="login"], ' +
        '[class*="login" i] button, [class*="login" i] a, #btnSubmit',
    )
    submitButtons.forEach((btn) => {
      if (btn.dataset.pwguardBtnAttached) return
      btn.dataset.pwguardBtnAttached = 'true'
      btn.addEventListener('click', trackLoginAttempt)
    })
  }

  function init() {
    createPanel()
    attachEvents(document)
    new MutationObserver((m) =>
      m.forEach((r) =>
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1)
            attachEvents(
              n.matches('input[type="password"]') ? n.parentElement : n,
            )
        }),
      ),
    ).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init)
  else init()
})()
