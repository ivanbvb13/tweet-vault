// src/settings/settings.js
let categories = [];

async function init() {
  // Verificar autenticación
  const isAuth = await checkAuth();
  if (!isAuth) {
    window.location.href = chrome.runtime.getURL('src/popup/popup.html');
    return;
  }

  await loadCategories();
  renderCategories();

  document.getElementById('add-category-form').addEventListener('submit', handleAddCategory);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
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

function renderCategories() {
  const container = document.getElementById('category-list');
  container.innerHTML = '';

  if (categories.length === 0) {
    container.innerHTML = '<div style="color: #666666; font-size: 0.875rem; text-align: center; padding: 20px;">No hay categorías</div>';
    return;
  }

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';
    
    const isDefault = cat.name === 'Default';
    const defaultBadge = cat.is_default ? '<span class="category-default-badge">Por defecto</span>' : '';

    item.innerHTML = `
      <div class="category-info">
        <input type="color" class="category-color" value="${cat.color}" data-id="${cat.id}" ${isDefault ? 'disabled' : ''}>
        <span class="category-name">${cat.name}</span>
        ${defaultBadge}
      </div>
      <div class="category-actions">
        ${!cat.is_default ? `<button class="btn-icon" data-id="${cat.id}" data-action="set-default">Predeterminada</button>` : ''}
        ${!isDefault ? `<button class="btn-icon danger" data-id="${cat.id}" data-action="delete">Eliminar</button>` : '<button class="btn-icon disabled" disabled>No se puede eliminar</button>'}
      </div>
    `;

    container.appendChild(item);

    // Event listener para cambiar color
    if (!isDefault) {
      const colorInput = item.querySelector('.category-color');
      colorInput.addEventListener('change', (e) => {
        handleColorChange(cat.id, e.target.value);
      });
    }

    // Event listeners para acciones
    item.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        
        if (action === 'delete') {
          handleDeleteCategory(id, cat.name);
        } else if (action === 'set-default') {
          handleSetDefault(id);
        }
      });
    });
  });
}

async function handleAddCategory(e) {
  e.preventDefault();
  
  const name = document.getElementById('new-category-name').value.trim();
  const color = document.getElementById('new-category-color').value;

  if (!name) {
    showAlert('Por favor ingresa un nombre para la categoría', 'error');
    return;
  }

  // Verificar si ya existe
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showAlert('Ya existe una categoría con ese nombre', 'error');
    return;
  }

  chrome.runtime.sendMessage({
    action: 'addCategory',
    name,
    color
  }, async (response) => {
    console.log('Add category response:', response);
    if (response.success) {
      showAlert('Categoría agregada correctamente', 'success');
      document.getElementById('add-category-form').reset();
      document.getElementById('new-category-color').value = '#000000';
      await loadCategories();
      renderCategories();
    } else {
      showAlert('Error al agregar la categoría: ' + (response.error || 'Unknown error'), 'error');
    }
  });
}

function handleDeleteCategory(categoryId, categoryName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la categoría "${categoryName}"?\n\nLos tweets de esta categoría se moverán a "Default".`)) {
    return;
  }

  chrome.runtime.sendMessage({
    action: 'deleteCategory',
    categoryId
  }, async (response) => {
    if (response.success) {
      showAlert('Categoría eliminada correctamente', 'success');
      await loadCategories();
      renderCategories();
    } else {
      showAlert(response.error || 'Error al eliminar la categoría', 'error');
    }
  });
}

function handleSetDefault(categoryId) {
  // Actualizar todas las categorías
  categories.forEach(cat => {
    chrome.runtime.sendMessage({
      action: 'updateCategory',
      categoryId: cat.id,
      updates: { is_default: cat.id === categoryId }
    });
  });

  setTimeout(async () => {
    showAlert('Categoría predeterminada actualizada', 'success');
    await loadCategories();
    renderCategories();
  }, 100);
}

function handleColorChange(categoryId, newColor) {
  chrome.runtime.sendMessage({
    action: 'updateCategory',
    categoryId,
    updates: { color: newColor }
  }, async (response) => {
    if (response.success) {
      await loadCategories();
      renderCategories();
    }
  });
}

function handleLogout() {
  if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
    return;
  }

  chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
    if (response.success) {
      window.location.href = chrome.runtime.getURL('src/auth/auth.html');
    } else {
      alert('Error al cerrar sesión');
    }
  });
}

function showAlert(message, type) {
  const alert = document.getElementById('alert');
  alert.textContent = message;
  alert.className = `alert alert-${type}`;
  alert.classList.remove('hidden');

  setTimeout(() => {
    alert.classList.add('hidden');
  }, 3000);
}

init();
