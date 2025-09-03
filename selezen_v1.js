// ===== СИСТЕМА ЗАМІНИ КОРИСТУВАЦЬКИХ ЗМІННИХ У RISE (оптимизована) =====
window.UserVariables = {
  initialized: false,
  data: {},
  ready: false,
  observer: null,
  urlCheckTimer: null,
  processTimer: null,
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[UserVariables] Ініціалізація...');
    
    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables] Дані користувача завантажені:', this.data);
        this.ready = true;
        this.startObserver();
        this.initRiseSpecific();
      })
      .catch(error => {
        console.error('[UserVariables] Помилка завантаження даних:', error);
      });
  },
  
  findLMSAPI(win) {
    try {
      if (win.hasOwnProperty("API")) return win.API;
      if (win.hasOwnProperty("API_1484_11")) return win.API_1484_11;
      if (win.parent && win.parent !== win) return this.findLMSAPI(win.parent);
    } catch (e) { /* cross-origin */ }
    return null;
  },
  
  async getSCORMValue(element) {
    try {
      const lmsAPI = this.findLMSAPI(window);
      if (!lmsAPI) return null;
      
      if (typeof lmsAPI.LMSGetValue === "function") {
        return lmsAPI.LMSGetValue(element);
      }
      if (typeof lmsAPI.GetValue === "function") {
        return lmsAPI.GetValue(element);
      }
      return null;
    } catch (error) {
      return null;
    }
  },
  
  async fetchUserData() {
    try {
      // Отримуємо дані з SCORM
      let studentInfo = await this.getSCORMValue("cmi.core.student_info");
      
      if (!studentInfo) {
        studentInfo = await this.getSCORMValue("cmi.suspend_data");
      }
      
      if (studentInfo) {
        try {
          if (typeof studentInfo === 'string' && (studentInfo.startsWith('{') || studentInfo.startsWith('['))) {
            this.data = JSON.parse(studentInfo);
          } else {
            this.data = studentInfo;
          }
        } catch (parseError) {
          console.error("[UserVariables] Помилка парсингу даних:", parseError);
          this.data = { error: "Помилка парсингу даних користувача" };
        }
      } else {
        // Базові поля з SCORM 1.2
        const studentName = await this.getSCORMValue("cmi.core.student_name") || "";
        this.data = {
          firstname: studentName || "Користувач",
          fullname: studentName || "Користувач"
        };
      }
      
      // Нормалізація імені для формату SCORM 1.2 "Last, First"
      if (this.data.fullname && !this.data.firstname) {
        const nameParts = this.data.fullname.split(',').map(s => s.trim());
        if (nameParts.length > 1) {
          this.data.firstname = nameParts[1]; // First name
          this.data.fullname = `${nameParts[1]} ${nameParts[0]}`; // First Last
        } else {
          this.data.firstname = nameParts[0];
        }
      }
      
      console.log("[UserVariables] Дані завантажено:", this.data);
    } catch (error) {
      console.error("[UserVariables] Помилка отримання даних:", error);
      this.data = { error: "Помилка отримання даних користувача" };
    }
  },
  
  initRiseSpecific() {
    this.processRiseElements();
    this.monitorRiseRouteChanges();
    this.processRiseContentIframes();
  },
  
  processRiseElements() {
    const appElement = document.getElementById('app');
    if (appElement) {
      this.processTextNodes(appElement);
      
      // Специфічні елементи Rise (батчево)
      const elements = document.querySelectorAll('.rich-text-content, .text-block, h1, h2, h3, h4, h5, h6, .heading');
      elements.forEach(element => this.processTextNodes(element));
    }
  },
  
  monitorRiseRouteChanges() {
    // Оптимізований моніторинг URL
    let lastUrl = location.href;
    
    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[UserVariables] Виявлено зміну маршруту Rise:', lastUrl);
        
        // Батчим обробка
        if (this.processTimer) clearTimeout(this.processTimer);
        this.processTimer = setTimeout(() => {
          this.processRiseElements();
          this.processRiseContentIframes();
        }, 400);
      }
    };
    
    // Збільшуємо інтервал для зниження навантаження
    this.urlCheckTimer = setInterval(checkUrlChange, 500);
    
    // ПРИБИРАЄМО перехоплення Rise.navigate — може конфліктувати
  },
  
  processRiseContentIframes() {
    const iframes = document.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      try {
        const processIframe = () => {
          if (iframe.contentDocument) {
            iframe.contentWindow.UserVariables = {
              data: this.data,
              ready: true,
              processTextNodes: this.processTextNodes.bind(this)
            };
            
            this.processTextNodes(iframe.contentDocument.body);
          }
        };
        
        if (iframe.contentDocument) {
          processIframe();
        } else {
          iframe.addEventListener('load', processIframe);
        }
      } catch (e) {
        // Крос-доменні помилки ігноруємо
      }
    });
  },
  
  startObserver() {
    if (this.observer) return;
    
    // КЛЮЧОВА ЗМІНА: прибираємо characterData, тільки childList
    this.observer = new MutationObserver(mutations => {
      let needProcess = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // тільки елементи
              needProcess = true;
              
              // Відразу обробляємо новий елемент
              this.processTextNodes(node);
              
              if (node.tagName === 'IFRAME') {
                node.addEventListener('load', () => {
                  this.processRiseContentIframes();
                });
              }
            }
          });
        }
      });
      
      // Батчім загальну обробку
      if (needProcess) {
        if (this.processTimer) clearTimeout(this.processTimer);
        this.processTimer = setTimeout(() => {
          this.processRiseElements();
        }, 200);
      }
    });
    
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true
      // characterData
    });
    
    // Первинна обробка
    this.processTextNodes(document.body);
    console.log("[UserVariables] Спостерігач DOM запущено");
  },
  
  processTextNode(node) {
    if (!this.ready || !this.data) return;
    
    let newValue = node.nodeValue;
    const matches = newValue.match(/%user_[a-z_]+%/gi);
    if (matches) {
      matches.forEach(match => {
        const varName = match.replace(/%/g, '').replace('user_', '');
        
        if (this.data[varName]) {
          newValue = newValue.replace(match, this.data[varName]);
        } else {
          // Логуємо тільки раз на змінну
          if (!this._warnedVars) this._warnedVars = new Set();
          if (!this._warnedVars.has(varName)) {
            this._warnedVars.add(varName);
            console.warn(`[UserVariables] Змінну ${varName} не знайдено в даних`);
          }
        }
      });
      
      node.nodeValue = newValue;
    }
  },
  
  processTextNodes(rootNode) {
    if (!this.ready || !this.data || !rootNode) return;
    
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const nodesToReplace = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.includes('%user_')) {
        nodesToReplace.push(node);
      }
    }
    
    nodesToReplace.forEach(node => {
      this.processTextNode(node);
    });
  },
  
  // Метод очищення ресурсів
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.urlCheckTimer) {
      clearInterval(this.urlCheckTimer);
      this.urlCheckTimer = null;
    }
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }
};

// КЛЮЧОВА ЗМІНА: ініціалізація після натискання кнопки «Старт»
function waitForStartAndInit() {
  const startBtn = document.querySelector('.cover__header-content-action-link');
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // Даємо час плеєру виконати перехід
      setTimeout(() => {
        window.UserVariables.init();
      }, 1000);
    }, { once: true, passive: true });
  } else {
    // Якщо кнопки немає, стежимо за DOM
    const obs = new MutationObserver(() => {
      const btn = document.querySelector('.cover__header-content-action-link');
      if (btn) {
        btn.addEventListener('click', () => {
          setTimeout(() => window.UserVariables.init(), 1000);
        }, { once: true, passive: true });
        obs.disconnect();
      }
    });
    obs.observe(document, { childList: true, subtree: true });
  }
  
  // Фолбеки для випадків обходу обкладинки
  window.addEventListener('hashchange', () => {
    setTimeout(() => window.UserVariables.init(), 500);
  }, { once: true });
  
  setTimeout(() => window.UserVariables.init(), 8000);
}

// Запуск
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  waitForStartAndInit();
} else {
  document.addEventListener('DOMContentLoaded', waitForStartAndInit, { once: true });
}