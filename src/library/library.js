// src/library/library.js
let allTweets = [];
let categories = [];
let currentFilter = 'all';
let currentTweetId = null;

async function init() {
  // Verificar autenticación
  const isAuth = await checkAuth();
  if (!isAuth) {
    window.location.href = chrome.runtime.getURL('src/popup/popup.html');
    return;
  }

  await loadCategories();
  await loadTweets();
  
  renderCategories();
  renderTweets();

  document.getElementById('search').addEventListener('input', renderTweets);
  document.getElementById('btn-settings').addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('src/settings/settings.html');
  });

  // Event listeners del modal
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', handleCategoryChange);
  document.getElementById('category-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });
}

async function checkAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
      resolve(response?.authenticated || false);
    });
  });
}

async function loadCategories() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getCategories' }, (response) => {
      categories = response.categories || [];
      resolve();
    });
  });
}

async function loadTweets() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSavedTweets' }, (response) => {
      allTweets = response.tweets || [];
      resolve();
    });
  });
}

function renderCategories() {
  const container = document.getElementById('category-list');
  container.innerHTML = '';

  // Opción "Todos"
  const allItem = document.createElement('div');
  allItem.className = `category-item ${currentFilter === 'all' ? 'active' : ''}`;
  allItem.dataset.id = 'all';
  allItem.innerHTML = `
    <span class="category-dot" style="background: #000000;"></span>
    Todos los tweets
  `;
  allItem.addEventListener('click', () => {
    currentFilter = 'all';
    renderCategories();
    renderTweets();
  });
  container.appendChild(allItem);

  // Categorías
  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = `category-item ${currentFilter === cat.id ? 'active' : ''}`;
    item.dataset.id = cat.id;
    item.innerHTML = `
      <span class="category-dot" style="background: ${cat.color};"></span>
      ${cat.name}
    `;
    item.addEventListener('click', () => {
      currentFilter = cat.id;
      renderCategories();
      renderTweets();
    });
    container.appendChild(item);
  });
}

function renderTweets() {
  const query = document.getElementById('search').value.toLowerCase();
  const grid = document.getElementById('tweet-grid');
  grid.innerHTML = '';

  const filtered = allTweets.filter(t => {
    const matchesFilter = currentFilter === 'all' || t.categoryId === currentFilter;
    const matchesSearch = t.text.toLowerCase().includes(query) || 
                          t.author.toLowerCase().includes(query) || 
                          t.handle.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No hay tweets guardados</div>
        <div>Comienza guardando tweets desde X/Twitter</div>
      </div>
    `;
    return;
  }

  filtered.forEach(t => {
    const cat = categories.find(c => c.id === t.categoryId) || { name: 'Sin categoría', color: '#666666' };
    const date = new Date(t.publishedAt).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const card = document.createElement('div');
    card.className = 'tweet-card';
    
    let imagesHTML = '';
    if (t.images && t.images.length > 0) {
      const imageClass = t.images.length === 1 ? 'tweet-images single' : 'tweet-images';
      
      const mediaContent = t.images.map(media => {
        if (media.type === 'video') {
          return `
            <div class="tweet-media video-container">
              <img src="${media.url}" class="tweet-image" alt="Video thumbnail">
              <div class="play-icon">▶</div>
            </div>
          `;
        } else {
          return `<img src="${media.url}" class="tweet-image" alt="Tweet image">`;
        }
      }).join('');
      
      imagesHTML = `<div class="${imageClass}">${mediaContent}</div>`;
    }

    card.innerHTML = `
      <div class="tweet-actions">
        <button class="btn-action" data-id="${t.id}" data-action="change-category">Cambiar</button>
        <button class="btn-action danger" data-id="${t.id}" data-action="delete">Eliminar</button>
      </div>
      <div class="tweet-author-info">
        <span class="tweet-author-name">${t.author}</span>
        <span class="tweet-author-handle">@${t.handle}</span>
      </div>
      <div class="tweet-text">${t.text}</div>
      ${imagesHTML}
      <div class="tweet-meta">
        <div>
          <span class="category-tag" style="background: ${cat.color}">${cat.name}</span>
          <span style="margin-left: 8px;">${date}</span>
        </div>
        <a href="${t.url}" target="_blank" class="tweet-link">Ver original →</a>
      </div>
    `;
    
    // Event listeners para botones de acción
    card.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const tweetId = btn.dataset.id;
        
        console.log(`Action: ${action}, TweetId: ${tweetId}`);

        if (action === 'delete') {
          await handleDeleteTweet(tweetId, t.text);
        } else if (action === 'change-category') {
          handleOpenCategoryModal(tweetId, t.categoryId);
        }
      });
    });
    
    grid.appendChild(card);
  });
}

async function handleDeleteTweet(tweetId, tweetText) {
  const preview = tweetText.length > 50 ? tweetText.substring(0, 50) + '...' : tweetText;
  
  if (!confirm(`¿Estás seguro de que quieres eliminar este tweet?\n\n"${preview}"`)) {
    return;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'deleteTweet',
      tweetId
    }, async (response) => {
      if (response.success) {
        await loadTweets();
        renderTweets();
        resolve(true);
      } else {
        alert('Error al eliminar el tweet: ' + (response.error || 'Unknown error'));
        resolve(false);
      }
    });
  });
}

function handleOpenCategoryModal(tweetId, currentCategoryId) {
  currentTweetId = tweetId;
  
  // Cargar categorías en el select
  const select = document.getElementById('modal-category-select');
  select.innerHTML = '';
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    if (cat.id === currentCategoryId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // Mostrar modal
  document.getElementById('category-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('category-modal').classList.remove('active');
  currentTweetId = null;
}

function handleCategoryChange() {
  const newCategoryId = document.getElementById('modal-category-select').value;
  
  if (!currentTweetId) {
    closeModal();
    return;
  }

  console.log('Sending updateTweetCategory for:', currentTweetId, 'to cat:', newCategoryId);

  chrome.runtime.sendMessage({
    action: 'updateTweetCategory',
    tweetId: currentTweetId,
    categoryId: newCategoryId
  }, async (response) => {
    console.log('Update response:', response);
    if (response.success) {
      await loadTweets();
      renderTweets();
      closeModal();
    } else {
      alert('Error al cambiar la categoría: ' + (response.error || 'Unknown error'));
    }
  });
}

init();
