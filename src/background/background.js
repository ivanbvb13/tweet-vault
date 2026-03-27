// src/background/background.js
import { supabase, getCurrentUser } from '../config/supabase.js'

chrome.runtime.onInstalled.addListener(() => {
  console.log('Tweet Vault instalado con Supabase.')
})

// Manejar mensajes desde content scripts y otras partes de la extensión
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Verificar autenticación
  if (request.action === 'checkAuth') {
    checkAuthentication().then(sendResponse)
    return true
  }

  // Obtener categorías
  if (request.action === 'getCategories') {
    handleGetCategories().then(sendResponse)
    return true
  }
  
  // Guardar tweet
  if (request.action === 'saveTweet') {
    handleSaveTweet(request.tweet).then(sendResponse)
    return true
  }
  
  // Obtener tweets guardados
  if (request.action === 'getSavedTweets') {
    handleGetTweets().then(sendResponse)
    return true
  }

  // Agregar categoría
  if (request.action === 'addCategory') {
    handleAddCategory(request.name, request.color).then(sendResponse)
    return true
  }

  // Eliminar categoría
  if (request.action === 'deleteCategory') {
    handleDeleteCategory(request.categoryId).then(sendResponse)
    return true
  }

  // Actualizar categoría
  if (request.action === 'updateCategory') {
    handleUpdateCategory(request.categoryId, request.updates).then(sendResponse)
    return true
  }

  // Eliminar tweet
  if (request.action === 'deleteTweet') {
    handleDeleteTweet(request.tweetId).then(sendResponse)
    return true
  }

  // Actualizar categoría de tweet
  if (request.action === 'updateTweetCategory') {
    handleUpdateTweetCategory(request.tweetId, request.categoryId).then(sendResponse)
    return true
  }

  // Cerrar sesión
  if (request.action === 'logout') {
    handleLogout().then(sendResponse)
    return true
  }
})

// Verificar autenticación
async function checkAuthentication() {
  try {
    await supabase.refreshSession()
    const { data: { session } } = await supabase.auth.getSession()
    return { authenticated: !!session?.user }
  } catch (error) {
    console.error('Error checking auth:', error)
    return { authenticated: false }
  }
}

// Handlers
async function handleGetCategories() {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado', categories: [] }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) throw error
    return { success: true, categories: data || [] }
  } catch (error) {
    console.error('Error getting categories:', error)
    return { success: false, error: error.message, categories: [] }
  }
}

async function handleSaveTweet(tweet) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // Verificar duplicados
    const { data: existing } = await supabase
      .from('tweets')
      .select('id')
      .eq('user_id', user.id)
      .eq('tweet_id', tweet.tweetId)
      .single()

    if (existing) {
      return { success: false, error: 'Tweet ya guardado' }
    }

    // Guardar tweet
    const { error } = await supabase.from('tweets').insert({
      user_id: user.id,
      tweet_id: tweet.tweetId,
      url: tweet.url,
      text: tweet.text,
      author: tweet.author,
      handle: tweet.handle,
      published_at: tweet.publishedAt,
      category_id: tweet.categoryId,
      images: tweet.images || []
    })

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error saving tweet:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetTweets() {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado', tweets: [] }

    const { data, error } = await supabase
      .from('tweets')
      .select('*')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false })

    if (error) throw error
    
    // Transformar los datos al formato esperado por el frontend
    const tweets = (data || []).map(t => ({
      id: t.id,
      tweetId: t.tweet_id,
      url: t.url,
      text: t.text,
      author: t.author,
      handle: t.handle,
      publishedAt: t.published_at,
      savedAt: t.saved_at,
      categoryId: t.category_id,
      images: t.images
    }))

    return { success: true, tweets }
  } catch (error) {
    console.error('Error getting tweets:', error)
    return { success: false, error: error.message, tweets: [] }
  }
}

async function handleAddCategory(name, color) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    console.log('Adding category:', name, 'for user:', user.id)

    const { data, error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: name,
      color: color || '#000000',
      is_default: false
    })

    if (error) {
      console.error('Supabase add category error:', error)
      throw error
    }
    
    // Si llegamos aquí sin error, la inserción fue exitosa.
    // En PostgREST, si no usamos 'Prefer': 'return=representation', data será null
    return { success: true, category: data ? data[0] : null }
  } catch (error) {
    console.error('Error adding category:', error)
    return { success: false, error: error.message }
  }
}

async function handleDeleteCategory(categoryId) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // Verificar si es la categoría Default
    const { data: category } = await supabase
      .from('categories')
      .select('name')
      .eq('id', categoryId)
      .single()

    if (category?.name === 'Default') {
      return { success: false, error: 'No puedes eliminar la categoría Default' }
    }

    // Obtener categoría Default
    const { data: defaultCat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', 'Default')
      .single()

    // Mover tweets a Default
    if (defaultCat) {
      await supabase
        .from('tweets')
        .eq('user_id', user.id)
        .eq('category_id', categoryId)
        .update({ category_id: defaultCat.id })
    }

    // Eliminar categoría
    const { error } = await supabase
      .from('categories')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .delete()

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error deleting category:', error)
    return { success: false, error: error.message }
  }
}

async function handleUpdateCategory(categoryId, updates) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // Si se está marcando como default, desmarcar las demás
    if (updates.is_default || updates.isDefault) {
      await supabase
        .from('categories')
        .eq('user_id', user.id)
        .update({ is_default: false })
    }

    const { error } = await supabase
      .from('categories')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .update({
        name: updates.name,
        color: updates.color,
        is_default: updates.is_default || updates.isDefault
      })

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error updating category:', error)
    return { success: false, error: error.message }
  }
}

async function handleDeleteTweet(tweetId) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    console.log('Deleting tweet:', tweetId, 'for user:', user.id)

    const { error } = await supabase
      .from('tweets')
      .eq('id', tweetId)
      .eq('user_id', user.id)
      .delete()

    if (error) {
      console.error('Supabase delete error:', error)
      throw error
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error deleting tweet:', error)
    return { success: false, error: error.message }
  }
}

async function handleUpdateTweetCategory(tweetId, categoryId) {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    console.log('Updating tweet:', tweetId, 'to category:', categoryId, 'for user:', user.id)

    const { error } = await supabase
      .from('tweets')
      .eq('id', tweetId)
      .eq('user_id', user.id)
      .update({ category_id: categoryId })

    if (error) {
      console.error('Supabase update error:', error)
      throw error
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error updating tweet category:', error)
    return { success: false, error: error.message }
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error logging out:', error)
    return { success: false, error: error.message }
  }
}
