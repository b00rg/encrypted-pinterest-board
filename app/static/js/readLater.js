const RL_KEY = 'bookshelf_read_later';
const RL_META_KEY = 'bookshelf_read_later_meta';

export function getReadLater() {
  try { return new Set(JSON.parse(localStorage.getItem(RL_KEY) || '[]')); }
  catch { return new Set(); }
}

/** Returns a map of work_id → {title, author, cover_id, year} for bookmarked books. */
export function getReadLaterMeta() {
  try { return JSON.parse(localStorage.getItem(RL_META_KEY) || '{}'); }
  catch { return {}; }
}

/**
 * Toggle a book in/out of Read Later.
 * @param {string} workId
 * @param {{title?, author?, cover_id?, year?}} [meta] - optional metadata to save alongside
 * @returns {boolean} true if now saved, false if removed
 */
export function toggleReadLater(workId, meta = null) {
  const set = getReadLater();
  const metaMap = getReadLaterMeta();

  if (set.has(workId)) {
    set.delete(workId);
    delete metaMap[workId];
  } else {
    set.add(workId);
    if (meta) metaMap[workId] = meta;
  }

  localStorage.setItem(RL_KEY, JSON.stringify([...set]));
  localStorage.setItem(RL_META_KEY, JSON.stringify(metaMap));
  return set.has(workId);
}

export function isReadLater(workId) {
  return getReadLater().has(workId);
}
