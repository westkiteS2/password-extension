import { signIn, signUp } from './auth.js'
import { supabase } from './supabaseClient.js'

// DOM 요소 가져오기
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginBtn = document.getElementById('login-btn')
const signupBtn = document.getElementById('signup-btn')

// 화면 전환을 위한 섹션 요소 추가
const authSection = document.getElementById('auth-section')
const successSection = document.getElementById('success-section')
const userEmailDisplay = document.getElementById('user-display-email')

// UI 업데이트 함수
function updateUI(session) {
  if (session) {
    // 로그인 성공 상태
    authSection.style.display = 'none'
    successSection.style.display = 'block'
    if (userEmailDisplay) {
      userEmailDisplay.textContent = session.user.email
    }
  } else {
    // 로그아웃 또는 로그인 전 상태
    authSection.style.display = 'block'
    successSection.style.display = 'none'
  }
}

// 팝업 실행 시 기존 로그인 세션 확인
chrome.storage.local.get(['session'], (result) => {
  if (result.session) {
    updateUI(result.session)
  }
})

// 로그인 버튼 클릭 이벤트
loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    alert('이메일과 비밀번호를 모두 입력해주세요.')
    return
  }

  const result = await signIn(email, password)
  if (result.success) {
    alert('로그인에 성공했습니다!')

    const session = result.data.session
    if (session) {
      chrome.storage.local.set({ session: session }, () => {
        console.log('세션이 로컬 스토리지에 저장되었습니다.')
        // 로그인 성공 후 UI 즉시 전환
        updateUI(session)
      })
    }
  } else {
    alert(`로그인 실패: ${result.error}`)
  }
})

// 회원가입 버튼 클릭 이벤트
signupBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    alert('이메일과 비밀번호를 모두 입력해주세요.')
    return
  }

  const result = await signUp(email, password)
  if (result.success) {
    alert('회원가입 요청 성공! 이메일 확인 또는 즉시 로그인이 가능합니다.')
  } else {
    alert(`회원가입 실패: ${result.error}`)
  }
})

// popup.js 하단에 추가 추천
const logoutBtn = document.getElementById('logout-btn')

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['session'], () => {
      console.log('세션이 삭제되었습니다.')
      updateUI(null) // 다시 로그인 화면으로 전환
    })
  })
}
