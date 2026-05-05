import { supabase } from './supabaseClient.js'

const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginBtn = document.getElementById('login-btn')
const signupBtn = document.getElementById('signup-btn')
const logoutBtn = document.getElementById('logout-btn')
const authSection = document.getElementById('auth-section')
const successSection = document.getElementById('success-section')
const userEmail = document.getElementById('user-email')
const statusMsg = document.getElementById('status-msg')

function showStatus(msg, isError = false) {
  statusMsg.textContent = msg
  statusMsg.style.color = isError ? '#f55' : '#4f8ef7'
}

function showSuccess(session) {
  authSection.style.display = 'none'
  successSection.style.display = 'block'
  userEmail.textContent = session.user.email
}

function showLogin() {
  authSection.style.display = 'block'
  successSection.style.display = 'none'
}

// 팝업 열릴 때 세션 확인
chrome.storage.local.get(['session'], (result) => {
  if (result.session) {
    showSuccess(result.session)
  }
})

// 로그인
loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()
  if (!email || !password)
    return showStatus('이메일과 비밀번호를 입력해주세요.', true)

  showStatus('로그인 중...')
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) return showStatus(error.message, true)

  chrome.storage.local.set({ session: data.session }, () => {
    showSuccess(data.session)
  })
})

// 회원가입
signupBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()
  if (!email || !password)
    return showStatus('이메일과 비밀번호를 입력해주세요.', true)

  showStatus('회원가입 중...')
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) return showStatus(error.message, true)

  if (data.session) {
    chrome.storage.local.set({ session: data.session }, () => {
      showSuccess(data.session)
    })
  } else {
    showStatus('회원가입 성공! 이메일을 확인하거나 로그인해주세요.')
  }
})

// 로그아웃
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut()
  chrome.storage.local.remove(['session'], () => {
    showLogin()
  })
})
