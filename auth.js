import { supabase } from './supabaseClient.js'

// 회원가입
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

// 로그인
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

// 로그아웃
export async function signOut() {
  await supabase.auth.signOut()
}
