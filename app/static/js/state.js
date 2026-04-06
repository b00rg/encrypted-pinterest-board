export const state = {
  user: null,
  view: 'loading', // 'loading' | 'auth' | 'shelf' | 'pending' | 'admin' | 'shelves' | 'access'
  shelfBooks: [],
  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  adminUsers: [],
  adminSearchQuery: '',
  loadingShelf: false,
  readLaterFilter: false,
  // Group shelves
  myShelves: [],
  activeShelfId: null,
  activeShelfBooks: [],
  loadingShelfBooks: false,
  shelvesTab: 'shelf',         // 'shelf' | 'all' | 'readLater'
  allShelvesBooks: [],         // [{...bookDetails, shelf_id, shelf_name}]
  loadingAllBooks: false,
  // Access requests / invitations
  pendingInvitations: [],      // [{id, shelf_id, shelf_name, owner_username, created_at}]
  pendingRequests: [],         // [{id, shelf_id, shelf_name, owner_username, created_at}]
  shelfDiscoverResults: [],    // [{id, name, owner_username, has_pending_request}]
  shelfDiscoverQuery: '',
  shelfDiscoverLoading: false,
  // Review display
  showEncryptedReviews: false,
  readLaterReviews: {},        // { work_id: [{shelf_id, shelf_name, book_id, reviews:[]}] }
  loadingReadLaterReviews: false,
};
