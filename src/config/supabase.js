// src/config/supabase.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

// Cliente de Supabase usando fetch directo (sin librería externa)
class SupabaseClient {
  constructor(url, key) {
    this.url = url
    this.key = key
    this.session = null
    this.sessionLoadPromise = null
  }

  isSessionExpired() {
    if (!this.session?.expires_at) return false
    return Date.now() >= this.session.expires_at
  }

  async loadSession() {
    if (this.sessionLoadPromise) {
      return this.sessionLoadPromise
    }
    
    if (this.session !== null || this.session === false) {
      return
    }

    this.sessionLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get('supabase_session', async (result) => {
        if (result.supabase_session) {
          this.session = result.supabase_session
          if (this.isSessionExpired()) {
            console.log('Session expired, attempting refresh...')
            const refreshed = await this.refreshAccessToken()
            if (!refreshed) {
              this.session = false
            }
          } else {
            console.log('Session loaded from storage:', { userId: this.session?.user?.id })
          }
        } else {
          this.session = false
          console.log('No session found in storage')
        }
        this.sessionLoadPromise = null
        resolve()
      })
    })
    
    return this.sessionLoadPromise
  }

  saveSession(session) {
    this.session = session
    chrome.storage.local.set({ supabase_session: session }, () => {
      console.log('Session saved to storage:', { userId: session?.user?.id })
    })
  }

  clearSession() {
    this.session = false
    chrome.storage.local.remove('supabase_session', () => {
      console.log('Session cleared from storage')
    })
  }

  async refreshAccessToken() {
    if (!this.session?.refresh_token) {
      console.log('No refresh token available')
      return false
    }

    try {
      const response = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: JSON.stringify({ refresh_token: this.session.refresh_token })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        console.log('Token refresh failed:', data.message)
        this.clearSession()
        return false
      }

      this.saveSession(data)
      console.log('Token refreshed successfully')
      return true
    } catch (error) {
      console.error('Error refreshing token:', error)
      this.clearSession()
      return false
    }
  }

  async refreshSession() {
    this.session = null
    await this.loadSession()
  }

  getHeaders(useAuth = true) {
    const headers = {
      'apikey': this.key,
      'Content-Type': 'application/json'
    }
    if (useAuth && this.session?.access_token) {
      headers['Authorization'] = `Bearer ${this.session.access_token}`
    }
    return headers
  }

  // Auth methods
  async signUp(email, password) {
    try {
      const response = await fetch(`${this.url}/auth/v1/signup`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: JSON.stringify({ 
          email: email, 
          password: password 
        })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.msg || data.message || data.error_description || 'Error en registro')
      }
      if (data.access_token) {
        this.saveSession(data)
      }
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  async signIn(email, password) {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.getHeaders(false),
      body: JSON.stringify({ email, password })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Error en login')
    this.saveSession(data)
    return { data, error: null }
  }

  async signOut() {
    try {
      await fetch(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: this.getHeaders()
      })
    } finally {
      this.clearSession()
    }
    return { error: null }
  }

  async getUser() {
    await this.loadSession()
    
    if (!this.session || this.session === false) {
      return { data: { user: null }, error: null }
    }
    
    if (!this.session?.access_token) {
      return { data: { user: null }, error: null }
    }
    
    try {
      const response = await fetch(`${this.url}/auth/v1/user`, {
        headers: this.getHeaders()
      })
      
      if (!response.ok) {
        if (response.status === 401 && this.session?.refresh_token) {
          console.log('Token expired, attempting refresh...')
          const refreshed = await this.refreshAccessToken()
          if (refreshed) {
            return this.getUser()
          }
        }
        console.log('Session invalid, clearing...')
        this.clearSession()
        return { data: { user: null }, error: new Error('Invalid session') }
      }
      
      const user = await response.json()
      console.log('User verified:', { userId: user?.id })
      return { data: { user }, error: null }
    } catch (error) {
      console.error('Error verifying user:', error)
      this.clearSession()
      return { data: { user: null }, error }
    }
  }

  async verifySession() {
    const result = await this.getUser()
    return !!result.data?.user
  }

  async getSession() {
    await this.loadSession()
    
    // Si no hay sesión cargada, verificar con getUser
    if (!this.session || this.session === false) {
      return { data: { session: null }, error: null }
    }
    
    // Verificar que la sesión sigue válida
    const userResult = await this.getUser()
    if (!userResult.data?.user) {
      return { data: { session: null }, error: null }
    }
    
    return { data: { session: this.session }, error: null }
  }

  // Database methods
  from(table) {
    return new QueryBuilder(this, table)
  }

  get auth() {
    return {
      signUp: this.signUp.bind(this),
      signInWithPassword: this.signIn.bind(this),
      signOut: this.signOut.bind(this),
      getUser: this.getUser.bind(this),
      getSession: this.getSession.bind(this)
    }
  }
}

class QueryBuilder {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.filters = []
    this.selectFields = '*'
    this.orderField = null
    this.orderAsc = true
    this.limitCount = null
    this.isSingle = false
  }

  select(fields = '*') {
    this.selectFields = fields
    return this
  }

  eq(column, value) {
    this.filters.push(`${column}=eq.${value}`)
    return this
  }

  order(column, options = {}) {
    this.orderField = column
    this.orderAsc = options.ascending !== false
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  buildUrl() {
    let url = `${this.client.url}/rest/v1/${this.table}?select=${this.selectFields}`
    if (this.filters.length > 0) {
      url += '&' + this.filters.join('&')
    }
    if (this.orderField) {
      url += `&order=${this.orderField}.${this.orderAsc ? 'asc' : 'desc'}`
    }
    if (this.limitCount) {
      url += `&limit=${this.limitCount}`
    }
    return url
  }

  async execute() {
    const url = this.buildUrl()
    const headers = this.client.getHeaders()
    if (this.isSingle) {
      headers['Accept'] = 'application/vnd.pgrst.object+json'
    }
    
    const response = await fetch(url, { headers })
    if (!response.ok) {
      const error = await response.text()
      return { data: null, error: new Error(error) }
    }
    const data = await response.json()
    return { data, error: null }
  }

  // Alias for execute
  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async insert(data) {
    const url = `${this.client.url}/rest/v1/${this.table}`
    const headers = {
      ...this.client.getHeaders(),
      'Prefer': 'return=representation'
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.text()
      return { data: null, error: new Error(error) }
    }
    const result = await response.json()
    return { data: result, error: null }
  }

  async update(data) {
    const url = this.buildUrl()
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.client.getHeaders(),
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.text()
      return { error: new Error(error) }
    }
    return { error: null }
  }

  async delete() {
    const url = this.buildUrl()
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.client.getHeaders()
    })
    
    if (!response.ok) {
      const error = await response.text()
      return { error: new Error(error) }
    }
    return { error: null }
  }
}

// Exportar instancia global
export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper para obtener el usuario actual
export async function getCurrentUser() {
  await supabase.refreshSession()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('Error getting user:', error)
    return null
  }
  return user
}

// Helper para verificar si hay sesión activa
export async function isAuthenticated() {
  await supabase.refreshSession()
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}
