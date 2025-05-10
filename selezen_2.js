// ===== СИСТЕМА ЗАМЕНЫ ПОЛЬЗОВАТЕЛЬСКИХ ПЕРЕМЕННЫХ В RISE =====
window.UserVariables1 = {
  initialized: false,
  data: {},
  ready: false,
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[UserVariables1] Инициализация...');
    
    // Инициализируем получение данных SCORM
    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables1] Данные пользователя загружены:', this.data);
        this.ready = true;
        
        // Запускаем наблюдение за DOM
        this.startObserver();
        
        // Запускаем обработчик для Rise
        this.initRiseSpecific();
      })
      .catch(error => {
        console.error('[UserVariables1] Ошибка загрузки данных:', error);
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
        console.error("[UserVariables1] LMS API не найден");
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
      console.error(`[UserVariables1] Ошибка получения ${element}:`, error);
      return null;
    }
  },
  
  async fetchUserData() {
    try {
      // Получаем полный перечень данных о пользователе из SCORM
      let studentInfo = await this.getSCORMValue("cmi.core.student_info");
      
      // Если не получили через cmi.core.student_info, пробуем другие варианты
      if (!studentInfo) {
        studentInfo = await this.getSCORMValue("cmi.suspend_data");
      }
      
      // Если данные получены, пытаемся их распарсить
      if (studentInfo) {
        try {
          // Если данные в JSON формате
          if (typeof studentInfo === 'string' && (studentInfo.startsWith('{') || studentInfo.startsWith('['))) {
            this.data = JSON.parse(studentInfo);
          } else {
            this.data = studentInfo;
          }
          
          // Проверяем наличие всех необходимых полей
          this.ensureAllFields();
          
        } catch (parseError) {
          console.error("[UserVariables1] Ошибка парсинга данных:", parseError);
          this.data = { error: "Ошибка парсинга данных пользователя" };
          
          // Создаем базовые пустые поля
          this.ensureAllFields();
        }
      } else {
        // Если не получили данные, заполняем базовые поля
        this.data = {
          firstname: await this.getSCORMValue("cmi.core.student_name") || "Студент",
          fullname: await this.getSCORMValue("cmi.core.student_name") || "Студент"
        };
        
        // Создаем базовые пустые поля
        this.ensureAllFields();
      }
      
      console.log("[UserVariables1] Загружены данные:", this.data);
    } catch (error) {
      console.error("[UserVariables1] Ошибка получения данных:", error);
      this.data = { error: "Ошибка получения данных пользователя" };
      this.ensureAllFields();
    }
  },
  
  ensureAllFields() {
    // Убеждаемся, что все необходимые поля существуют
    const requiredFields = [
      'id', 'uid', 'is_chief', 'position_rank', 'email', 'fullname',
      'gender', 'city', 'position', 'department', 'firstname',
      'secondname', 'patronymic', 'international_name', 'photo_thumb',
      'big_photo_thumb'
    ];
    
    requiredFields.forEach(field => {
      if (this.data[field] === undefined) {
        this.data[field] = "";
      }
    });
    
    // Проверяем формат имени и разбиваем его при необходимости
    if (this.data.fullname && (!this.data.firstname || !this.data.secondname)) {
      const nameParts = this.data.fullname.split(' ');
      if (nameParts.length > 0) {
        this.data.firstname = this.data.firstname || nameParts[0] || "";
        if (nameParts.length > 1) {
          this.data.secondname = this.data.secondname || nameParts[1] || "";
        }
        if (nameParts.length > 2) {
          this.data.patronymic = this.data.patronymic || nameParts[2] || "";
        }
      }
    }
  },
  
  initRiseSpecific() {
    // Находим и обрабатываем специфичные элементы Rise
    this.processRiseElements();
    
    // Отслеживаем изменения маршрута в Rise (загрузка новых страниц)
    this.monitorRiseRouteChanges();
    
    // Проверяем iframe с контентом Rise
    this.processRiseContentIframes();
  },
  
  processRiseElements() {
    // Rise хранит содержимое страницы в #app
    const appElement = document.getElementById('app');
    if (appElement) {
      this.processTextNodes(appElement);
      
      // Rise часто использует блоки с rich-text-content
      const richTextElements = document.querySelectorAll('.rich-text-content, .text-block');
      richTextElements.forEach(element => {
        this.processTextNodes(element);
      });
      
      // Обрабатываем заголовки
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading');
      headingElements.forEach(element => {
        this.processTextNodes(element);
      });
    }
  },
  
  monitorRiseRouteChanges() {
    // Rise использует SPA-подход, отслеживаем изменение URL
    let lastUrl = location.href;
    
    // Периодически проверяем изменения URL
    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[UserVariables1] Обнаружено изменение маршрута Rise:', lastUrl);
        
        // Даем небольшую задержку для загрузки нового контента
        setTimeout(() => {
          this.processRiseElements();
          this.processRiseContentIframes();
        }, 300);
      }
    };
    
    // Запускаем периодическую проверку URL
    setInterval(checkUrlChange, 200);
    
    // Реализация MultiObserve для динамически загружаемого контента
    this.multiObserve();
  },
  
  multiObserve() {
    // Отслеживаем появление новых элементов в DOM для ArticulateRise
    const targetNodes = [
      document.body, 
      document.getElementById('app')
    ].filter(node => node !== null);
    
    if (targetNodes.length === 0) {
      console.warn('[UserVariables1] Не найдены целевые элементы для MultiObserve');
      return;
    }
    
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false
    };
    
    // Функция обработки мутаций
    const mutationCallback = (mutations) => {
      let hasChanges = false;
      
      for (let mutation of mutations) {
        // Если добавлены новые узлы
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Элемент
              // Проверяем, является ли элемент текстовым содержимым
              const isRelevant = 
                node.classList && (
                  node.classList.contains('rich-text-content') || 
                  node.classList.contains('text-block') ||
                  node.classList.contains('heading') ||
                  node.tagName.match(/^H[1-6]$/)
                );
              
              if (isRelevant) {
                hasChanges = true;
                this.processTextNodes(node);
              }
              
              // Если это iframe, обрабатываем его отдельно
              if (node.tagName === 'IFRAME') {
                node.addEventListener('load', () => {
                  this.processRiseContentIframes();
                });
              }
            }
          });
        } 
        // Если изменился текст
        else if (mutation.type === 'characterData') {
          const node = mutation.target;
          if (node.nodeValue && node.nodeValue.includes('%user_')) {
            hasChanges = true;
            this.processTextNode(node);
          }
        }
      }
      
      if (hasChanges) {
        console.log('[UserVariables1] Обнаружены изменения в DOM, обрабатываем переменные');
      }
    };
    
    // Создаем наблюдатель
    const observer = new MutationObserver(mutationCallback);
    
    // Запускаем наблюдение за каждым целевым элементом
    targetNodes.forEach(target => {
      observer.observe(target, observerConfig);
    });
    
    console.log('[UserVariables1] MultiObserve запущен для', targetNodes.length, 'элементов');
  },
  
  processRiseContentIframes() {
    // Rise часто загружает контент в iframe
    const iframes = document.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      try {
        // Проверяем и обрабатываем iframe
        const processIframe = () => {
          if (iframe.contentDocument) {
            try {
              // Передаем данные пользователя в iframe
              iframe.contentWindow.UserVariables1 = {
                data: this.data,
                ready: true,
                processTextNodes: this.processTextNodes.bind(this)
              };
              
              // Обрабатываем текст в iframe
              this.processTextNodes(iframe.contentDocument.body);
            } catch (e) {
              console.error('[UserVariables1] Ошибка обработки содержимого iframe:', e);
            }
          }
        };
        
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
          processIframe();
        } else {
          iframe.addEventListener('load', processIframe);
        }
      } catch (e) {
        console.error('[UserVariables1] Ошибка доступа к iframe:', e);
      }
    });
  },
  
  startObserver() {
    // Создаем MutationObserver для отслеживания изменений в DOM
    this.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Элемент
              this.processTextNodes(node);
            }
          });
        } else if (mutation.type === 'characterData') {
          const node = mutation.target;
          if (node.nodeValue && node.nodeValue.includes('%user_')) {
            this.processTextNode(node);
          }
        }
      });
    });
    
    // Запускаем наблюдение за всем документом
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log('[UserVariables1] Observer запущен');
  },
  
  processTextNode(node) {
    if (!node || node.nodeType !== 3 || !node.nodeValue) return;
    
    const originalText = node.nodeValue;
    if (!originalText.includes('%user_')) return;
    
    // Заменяем все переменные пользователя в тексте
    let newText = originalText;
    
    const variablePattern = /%user_([a-z_]+)%/g;
    let match;
    
    while ((match = variablePattern.exec(originalText)) !== null) {
      const fullMatch = match[0]; // Например, %user_email%
      const variableName = match[1]; // Например, email
      
      // Получаем значение из данных пользователя
      let value = this.data[variableName] || '';
      
      // Заменяем переменную на значение
      newText = newText.replace(fullMatch, value);
    }
    
    if (newText !== originalText) {
      node.nodeValue = newText;
    }
  },
  
  processTextNodes(rootNode) {
    if (!rootNode) return;
    
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    
    textNodes.forEach(node => {
      this.processTextNode(node);
    });
  }
};

// Запускаем систему замены переменных
window.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables1] DOMContentLoaded, запускаем инициализацию');
  UserVariables1.init();
});

// Запускаем еще раз после полной загрузки страницы
window.addEventListener('load', () => {
  console.log('[UserVariables1] Page loaded, запускаем повторную обработку');
  setTimeout(() => {
    UserVariables1.processRiseElements();
    UserVariables1.processRiseContentIframes();
  }, 500);
});

// Запускаем с задержкой для уверенности в загрузке Rise
setTimeout(() => {
  if (!UserVariables1.initialized) {
    console.log('[UserVariables1] Запуск с таймаутом');
    UserVariables1.init();
  }
}, 1000);

// Экспортируем для немедленного использования
window.UserVariables1 = UserVariables1; 