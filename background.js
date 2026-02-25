let dictionary = [];


chrome.storage.local.get(['dictionary'], function(result) {
  dictionary = result.dictionary || [];
  console.log('Dictionary loaded:', dictionary.length, 'entries');
});


chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local' && changes.dictionary) {
    dictionary = changes.dictionary.newValue || [];
    console.log('Dictionary updated:', dictionary.length, 'entries');
    
    
    updateAllTabs();
  }
});


function updateAllTabs() {
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome:
        chrome.tabs.sendMessage(tab.id, {
          action: 'dictionaryUpdated',
          dictionary: dictionary
        }).catch(() => {});
      }
    });
  });
}


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getDictionary') {
    sendResponse({ dictionary: dictionary });
  }
  
  if (request.action === 'getStats') {
    sendResponse({ 
      total: dictionary.length,
      active: dictionary.filter(w => w.comment && w.comment.trim()).length 
    });
  }
  
  return true;
});


chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    chrome.storage.local.set({ dictionary: [] });
  }
});