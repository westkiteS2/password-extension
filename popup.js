import { signIn, signUp } from './auth.js'

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  const { data, error } = await signIn(email, password)
  if (error) {
    alert('로그인 실패: ' + error.message)
  } else {
    alert('로그인 성공!')
    // 이제 recordHash 함수를 호출하면 DB에 저장됩니다!
  }
})
