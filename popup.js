document.addEventListener('DOMContentLoaded', function() {
  
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const matchesCount = document.getElementById('matchesCount');
  const matchesList = document.getElementById('matchesList');
  
  const termInput = document.getElementById('termInput');
  const definitionInput = document.getElementById('definitionInput');
  const addTermBtn = document.getElementById('addTermBtn');
  
  const dictionaryList = document.getElementById('dictionaryList');
  const pagination = document.getElementById('pagination');
  const searchDictionary = document.getElementById('searchDictionary');
  const totalTerms = document.getElementById('totalTerms');
  
  const refreshBtn = document.getElementById('refreshContentScript');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }).then(() => {
          showNotification('Content script перезагружен', 'success');
        }).catch(err => {
          showNotification('Ошибка: ' + err.message, 'error');
        });
      });
    });
  }

  let dictionary = [];
  let currentPage = 1;
  const itemsPerPage = 10;
  let searchQuery = '';
  let currentSearchResults = [];

  loadDictionary();
  setupTabs();
  setupEventListeners();

  function setupTabs() {
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        
        if (tabId === 'list') {
          renderDictionaryList();
        }
      });
    });
  }

  function setupEventListeners() {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const term = e.target.value.trim();
      
      if (term.length < 2) {
        searchResults.style.display = 'none';
        return;
      }
      
      searchTimeout = setTimeout(() => searchOnPage(term), 300);
    });

    addTermBtn.addEventListener('click', addTerm);

    searchDictionary.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1;
      renderDictionaryList();
    });

    matchesList.addEventListener('click', (e) => {
      const matchItem = e.target.closest('.match-item');
      if (matchItem) {
        const term = matchItem.dataset.term;
        termInput.value = term;
        searchInput.value = term;
        searchResults.style.display = 'none';
      }
    });
  }

  function searchOnPage(term) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.log('No active tab');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'searchOnPage',
        term: term
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error:', chrome.runtime.lastError.message);
          // Пробуем внедрить content script
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          }).then(() => {
            // Повторяем запрос через небольшую задержку
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'searchOnPage',
                term: term
              }, (retryResponse) => {
                if (retryResponse && retryResponse.matches) {
                  displaySearchResults(retryResponse.matches);
                } else {
                  displaySearchResults([]);
                }
              });
            }, 200);
          }).catch(err => {
            console.log('Failed to inject content script:', err);
            showNotification('Не удалось загрузить скрипт на страницу', 'error');
          });
          return;
        }
        
        if (response && response.matches) {
          displaySearchResults(response.matches);
        } else {
          displaySearchResults([]);
        }
      });
    });
  }

  function displaySearchResults(matches) {
    currentSearchResults = matches;
    
    if (matches.length === 0) {
      searchResults.style.display = 'none';
      return;
    }

    matchesCount.textContent = matches.length;
    matchesList.innerHTML = '';

    matches.slice(0, 5).forEach(match => {
      const div = document.createElement('div');
      div.className = 'match-item';
      div.dataset.term = match.term;
      div.innerHTML = `
        <div class="match-text">${escapeHtml(match.term)}</div>
        <div class="match-context">${escapeHtml(match.context)}</div>
      `;
      matchesList.appendChild(div);
    });

    searchResults.style.display = 'block';
  }

  function addTerm() {
    const term = termInput.value.trim();
    const definition = definitionInput.value.trim();

    if (!term) {
      showNotification('Введите термин', 'error');
      return;
    }

    if (!definition) {
      showNotification('Введите определение', 'error');
      return;
    }

    if (dictionary.some(item => item.term.toLowerCase() === term.toLowerCase())) {
      showNotification('Этот термин уже есть в словаре', 'error');
      return;
    }

    const newTerm = {
      id: Date.now(),
      term: term,
      comment: definition,
      dateAdded: new Date().toISOString()
    };

    dictionary.push(newTerm);
    saveDictionary();

    termInput.value = '';
    definitionInput.value = '';
    searchInput.value = '';
    searchResults.style.display = 'none';

    showNotification('Термин добавлен', 'success');
    updateTotalCount();
  }

  function loadDictionary() {
    chrome.storage.local.get(['dictionary'], (result) => {
      dictionary = result.dictionary || [];
      updateTotalCount();
      renderDictionaryList();
    });
  }

  function saveDictionary() {
    chrome.storage.local.set({ dictionary: dictionary }, () => {
      console.log('Dictionary saved');
    });
  }

  function updateTotalCount() {
    totalTerms.textContent = dictionary.length;
  }

  function getFilteredDictionary() {
    if (!searchQuery) return dictionary;
    return dictionary.filter(item => 
      item.term.toLowerCase().includes(searchQuery) ||
      item.comment.toLowerCase().includes(searchQuery)
    );
  }

  function getPaginatedItems(items) {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }

  function renderDictionaryList() {
    const filtered = getFilteredDictionary();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = getPaginatedItems(filtered);

    if (filtered.length === 0) {
      dictionaryList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #9aa9b9;">
          Словарь пуст
        </div>
      `;
      pagination.innerHTML = '';
      return;
    }

    dictionaryList.innerHTML = '';
    
    paginated.forEach(item => {
      const div = document.createElement('div');
      div.className = 'dictionary-item';
      div.innerHTML = `
        <div class="item-info">
          <div class="item-term">${escapeHtml(item.term)}</div>
          <div class="item-definition">${escapeHtml(item.comment)}</div>
        </div>
        <button class="item-delete" data-id="${item.id}">×</button>
      `;

      const deleteBtn = div.querySelector('.item-delete');
      deleteBtn.addEventListener('click', () => deleteTerm(item.id));

      dictionaryList.appendChild(div);
    });

    renderPagination(totalPages);
  }

  function deleteTerm(id) {
    dictionary = dictionary.filter(item => item.id !== id);
    saveDictionary();
    renderDictionaryList();
    updateTotalCount();
    showNotification('Термин удален', 'success');
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    pagination.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderDictionaryList();
      }
    });
    pagination.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => {
        currentPage = i;
        renderDictionaryList();
      });
      pagination.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '→';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderDictionaryList();
      }
    });
    pagination.appendChild(nextBtn);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  setTimeout(() => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script not loaded:', chrome.runtime.lastError.message);
          } else {
            console.log('Content script is active');
          }
        });
      }
    });
  }, 1000);
});
