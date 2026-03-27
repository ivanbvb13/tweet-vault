// src/content/content.js
// Función para extraer datos del tweet desde un elemento article
function extractTweetData(tweetElement) {
  try {
    const tweetLink = tweetElement.querySelector('a[href*="/status/"]');
    const url = tweetLink ? 'https://x.com' + tweetLink.getAttribute('href') : window.location.href;
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    
    const authorNameEl = tweetElement.querySelector('[data-testid="User-Name"]');
    const authorName = authorNameEl?.querySelector('span')?.innerText || '';
    const handle = authorNameEl?.querySelector('a[role="link"]')?.innerText?.replace('@', '') || '';
    const text = tweetElement.querySelector('[data-testid="tweetText"]')?.innerText || '';
    const publishedAt = tweetElement.querySelector('time')?.getAttribute('datetime') || new Date().toISOString();

    const images = [];

    // Extraer imágenes (fotos)
    const imageElements = tweetElement.querySelectorAll('[data-testid="tweetPhoto"] img');
    imageElements.forEach(img => {
      const src = img.src;
      if (src && !src.includes('profile_images') && !src.includes('blob:')) {
        images.push({ type: 'image', url: src });
      }
    });

    // Extraer video - buscar thumbnail del video
    // Twitter muestra un contenedor con imagen thumbnail y un botón de play
    const videoPlayer = tweetElement.querySelector('[data-testid="videoPlayer"]');
    if (videoPlayer) {
      // Buscar la imagen del video (thumbnail)
      const videoImage = videoPlayer.querySelector('img[src*="video"]') || 
                         videoPlayer.querySelector('div[style*="background-image"]') ||
                         videoPlayer.querySelector('img');
      
      if (videoImage) {
        let thumbnailUrl = videoImage.src || videoImage.style?.backgroundImage?.replace(/url\(['"]?(.+?)['"]?\)/, '$1');
        if (thumbnailUrl && !thumbnailUrl.includes('profile_images') && !thumbnailUrl.includes('blob:')) {
          images.push({ type: 'video', url: thumbnailUrl, thumbnail: true });
        }
      }
      
      // Si no encontramos thumbnail, buscar el poster del video
      const videoEl = videoPlayer.querySelector('video');
      if (videoEl && videoEl.poster && !videoEl.poster.includes('blob:')) {
        images.push({ type: 'video', url: videoEl.poster, thumbnail: true });
      }
    }

    return {
      tweetId,
      url,
      text,
      author: authorName,
      handle,
      publishedAt,
      images: images.length > 0 ? images : null
    };
  } catch (error) {
    console.error('Error extrayendo datos del tweet:', error);
    return null;
  }
}

// Función para mostrar el modal de guardado
async function showSaveModal(tweetData) {
  // Verificar que chrome API esté disponible
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('Chrome runtime no disponible');
    return;
  }

  // Verificar autenticación primero
  const authResponse = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, resolve);
  });
  
  if (!authResponse?.authenticated) {
    alert('Por favor, inicia sesión en Tweet Vault desde el popup de la extensión.');
    return;
  }

  // Eliminar modal existente si lo hay
  const existingModal = document.getElementById('tweet-vault-modal');
  if (existingModal) existingModal.remove();

  // Crear modal
  const modal = document.createElement('div');
  modal.id = 'tweet-vault-modal';
  modal.className = 'tweet-vault-modal';
  
  modal.innerHTML = `
    <div class="tweet-vault-modal-overlay"></div>
    <div class="tweet-vault-modal-content">
      <div class="tweet-vault-header">
        <h2>Guardar en Tweet Vault</h2>
        <button class="tweet-vault-close" id="tweet-vault-close">×</button>
      </div>
      <div class="tweet-vault-preview">
        <div class="tweet-vault-author">
          <div class="tweet-vault-author-name">${tweetData.author}</div>
          <div class="tweet-vault-author-handle">@${tweetData.handle}</div>
        </div>
        <div class="tweet-vault-text">${tweetData.text}</div>
      </div>
      <div class="tweet-vault-form">
        <label for="tweet-vault-category">Selecciona una categoría</label>
        <select id="tweet-vault-category">
          <option value="">Cargando categorías...</option>
        </select>
      </div>
      <div class="tweet-vault-buttons">
        <button class="tweet-vault-btn-secondary" id="tweet-vault-cancel">Cancelar</button>
        <button class="tweet-vault-btn-primary" id="tweet-vault-save">Guardar tweet</button>
      </div>
      <div class="tweet-vault-success" id="tweet-vault-success" style="display: none;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <span>Tweet guardado correctamente</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Cargar categorías usando mensajería
  chrome.runtime.sendMessage({ action: 'getCategories' }, (response) => {
    const select = document.getElementById('tweet-vault-category');
    
    if (response && response.categories && response.categories.length > 0) {
      select.innerHTML = '';
      response.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        option.style.color = cat.color;
        if (cat.is_default || cat.isDefault) option.selected = true;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">No hay categorías</option>';
    }
  });

  // Event listeners
  const closeModal = () => modal.remove();
  
  document.getElementById('tweet-vault-close').addEventListener('click', closeModal);
  document.getElementById('tweet-vault-cancel').addEventListener('click', closeModal);

  document.getElementById('tweet-vault-save').addEventListener('click', () => {
    const categoryId = document.getElementById('tweet-vault-category').value;
    
    if (!categoryId) {
      alert('Por favor selecciona una categoría');
      return;
    }

    const saveButton = document.getElementById('tweet-vault-save');
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando...';

    // Guardar usando mensajería
    chrome.runtime.sendMessage({
      action: 'saveTweet',
      tweet: {
        ...tweetData,
        categoryId
      }
    }, (response) => {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar tweet';
      
      if (response.success) {
        // Mostrar feedback
        document.getElementById('tweet-vault-success').style.display = 'flex';
        setTimeout(() => modal.remove(), 2000);
      } else {
        alert(response.error || 'Error al guardar el tweet');
      }
    });
  });

  // Cerrar con ESC
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Cerrar al hacer clic en el overlay
  modal.querySelector('.tweet-vault-modal-overlay').addEventListener('click', closeModal);
}

// Función para interceptar clics en el botón de guardar de Twitter
function interceptSaveButton(tweetElement) {
  // Buscar el botón de bookmark/guardar de Twitter
  const bookmarkButton = tweetElement.querySelector('[data-testid="bookmark"]');
  
  if (bookmarkButton && !bookmarkButton.dataset.vaultIntercepted) {
    bookmarkButton.dataset.vaultIntercepted = 'true';
    
    bookmarkButton.addEventListener('click', (e) => {
      // Dejar que Twitter maneje el bookmark primero (no preventDefault)
      
      const tweetData = extractTweetData(tweetElement);
      if (!tweetData || !tweetData.tweetId) {
        console.error('No se pudo extraer la información del tweet');
        return;
      }
      
      // Delay para que Twitter termine su proceso de guardar
      setTimeout(() => {
        showSaveModal(tweetData);
      }, 100);
    });
  }
}

// Observador para detectar nuevos tweets
function processTweets() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tweet => {
    interceptSaveButton(tweet);
  });
}

// Inicializar después de que la página cargue
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processTweets);
} else {
  processTweets();
}

// Observar cambios en el DOM
const observer = new MutationObserver(() => {
  processTweets();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('Tweet Vault: Content script cargado correctamente');
