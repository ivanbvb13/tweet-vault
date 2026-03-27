// src/auth/auth.js
import { supabase } from '../config/supabase.js'

// Redirect to popup if already logged in
async function checkAuthAndRedirect() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    window.location.href = chrome.runtime.getURL('src/popup/popup.html')
  }
}
checkAuthAndRedirect()

// Manejar tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab
    
    // Actualizar tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    
    // Actualizar forms
    document.querySelectorAll('.form-view').forEach(form => form.classList.remove('active'))
    document.getElementById(`${targetTab}-form`).classList.add('active')
    
    // Limpiar alerta
    hideAlert()
  })
})

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value
  const btn = document.getElementById('login-btn')
  
  btn.disabled = true
  btn.innerHTML = '<span class="loading"></span>Iniciando sesión...'
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword(email, password)
    
    if (error) throw error
    
    showAlert('¡Sesión iniciada correctamente!', 'success')
    
    // Redirigir el popup a la biblioteca
    setTimeout(() => {
      window.location.href = chrome.runtime.getURL('src/popup/popup.html')
    }, 1000)
    
  } catch (error) {
    console.error('Login error:', error)
    showAlert(error.message || 'Error al iniciar sesión', 'error')
    btn.disabled = false
    btn.innerHTML = 'Iniciar Sesión'
  }
})

// Register
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const email = document.getElementById('register-email').value
  const password = document.getElementById('register-password').value
  const passwordConfirm = document.getElementById('register-password-confirm').value
  const btn = document.getElementById('register-btn')
  
  // Validar contraseñas
  if (password !== passwordConfirm) {
    showAlert('Las contraseñas no coinciden', 'error')
    return
  }
  
  btn.disabled = true
  btn.innerHTML = '<span class="loading"></span>Creando cuenta...'
  
  try {
    const { data, error } = await supabase.auth.signUp(email, password)
    
    if (error) throw error
    
    // Crear categorías por defecto para el nuevo usuario
    if (data.user) {
      await createDefaultCategories(data.user.id)
    }
    
    showAlert('¡Cuenta creada! Iniciando sesión...', 'success')
    
    // Redirigir el popup a la biblioteca
    setTimeout(() => {
      window.location.href = chrome.runtime.getURL('src/popup/popup.html')
    }, 1500)
    
  } catch (error) {
    console.error('Register error:', error)
    showAlert(error.message || 'Error al crear la cuenta', 'error')
    btn.disabled = false
    btn.innerHTML = 'Crear Cuenta'
  }
})

// Crear categorías por defecto
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

// Helpers
function showAlert(message, type) {
  const alert = document.getElementById('alert')
  alert.textContent = message
  alert.className = `alert alert-${type} show`
}

function hideAlert() {
  const alert = document.getElementById('alert')
  alert.className = 'alert'
}
