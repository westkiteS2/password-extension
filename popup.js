import { signIn, signUp } from './auth.js'

// DOM 요소 가져오기
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginBtn = document.getElementById('login-btn')
const signupBtn = document.getElementById('signup-btn')

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

    // 로그인 성공 후 처리 (예: 토큰 저장, 비밀번호 관리 화면으로 전환 등)
    const session = result.data.session
    if (session) {
      chrome.storage.local.set({ session: session }, () => {
        console.log('세션이 로컬 스토리지에 저장되었습니다.')
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
    // Supabase 설정에 따라 이메일 인증이 필요할 수 있습니다.
    alert('회원가입 요청 성공! 이메일 확인 또는 즉시 로그인이 가능합니다.')
  } else {
    alert(`회원가입 실패: ${result.error}`)
  }
})
