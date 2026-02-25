let dictionary = [];


function loadDictionary() {
  chrome.runtime.sendMessage({ action: 'getDictionary' }, function(response) {
    if (response && response.dictionary) {
      dictionary = response.dictionary;
      applyReplacements();
    }
  });
}


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'dictionaryUpdated') {
    dictionary = request.dictionary;
    applyReplacements();
    sendResponse({ received: true });
  }
  
  if (request.action === 'searchOnPage') {
    const term = request.term.toLowerCase();
    const matches = [];
    
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentNode;
          if (parent.nodeName === 'SCRIPT' || 
              parent.nodeName === 'STYLE' ||
              parent.nodeName === 'TEXTAREA' ||
              parent.nodeName === 'INPUT') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue;
      if (text.toLowerCase().includes(term)) {
        
        const index = text.toLowerCase().indexOf(term);
        const start = Math.max(0, index - 30);
        const end = Math.min(text.length, index + term.length + 30);
        let context = text.substring(start, end);
        
        
        context = context.replace(/\s+/g, ' ').trim();
        
        matches.push({
          term: text.substring(index, index + term.length),
          context: context
        });
        
        if (matches.length >= 10) break;
      }
    }

    sendResponse({ matches: matches });
    return true; 
  }
  
  return true;
});


function applyReplacements() {
  if (!dictionary || dictionary.length === 0) return;

  const activeTerms = dictionary.filter(term => 
    term.comment && term.comment.trim() !== ''
  );

  if (activeTerms.length === 0) return;

  function processNode(node) {
    if (node.nodeType === 3) {
      const text = node.nodeValue;
      const parent = node.parentNode;
      
      if (parent && 
          parent.nodeName !== 'SCRIPT' && 
          parent.nodeName !== 'STYLE' && 
          parent.nodeName !== 'TEXTAREA' && 
          parent.nodeName !== 'INPUT' &&
          !parent.classList.contains('dictionary-term')) {
        
        let modified = false;
        let modifiedText = text;
        
        activeTerms.forEach(term => {
          
          const regex = new RegExp('\\b' + term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
          
          if (regex.test(modifiedText)) {
            regex.lastIndex = 0;
            
            modifiedText = modifiedText.replace(regex, (match) => {
              return `<span class="dictionary-term" data-term="${match}" data-definition="${term.comment}">${match}</span>`;
            });
            
            modified = true;
          }
        });
        
        if (modified) {
          const span = document.createElement('span');
          span.innerHTML = modifiedText;
          parent.replaceChild(span, node);
        }
      }
    } else if (node.nodeType === 1 && 
               node.nodeName !== 'SCRIPT' && 
               node.nodeName !== 'STYLE' && 
               node.nodeName !== 'TEXTAREA' && 
               node.nodeName !== 'INPUT' &&
               !node.classList.contains('dictionary-term')) {
      
      Array.from(node.childNodes).forEach(child => processNode(child));
    }
  }

  processNode(document.body);
  addStyles();
}


function addStyles() {
  if (document.querySelector('#dictionary-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'dictionary-styles';
  style.textContent = `
    .dictionary-term {
      position: relative;
      display: inline-block;
      cursor: help;
      background-color: #f0f7ff;
      border-bottom: 1px dashed #2b5797;
      padding: 0 2px;
      font-weight: 400;
      transition: background-color 0.2s;
    }
    
    .dictionary-term:hover {
      background-color: #e3f0ff;
    }
    
    .dictionary-term:hover::after {
      content: attr(data-definition);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 8px 16px;
      background: #ffffff;
      color: #333333;
      font-size: 13px;
      font-weight: normal;
      line-height: 1.5;
      white-space: nowrap;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      border: 1px solid #e0e0e0;
      pointer-events: none;
      animation: fadeIn 0.2s ease;
    }
    
    .dictionary-term:hover::before {
      content: '';
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 4px;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #ffffff;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
      z-index: 1000000;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(5px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    .dictionary-term[data-definition-length="long"]:hover::after {
      white-space: normal;
      max-width: 300px;
      text-align: left;
    }
  `;
  
  document.head.appendChild(style);
}


const observer = new MutationObserver((mutations) => {
  let shouldProcess = false;
  
  mutations.forEach(mutation => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      shouldProcess = true;
    }
  });
  
  if (shouldProcess) {
    setTimeout(applyReplacements, 100);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadDictionary);
} else {
  loadDictionary();
}

window.addEventListener('load', () => {
  setTimeout(loadDictionary, 500);
});