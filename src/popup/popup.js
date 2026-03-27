// src/popup/popup.js
import { supabase } from '../config/supabase.js'

let isAuthView = false

async function init() {
  const isAuth = await checkAuth()
  
  if (isAuth) {
    showHomeView()
    loadStats()
  } else {
    showAuthView()
  }
  
  setupEventListeners()
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById('login-form').classList.toggle('hidden', targetTab !== 'login')
      document.getElementById('register-form').classList.toggle('hidden', targetTab !== 'register')
      hideAlert()
    })
  })

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('login-email').value.trim()
    const password = document.getElementById('login-password').value
    const btn = document.getElementById('login-btn')
    
    if (!email || !password) {
      showAlert('Email y contraseña son requeridos', 'error')
      return
    }
    
    btn.disabled = true
    btn.innerHTML = '<span class="loading"><span class="spinner"></span>Iniciando...</span>'
    
    try {
      const { error } = await supabase.auth.signInWithPassword(email, password)
      if (error) throw error
      
      showAlert('¡Sesión iniciada!', 'success')
      setTimeout(() => {
        showHomeView()
        loadStats()
      }, 800)
    } catch (error) {
      showAlert(error.message || 'Error al iniciar sesión', 'error')
      btn.disabled = false
      btn.textContent = 'Iniciar Sesión'
    }
  })

  // Register form
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('register-email').value.trim()
    const password = document.getElementById('register-password').value
    const passwordConfirm = document.getElementById('register-password-confirm').value
    const btn = document.getElementById('register-btn')
    
    if (!email || !password) {
      showAlert('Email y contraseña son requeridos', 'error')
      return
    }
    
    if (password !== passwordConfirm) {
      showAlert('Las contraseñas no coinciden', 'error')
      return
    }
    
    btn.disabled = true
    btn.innerHTML = '<span class="loading"><span class="spinner"></span>Creando...</span>'
    
    try {
      const { data, error } = await supabase.auth.signUp(email, password)
      
      if (error) throw error
      
      if (data.user) {
        await createDefaultCategories(data.user.id)
      }
      
      showAlert('¡Cuenta creada!', 'success')
      setTimeout(() => {
        showHomeView()
        loadStats()
      }, 800)
    } catch (error) {
      showAlert(error.message || 'Error al crear cuenta', 'error')
      btn.disabled = false
      btn.textContent = 'Crear Cuenta'
    }
  })

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut()
    showAuthView()
  })

  // Open library
  document.getElementById('open-library').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/library/library.html') })
    window.close()
  })

  // Open settings
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') })
    window.close()
  })
}

async function createDefaultCategories(userId) {
  const defaultCategories = [
    { name: 'Default', color: '#000000', is_default: true },
    { name: 'Ideas / Inspiración', color: '#8b5cf6', is_default: false },
    { name: 'Recursos / Herramientas', color: '#10b981', is_default: false },
    { name: 'Noticias / Tendencias', color: '#f59e0b', is_default: false },
    { name: 'Humor / Entretenimiento', color: '#ec4899', is_default: false }
  ]
  
  for (const cat of defaultCategories) {
    await supabase.from('categories').insert({
      user_id: userId,
      name: cat.name,
      color: cat.color,
      is_default: cat.is_default
    })
  }
}

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}

function showHomeView() {
  document.getElementById('home-view').classList.remove('hidden')
  document.getElementById('auth-view').classList.add('hidden')
}

function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden')
  document.getElementById('home-view').classList.add('hidden')
  isAuthView = true
}

function showAlert(message, type) {
  const alert = document.getElementById('alert')
  alert.textContent = message
  alert.className = `alert alert-${type}`
}

function hideAlert() {
  const alert = document.getElementById('alert')
  alert.className = 'alert hidden'
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getSavedTweets' }, (response) => {
    const totalTweets = response.tweets?.length || 0
    document.getElementById('total-tweets').textContent = totalTweets
  })

  chrome.runtime.sendMessage({ action: 'getCategories' }, (response) => {
    const totalCategories = response.categories?.length || 0
    document.getElementById('total-categories').textContent = totalCategories
  })
}

init()