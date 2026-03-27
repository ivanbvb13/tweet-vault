// src/utils/storage.js
export const DEFAULT_CATEGORIES = [
  { id: '1', name: 'Ideas / Inspiración', color: '#6366f1', isDefault: true, createdAt: new Date().toISOString() },
  { id: '2', name: 'Recursos / Herramientas', color: '#10b981', isDefault: false, createdAt: new Date().toISOString() },
  { id: '3', name: 'Noticias / Tendencias', color: '#f59e0b', isDefault: false, createdAt: new Date().toISOString() },
  { id: '4', name: 'Humor / Entretenimiento', color: '#ec4899', isDefault: false, createdAt: new Date().toISOString() }
];

export async function getCategories() {
  const data = await chrome.storage.local.get('categories');
  if (!data.categories) {
    await chrome.storage.local.set({ categories: DEFAULT_CATEGORIES });
    return DEFAULT_CATEGORIES;
  }
  return data.categories;
}

export async function getSavedTweets() {
  const data = await chrome.storage.local.get('tweets');
  return data.tweets || [];
}

export async function saveTweet(tweet) {
  const tweets = await getSavedTweets();
  const exists = tweets.find(t => t.tweetId === tweet.tweetId);
  if (exists) {
    throw new Error('Tweet ya guardado');
  }
  tweets.unshift({
    ...tweet,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString()
  });
  await chrome.storage.local.set({ tweets });
}

export async function addCategory(name, color = '#6366f1') {
  const categories = await getCategories();
  const newCat = {
    id: crypto.randomUUID(),
    name,
    color,
    isDefault: false,
    createdAt: new Date().toISOString()
  };
  categories.push(newCat);
  await chrome.storage.local.set({ categories });
  return newCat;
}
