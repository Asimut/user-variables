// ===== СИСТЕМА ЗАМЕНЫ ПОЛЬЗОВАТЕЛЬСКИХ ПЕРЕМЕННЫХ В RISE =====
window.UserVariables = {
  initialized: false,
  data: {},
  ready: false,
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[UserVariables] Инициализация...');
    
    // Инициализируем получение данных SCORM
    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables] Данные пользователя загружены:', this.data);
        this.ready = true;
        
        // Запускаем наблюдение за DOM
        this.startObserver();
        
        // Запускаем обработчик для Rise
        this.initRiseSpecific();
      })
      .catch(error => {
        console.error('[UserVariables] Ошибка загрузки данных:', error);
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
        console.error("[UserVariables] LMS API не найден");
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
      console.error(`[UserVariables] Ошибка получения ${element}:`, error);
      return null;
    }
  },
  
  async fetchUserData() {
    try {
      // Получаем информацию о пользователе из SCORM
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
        } catch (parseError) {
          console.error("[UserVariables] Ошибка парсинга данных:", parseError);
          this.data = { error: "Ошибка парсинга данных пользователя" };
        }
      } else {
        // Если не получили данные, заполняем базовые поля
        this.data = {
          firstname: await this.getSCORMValue("cmi.core.student_name") || "Студент",
          fullname: await this.getSCORMValue("cmi.core.student_name") || "Студент"
        };
      }
      
      // Делаем дополнительную проверку формата имени
      if (this.data.fullname && !this.data.firstname) {
        const nameParts = this.data.fullname.split(' ');
        if (nameParts.length > 0) {
          this.data.firstname = nameParts[0];
        }
      }
      
      console.log("[UserVariables] Загружены данные:", this.data);
    } catch (error) {
      console.error("[UserVariables] Ошибка получения данных:", error);
      this.data = { error: "Ошибка получения данных пользователя" };
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
        console.log('[UserVariables] Обнаружено изменение маршрута Rise:', lastUrl);
        
        // Даем небольшую задержку для загрузки нового контента
        setTimeout(() => {
          this.processRiseElements();
          this.processRiseContentIframes();
        }, 300);
      }
    };
    
    // Запускаем периодическую проверку URL
    setInterval(checkUrlChange, 200);
    
    // Также пробуем перехватить события навигации Rise
    if (window.Rise) {
      console.log('[UserVariables] Обнаружен глобальный объект Rise, устанавливаем перехватчики');
      
      // Перехватываем методы навигации, если они существуют
      if (window.Rise.navigate) {
        const originalNavigate = window.Rise.navigate;
        window.Rise.navigate = (...args) => {
          const result = originalNavigate.apply(window.Rise, args);
          
          // После навигации обрабатываем новый контент
          setTimeout(() => {
            this.processRiseElements();
          }, 300);
          
          return result;
        };
      }
    }
  },
  
  processRiseContentIframes() {
    // Rise часто загружает контент в iframe
    const iframes = document.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      try {
        // Ждем полной загрузки iframe
        const processIframe = () => {
          if (iframe.contentDocument) {
            // Передаем данные пользователя в iframe
            iframe.contentWindow.UserVariables = {
              data: this.data,
              ready: true,
              processTextNodes: this.processTextNodes
            };
            
            // Обрабатываем текст в iframe
            this.processTextNodes(iframe.contentDocument.body);
          }
        };
        
        if (iframe.contentDocument) {
          processIframe();
        } else {
          iframe.addEventListener('load', processIframe);
        }
      } catch (e) {
        console.error('[UserVariables] Ошибка обработки iframe:', e);
      }
    });
  },
  
  startObserver() {
    // Создаем MutationObserver для отслеживания изменений в DOM
    this.observer = new MutationObserver(mutations => {
      let hasRelevantChanges = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Только элементы
              // Проверяем, является ли элемент релевантным для Rise
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
              
              // Обрабатываем новый элемент
              this.processTextNodes(node);
              
              // Если это iframe, обрабатываем его отдельно
              if (node.tagName === 'IFRAME') {
                node.addEventListener('load', () => {
                  this.processRiseContentIframes();
                });
              }
            }
          });
        } else if (mutation.type === 'characterData') {
          // Если изменился текст, проверяем наличие переменных
          const node = mutation.target;
          if (node.nodeValue && node.nodeValue.includes('%user_')) {
            hasRelevantChanges = true;
            this.processTextNode(node);
          }
        }
      });
      
      // Если были релевантные изменения, обрабатываем все Rise-элементы
      if (hasRelevantChanges) {
        this.processRiseElements();
      }
    });
    
    // Начинаем наблюдение за всем DOM
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true
    });
    
    // Сразу проверяем и заменяем уже существующие элементы
    this.processTextNodes(document.body);
    
    console.log("[UserVariables] Наблюдатель DOM запущен");
  },
  
  // Обработка одного текстового узла
  processTextNode(node) {
    if (!this.ready || !this.data) return;
    
    let newValue = node.nodeValue;
    
    // Ищем все переменные формата %user_xxx%
    const matches = newValue.match(/%user_[a-z_]+%/g);
    if (matches) {
      matches.forEach(match => {
        // Получаем имя переменной без %
        const varName = match.replace(/%/g, '').replace('user_', '');
        
        // Заменяем переменную на значение из данных
        if (this.data[varName]) {
          newValue = newValue.replace(match, this.data[varName]);
        } else {
          console.warn(`[UserVariables] Переменная ${varName} не найдена в данных`);
        }
      });
      
      // Обновляем значение узла
      node.nodeValue = newValue;
    }
  },
  
  // Обработка всех текстовых узлов в элементе
  processTextNodes(rootNode) {
    if (!this.ready || !this.data || !rootNode) return;
    
    // Получаем все текстовые узлы
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    // Проходим по всем текстовым узлам
    const nodesToReplace = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.includes('%user_')) {
        nodesToReplace.push(node);
      }
    }
    
    // Заменяем переменные в текстовых узлах
    nodesToReplace.forEach(node => {
      this.processTextNode(node);
    });
  }
};

// Запускаем систему после загрузки страницы
window.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables] DOM загружен, запускаю инициализацию');
  window.UserVariables.init();
  
  // Дополнительно запускаем после полной загрузки страницы
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.UserVariables.processRiseElements();
      window.UserVariables.processRiseContentIframes();
    }, 500);
  });
}); 