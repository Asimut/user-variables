// ===== СИСТЕМА ЗАМІНИ КОРИСТУВАЦЬКИХ ЗМІННИХ У RISE =====
window.UserVariables = {
  initialized: false,
  data: {},
  ready: false,
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[UserVariables] Ініціалізація...');
    
    // Ініціалізуємо отримання даних SCORM
    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables] Дані користувача завантажені:', this.data);
        this.ready = true;
        
        // Запускаємо спостереження за DOM
        this.startObserver();
        
        // Запускаємо обробник для Rise
        this.initRiseSpecific();
      })
      .catch(error => {
        console.error('[UserVariables] Помилка завантаження даних:', error);
      });
  },
  
  findLMSAPI(win) {
    if (win.hasOwnProperty("API")) return win.API;
    if (win.hasOwnProperty("API_1484_11")) return win.API_1484_11;
    else if (win.parent == win) return null;
    else return this.findLMSAPI(win.parent);
  },
  
  async getSCORMValue(element) {
    try {
      const lmsAPI = this.findLMSAPI(window);
      if (!lmsAPI) {
        console.error("[UserVariables] LMS API не знайдено");
        return null;
      }
      
      let value = null;
      
      // SCORM 1.2
      if (typeof lmsAPI.LMSGetValue === "function") {
        value = lmsAPI.LMSGetValue(element);
      }
      // SCORM 2004
      else if (typeof lmsAPI.GetValue === "function") {
        value = lmsAPI.GetValue(element);
      }
      
      return value;
    } catch (error) {
      console.error(`[UserVariables] Помилка отримання ${element}:`, error);
      return null;
    }
  },
  
  async fetchUserData() {
    try {
      // Отримуємо інформацію про користувача зі SCORM
      let studentInfo = await this.getSCORMValue("cmi.core.student_info");
      
      // Якщо не отримали через cmi.core.student_info, пробуємо інші варіанти
      if (!studentInfo) {
        studentInfo = await this.getSCORMValue("cmi.suspend_data");
      }
      
      // Якщо дані отримано, намагаємося їх розпарсити
      if (studentInfo) {
        try {
          // Якщо дані у форматі JSON
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
        // Якщо не отримали дані, заповнюємо базові поля
        this.data = {
          firstname: await this.getSCORMValue("cmi.core.student_name") || "Студент",
          fullname: await this.getSCORMValue("cmi.core.student_name") || "Студент"
        };
      }
      
      // Додаткова перевірка формату імені
      if (this.data.fullname && !this.data.firstname) {
        const nameParts = this.data.fullname.split(' ');
        if (nameParts.length > 0) {
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
    // Знаходимо й обробляємо специфічні елементи Rise
    this.processRiseElements();
    
    // Відстежуємо зміни маршруту в Rise (завантаження нових сторінок)
    this.monitorRiseRouteChanges();
    
    // Перевіряємо iframe із контентом Rise
    this.processRiseContentIframes();
  },
  
  processRiseElements() {
    // Rise зберігає вміст сторінки в #app
    const appElement = document.getElementById('app');
    if (appElement) {
      this.processTextNodes(appElement);
      
      // Rise часто використовує блоки з rich-text-content
      const richTextElements = document.querySelectorAll('.rich-text-content, .text-block');
      richTextElements.forEach(element => {
        this.processTextNodes(element);
      });
      
      // Обробляємо заголовки
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading');
      headingElements.forEach(element => {
        this.processTextNodes(element);
      });
    }
  },
  
  monitorRiseRouteChanges() {
    // Rise використовує SPA‑підхід, відстежуємо зміну URL
    let lastUrl = location.href;
    
    // Періодично перевіряємо зміни URL
    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[UserVariables] Виявлено зміну маршруту Rise:', lastUrl);
        
        // Даємо невелику затримку для завантаження нового контенту
        setTimeout(() => {
          this.processRiseElements();
          this.processRiseContentIframes();
        }, 300);
      }
    };
    
    // Запускаємо періодичну перевірку URL
    setInterval(checkUrlChange, 200);
    
    // Також пробуємо перехопити події навігації Rise
    if (window.Rise) {
      console.log('[UserVariables] Виявлено глобальний об’єкт Rise, встановлюємо перехоплювачі');
      
      // Перехоплюємо методи навігації, якщо вони існують
      if (window.Rise.navigate) {
        const originalNavigate = window.Rise.navigate;
        window.Rise.navigate = (...args) => {
          const result = originalNavigate.apply(window.Rise, args);
          
          // Після навігації обробляємо новий контент
          setTimeout(() => {
            this.processRiseElements();
          }, 300);
          
          return result;
        };
      }
    }
  },
  
  processRiseContentIframes() {
    // Rise часто завантажує контент в iframe
    const iframes = document.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      try {
        // Чекаємо повного завантаження iframe
        const processIframe = () => {
          if (iframe.contentDocument) {
            // Передаємо дані користувача в iframe
            iframe.contentWindow.UserVariables = {
              data: this.data,
              ready: true,
              processTextNodes: this.processTextNodes
            };
            
            // Обробляємо текст в iframe
            this.processTextNodes(iframe.contentDocument.body);
          }
        };
        
        if (iframe.contentDocument) {
          processIframe();
        } else {
          iframe.addEventListener('load', processIframe);
        }
      } catch (e) {
        console.error('[UserVariables] Помилка обробки iframe:', e);
      }
    });
  },
  
  startObserver() {
    // Створюємо MutationObserver для відстеження змін у DOM
    this.observer = new MutationObserver(mutations => {
      let hasRelevantChanges = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Лише елементи
              // Перевіряємо, чи є елемент релевантним для Rise
              if (
                node.classList && (
                  node.classList.contains('rich-text-content') || 
                  node.classList.contains('text-block') ||
                  node.classList.contains('heading') ||
                  node.tagName.toLowerCase().match(/^h[1-6]$/)
                )
              ) {
                hasRelevantChanges = true;
              }
              
              // Обробляємо новий елемент
              this.processTextNodes(node);
              
              // Якщо це iframe, обробляємо його окремо
              if (node.tagName === 'IFRAME') {
                node.addEventListener('load', () => {
                  this.processRiseContentIframes();
                });
              }
            }
          });
        } else if (mutation.type === 'characterData') {
          // Якщо змінився текст, перевіряємо наявність змінних
          const node = mutation.target;
          if (node.nodeValue && node.nodeValue.includes('%user_')) {
            hasRelevantChanges = true;
            this.processTextNode(node);
          }
        }
      });
      
      // Якщо були релевантні зміни, обробляємо всі Rise‑елементи
      if (hasRelevantChanges) {
        this.processRiseElements();
      }
    });
    
    // Починаємо спостереження за всім DOM
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true
    });
    
    // Одразу перевіряємо і замінюємо вже наявні елементи
    this.processTextNodes(document.body);
    
    console.log("[UserVariables] Спостерігач DOM запущено");
  },
  
  // Обробка одного текстового вузла
  processTextNode(node) {
    if (!this.ready || !this.data) return;
    
    let newValue = node.nodeValue;
    
    // Шукаємо всі змінні формату %user_xxx%
    const matches = newValue.match(/%user_[a-z_]+%/g);
    if (matches) {
      matches.forEach(match => {
        // Отримуємо ім’я змінної без %
        const varName = match.replace(/%/g, '').replace('user_', '');
        
        // Замінюємо змінну на значення з даних
        if (this.data[varName]) {
          newValue = newValue.replace(match, this.data[varName]);
        } else {
          console.warn(`[UserVariables] Змінну ${varName} не знайдено в даних`);
        }
      });
      
      // Оновлюємо значення вузла
      node.nodeValue = newValue;
    }
  },
  
  // Обробка всіх текстових вузлів в елементі
  processTextNodes(rootNode) {
    if (!this.ready || !this.data || !rootNode) return;
    
    // Отримуємо всі текстові вузли
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    // Проходимо всі текстові вузли
    const nodesToReplace = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.includes('%user_')) {
        nodesToReplace.push(node);
      }
    }
    
    // Замінюємо змінні в текстових вузлах
    nodesToReplace.forEach(node => {
      this.processTextNode(node);
    });
  }
};

// Запускаємо систему після завантаження сторінки
window.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables] DOM завантажено, запускаю ініціалізацію');
  window.UserVariables.init();
  
  // Додатково запускаємо після повного завантаження сторінки
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.UserVariables.processRiseElements();
      window.UserVariables.processRiseContentIframes();
    }, 500);
  });
});
