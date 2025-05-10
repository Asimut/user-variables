// ===== СИСТЕМА ЗАМЕНЫ ПОЛЬЗОВАТЕЛЬСКИХ ПЕРЕМЕННЫХ В RISE =====
window.UserVariables1 = {
  initialized: false,
  data: {},
  ready: false,
  attemptCounter: 0,
  maxAttempts: 10,
  
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
        
        // Активно запускаем первичную обработку
        this.processRiseElements();
        
        // Запускаем отложенные повторные обработки для уверенности
        setTimeout(() => this.processAllContent(), 300);
        setTimeout(() => this.processAllContent(), 1000);
        setTimeout(() => this.processAllContent(), 3000);
      })
      .catch(error => {
        console.error('[UserVariables1] Ошибка загрузки данных:', error);
        // Попробуем повторить позже
        if (this.attemptCounter < this.maxAttempts) {
          this.attemptCounter++;
          console.log(`[UserVariables1] Повторная попытка (${this.attemptCounter}/${this.maxAttempts})...`);
          setTimeout(() => {
            this.initialized = false;
            this.init();
          }, 1000);
        }
      });
  },
  
  findLMSAPI(win) {
    if (!win) return null;
    try {
      if (win.hasOwnProperty("API")) return win.API;
      if (win.hasOwnProperty("API_1484_11")) return win.API_1484_11;
      else if (win.parent === win || !win.parent) return null;
      else return this.findLMSAPI(win.parent);
    } catch (e) {
      console.error('[UserVariables1] Ошибка при поиске LMS API:', e);
      return null;
    }
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
        console.log(`[UserVariables1] Получено значение SCORM 1.2 для ${element}:`, value);
      }
      // SCORM 2004
      else if (typeof lmsAPI.GetValue === "function") {
        value = lmsAPI.GetValue(element);
        console.log(`[UserVariables1] Получено значение SCORM 2004 для ${element}:`, value);
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
      console.log("[UserVariables1] Запрашиваем данные пользователя из SCORM...");
      let studentInfo = await this.getSCORMValue("cmi.core.student_info");
      console.log("[UserVariables1] Результат запроса cmi.core.student_info:", studentInfo);
      
      // Если не получили через cmi.core.student_info, пробуем другие варианты
      if (!studentInfo) {
        console.log("[UserVariables1] Пробуем запросить cmi.suspend_data...");
        studentInfo = await this.getSCORMValue("cmi.suspend_data");
        console.log("[UserVariables1] Результат запроса cmi.suspend_data:", studentInfo);
      }
      
      // Получаем дополнительные данные напрямую
      const studentName = await this.getSCORMValue("cmi.core.student_name");
      const studentId = await this.getSCORMValue("cmi.core.student_id");
      
      console.log("[UserVariables1] Имя пользователя из SCORM:", studentName);
      console.log("[UserVariables1] ID пользователя из SCORM:", studentId);
      
      // Проверка студента по ID
      if (studentId && !studentInfo) {
        console.log("[UserVariables1] Используем только ID пользователя:", studentId);
        this.data = {
          id: studentId,
          fullname: studentName || "Пользователь"
        };
        this.ensureAllFields();
        return;
      }
      
      // Если данные получены, пытаемся их распарсить
      if (studentInfo) {
        try {
          let parsedData = null;
          
          // Если данные в JSON формате
          if (typeof studentInfo === 'string' && (studentInfo.startsWith('{') || studentInfo.startsWith('['))) {
            console.log("[UserVariables1] Парсим JSON данные...");
            parsedData = JSON.parse(studentInfo);
          } else if (typeof studentInfo === 'string') {
            // Проверяем, не является ли это строкой с разделителями
            if (studentInfo.includes('|') || studentInfo.includes(';')) {
              console.log("[UserVariables1] Обнаружена строка с разделителями, преобразуем в объект...");
              parsedData = this.parseDelimitedString(studentInfo);
            } else {
              console.log("[UserVariables1] Используем строку как есть:", studentInfo);
              parsedData = { 
                fullname: studentInfo,
                id: studentId
              };
            }
          } else if (typeof studentInfo === 'object') {
            console.log("[UserVariables1] Используем полученный объект напрямую");
            parsedData = studentInfo;
          }
          
          if (parsedData) {
            this.data = parsedData;
            
            // Добавляем имя и id, если отсутствуют
            if (!this.data.fullname && studentName) {
              this.data.fullname = studentName;
            }
            if (!this.data.id && studentId) {
              this.data.id = studentId;
            }
          } else {
            console.error("[UserVariables1] Не удалось распарсить данные");
            this.data = { 
              fullname: studentName || "Пользователь",
              id: studentId || "0"
            };
          }
          
          // Проверяем наличие всех необходимых полей
          this.ensureAllFields();
          
        } catch (parseError) {
          console.error("[UserVariables1] Ошибка парсинга данных:", parseError);
          this.data = { 
            error: "Ошибка парсинга данных пользователя",
            fullname: studentName || "Пользователь",
            id: studentId || "0"
          };
          
          // Создаем базовые пустые поля
          this.ensureAllFields();
        }
      } else {
        // Если не получили никаких данных, заполняем базовые поля
        console.log("[UserVariables1] Не удалось получить данные пользователя, используем только имя");
        this.data = {
          firstname: studentName || "Пользователь",
          fullname: studentName || "Пользователь",
          id: studentId || "0"
        };
        
        // Создаем базовые пустые поля
        this.ensureAllFields();
      }
      
      // Отображаем полученный набор данных в консоли
      console.log("[UserVariables1] Итоговые данные пользователя:", JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("[UserVariables1] Ошибка получения данных:", error);
      this.data = { error: "Ошибка получения данных пользователя" };
      this.ensureAllFields();
    }
  },
  
  // Парсинг строки с разделителями
  parseDelimitedString(str) {
    try {
      const result = {};
      
      // Определяем разделитель (| или ;)
      const delimiter = str.includes('|') ? '|' : ';';
      const pairs = str.split(delimiter);
      
      // Сначала пробуем разделить по = или :
      for (const pair of pairs) {
        if (pair.includes('=')) {
          const [key, value] = pair.split('=');
          result[key.trim()] = value.trim();
        } else if (pair.includes(':')) {
          const [key, value] = pair.split(':');
          result[key.trim()] = value.trim();
        }
      }
      
      // Если ничего не удалось распарсить, просто используем как fullname
      if (Object.keys(result).length === 0) {
        result.fullname = str;
      }
      
      return result;
    } catch (e) {
      console.error('[UserVariables1] Ошибка при парсинге строки:', e);
      return { fullname: str };
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
      if (this.data[field] === undefined || this.data[field] === null) {
        this.data[field] = "";
      }
    });
    
    // Конвертируем числовые и булевы значения в строки
    for (const field in this.data) {
      if (typeof this.data[field] === 'number' || typeof this.data[field] === 'boolean') {
        this.data[field] = String(this.data[field]);
      }
    }
    
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
    
    // Логируем финальные данные для проверки
    console.log('[UserVariables1] Поля данных пользователя после обработки:');
    requiredFields.forEach(field => {
      console.log(`  - ${field}: "${this.data[field]}"`);
    });
  },
  
  processAllContent() {
    console.log('[UserVariables1] Запуск полной обработки всего контента...');
    this.processRiseElements();
    this.processRiseContentIframes();
    
    // Дополнительно обрабатываем все текстовые блоки на странице
    const allTextElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li, td, th, button, a, label');
    console.log(`[UserVariables1] Найдено ${allTextElements.length} текстовых элементов для проверки`);
    
    allTextElements.forEach(element => {
      this.processTextNodes(element);
    });
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
    console.log('[UserVariables1] Обработка элементов Rise...');
    
    // Rise хранит содержимое страницы в #app
    const appElement = document.getElementById('app');
    if (appElement) {
      this.processTextNodes(appElement);
      
      // Rise часто использует блоки с rich-text-content
      const richTextElements = document.querySelectorAll('.rich-text-content, .text-block');
      console.log(`[UserVariables1] Найдено ${richTextElements.length} rich-text элементов`);
      richTextElements.forEach(element => {
        this.processTextNodes(element);
      });
      
      // Обрабатываем заголовки
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading');
      console.log(`[UserVariables1] Найдено ${headingElements.length} заголовков`);
      headingElements.forEach(element => {
        this.processTextNodes(element);
      });
    } else {
      console.log('[UserVariables1] Элемент #app не найден, ищем контент в body');
      this.processTextNodes(document.body);
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
          this.processAllContent();
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
              const isTextElement = node.tagName && 
                (node.tagName.match(/^(P|DIV|SPAN|H[1-6]|LI|TD|TH|BUTTON|A|LABEL)$/i) ||
                 (node.classList && (
                   node.classList.contains('rich-text-content') || 
                   node.classList.contains('text-block') ||
                   node.classList.contains('heading')
                 )));
              
              if (isTextElement) {
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
        console.log('[UserVariables1] Обнаружены изменения в DOM, обработаны переменные');
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
    console.log(`[UserVariables1] Найдено ${iframes.length} iframe для обработки`);
    
    iframes.forEach(iframe => {
      try {
        // Проверяем и обрабатываем iframe
        const processIframe = () => {
          try {
            if (iframe.contentDocument) {
              // Передаем данные пользователя в iframe
              iframe.contentWindow.UserVariables1 = {
                data: this.data,
                ready: true,
                processTextNodes: this.processTextNodes.bind(this)
              };
              
              // Обрабатываем текст в iframe
              if (iframe.contentDocument.body) {
                console.log('[UserVariables1] Обработка содержимого iframe');
                this.processTextNodes(iframe.contentDocument.body);
              }
            }
          } catch (e) {
            console.error('[UserVariables1] Ошибка обработки содержимого iframe:', e);
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
      let hasChanges = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Элемент
              this.processTextNodes(node);
              hasChanges = true;
            }
          });
        } else if (mutation.type === 'characterData') {
          const node = mutation.target;
          if (node.nodeValue && node.nodeValue.includes('%user_')) {
            this.processTextNode(node);
            hasChanges = true;
          }
        }
      });
      
      if (hasChanges) {
        console.log('[UserVariables1] Обработаны изменения в DOM через основной Observer');
      }
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
    
    console.log(`[UserVariables1] Обработка текстового узла: "${originalText}"`);
    
    // Заменяем все переменные пользователя в тексте
    let newText = originalText;
    
    const variablePattern = /%user_([a-z_]+)%/g;
    let match;
    let replacementsMade = false;
    
    while ((match = variablePattern.exec(originalText)) !== null) {
      const fullMatch = match[0]; // Например, %user_email%
      const variableName = match[1]; // Например, email
      
      // Получаем значение из данных пользователя
      let value = this.data[variableName] || '';
      
      // Логируем замену для отладки
      console.log(`[UserVariables1] Замена: ${fullMatch} -> "${value}"`);
      
      // Заменяем переменную на значение
      newText = newText.replace(fullMatch, value);
      replacementsMade = true;
    }
    
    if (replacementsMade) {
      console.log(`[UserVariables1] Результат замены: "${newText}"`);
      node.nodeValue = newText;
    }
  },
  
  processTextNodes(rootNode) {
    if (!rootNode) return;
    
    try {
      const walker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.includes('%user_')) {
          textNodes.push(node);
        }
      }
      
      if (textNodes.length > 0) {
        console.log(`[UserVariables1] Найдено ${textNodes.length} текстовых узлов с переменными в ${rootNode.tagName || 'root'}`);
      }
      
      textNodes.forEach(node => {
        this.processTextNode(node);
      });
    } catch (e) {
      console.error('[UserVariables1] Ошибка при обработке текстовых узлов:', e);
    }
  }
};

// Запускаем систему замены переменных при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables1] DOMContentLoaded, запускаем инициализацию');
  UserVariables1.init();
});

// Запускаем еще раз после полной загрузки страницы
window.addEventListener('load', () => {
  console.log('[UserVariables1] Page loaded, запускаем повторную обработку');
  if (!UserVariables1.initialized) {
    UserVariables1.init();
  } else {
    UserVariables1.processAllContent();
  }
});

// Запускаем с задержкой для уверенности в загрузке Rise
setTimeout(() => {
  console.log('[UserVariables1] Запуск с таймаутом');
  if (!UserVariables1.initialized) {
    UserVariables1.init();
  } else {
    UserVariables1.processAllContent();
  }
}, 1000);

// Запуск дополнительной обработки с большей задержкой
setTimeout(() => {
  console.log('[UserVariables1] Дополнительная проверка и обработка');
  if (UserVariables1.initialized) {
    UserVariables1.processAllContent();
  }
}, 3000);

// Немедленный запуск
console.log('[UserVariables1] Немедленный запуск скрипта');
UserVariables1.init();

// Экспортируем для доступа извне
window.UserVariables1 = UserVariables1; 