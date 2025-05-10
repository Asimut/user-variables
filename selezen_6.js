// ===== СИСТЕМА ЗАМЕНЫ ПОЛЬЗОВАТЕЛЬСКИХ ПЕРЕМЕННЫХ В RISE С ОБРАБОТКОЙ ПОЛНЫХ URL =====
window.UserVariables2 = {
  initialized: false,
  data: {},
  ready: false,
  attemptCounter: 0,
  maxAttempts: 10,
  lmsBaseUrl: '', // Базовый URL LMS
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[UserVariables2] Инициализация...');
    
    // Определяем базовый URL LMS
    this.detectLmsBaseUrl();
    
    // Инициализируем получение данных SCORM
    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables2] Данные пользователя загружены:', this.data);
        
        // Обрабатываем URL изображений
        this.processImageUrls();
        
        // Генерируем дополнительные поля для персонализации
        this.generatePersonalizationFields();
        
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
        console.error('[UserVariables2] Ошибка загрузки данных:', error);
        // Попробуем повторить позже
        if (this.attemptCounter < this.maxAttempts) {
          this.attemptCounter++;
          console.log(`[UserVariables2] Повторная попытка (${this.attemptCounter}/${this.maxAttempts})...`);
          setTimeout(() => {
            this.initialized = false;
            this.init();
          }, 1000);
        }
      });
  },
  
  // Определяем базовый URL LMS
  detectLmsBaseUrl() {
    try {
      // Получаем текущий URL страницы
      const currentUrl = window.location.href;
      console.log('[UserVariables2] Текущий URL:', currentUrl);
      
      // Пытаемся извлечь базовый URL LMS из текущего URL
      let lmsUrlMatch;
      
      // Сначала проверяем стандартный формат с доменом
      lmsUrlMatch = currentUrl.match(/(https?:\/\/[^\/]+)(\/.*)?/);
      if (lmsUrlMatch && lmsUrlMatch[1]) {
        this.lmsBaseUrl = lmsUrlMatch[1];
        console.log('[UserVariables2] Определен базовый URL LMS (из домена):', this.lmsBaseUrl);
      } 
      // Проверяем особый формат с "preview" путем
      else if (currentUrl.includes('/preview/')) {
        lmsUrlMatch = currentUrl.match(/(https?:\/\/[^\/]+\/preview\/[^\/]+)(\/.*)?/);
        if (lmsUrlMatch && lmsUrlMatch[1]) {
          this.lmsBaseUrl = lmsUrlMatch[1];
          console.log('[UserVariables2] Определен базовый URL LMS (из preview пути):', this.lmsBaseUrl);
        } else {
          console.warn('[UserVariables2] Не удалось определить базовый URL LMS из preview пути');
          this.getLmsBaseUrlFromScorm();
        }
      } else {
        console.warn('[UserVariables2] Не удалось определить базовый URL LMS из текущего URL');
        // Получаем из SCORM API
        this.getLmsBaseUrlFromScorm();
      }
    } catch (error) {
      console.error('[UserVariables2] Ошибка при определении базового URL LMS:', error);
      // Пробуем запасной метод
      this.getLmsBaseUrlFromScorm();
    }
  },
  
  // Попытка получить базовый URL LMS из SCORM API
  async getLmsBaseUrlFromScorm() {
    try {
      // Получаем информацию о URL из различных источников SCORM
      const lmsUrl = await this.getSCORMValue("cmi.launch_data");
      if (lmsUrl && typeof lmsUrl === 'string' && lmsUrl.includes('http')) {
        // Извлекаем базовый URL
        const urlMatch = lmsUrl.match(/(https?:\/\/[^\/]+)(\/.*)?/);
        if (urlMatch && urlMatch[1]) {
          this.lmsBaseUrl = urlMatch[1];
          console.log('[UserVariables2] Получен базовый URL LMS из SCORM:', this.lmsBaseUrl);
          return;
        }
      }
      
      // Пробуем получить из других параметров
      const lmsLocation = await this.getSCORMValue("cmi.core.lesson_location") || 
                         await this.getSCORMValue("adl.data") ||
                         await this.getSCORMValue("cmi.suspend_data");
      
      if (lmsLocation && typeof lmsLocation === 'string' && lmsLocation.includes('http')) {
        const urlMatch = lmsLocation.match(/(https?:\/\/[^\/]+)(\/.*)?/);
        if (urlMatch && urlMatch[1]) {
          this.lmsBaseUrl = urlMatch[1];
          console.log('[UserVariables2] Получен базовый URL LMS из дополнительных параметров:', this.lmsBaseUrl);
          return;
        }
      }
      
      // Если имена URL файлов изображений имеют определенный формат (например, viyar.ua в пути),
      // можем определить домен из них
      if (this.data && this.data.photo_thumb && typeof this.data.photo_thumb === 'string') {
        if (this.data.photo_thumb.includes('viyar.ua')) {
          this.lmsBaseUrl = 'https://study.viyar.ua';
          console.log('[UserVariables2] Определен базовый URL из имени файла изображения:', this.lmsBaseUrl);
          return;
        }
      }
      
      console.warn('[UserVariables2] Не удалось получить базовый URL LMS из SCORM, используем текущий домен');
      this.lmsBaseUrl = window.location.origin;
    } catch (error) {
      console.error('[UserVariables2] Ошибка при получении базового URL LMS из SCORM:', error);
      // Используем текущий домен как запасной вариант
      this.lmsBaseUrl = window.location.origin;
    }
  },
  
  // Обработка URL изображений пользователя
  processImageUrls() {
    try {
      console.log('[UserVariables2] Обработка URL изображений...');
      
      // Преобразование относительных URL фото в абсолютные
      const photoFields = ['photo_thumb', 'big_photo_thumb', 'user_photo', 'avatar'];
      
      for (const field of photoFields) {
        if (this.data[field] && typeof this.data[field] === 'string') {
          // Проверяем, является ли URL относительным
          if (this.data[field].startsWith('/') || 
              (!this.data[field].startsWith('http') && this.data[field].length > 0)) {
            
            // Формируем полный URL
            const originalUrl = this.data[field];
            const fullUrl = this.getFullImageUrl(originalUrl);
            
            // Создаем дополнительное поле с полным URL
            this.data[`${field}_full_url`] = fullUrl;
            
            // Создаем готовый HTML тег для прямой вставки изображения
            this.data[`${field}_html`] = `<img src="${fullUrl}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar">`;
            
            console.log(`[UserVariables2] Создан полный URL для ${field}: ${this.data[`${field}_full_url`]}`);
          } else if (this.data[field].startsWith('http')) {
            // URL уже абсолютный, сохраняем его в отдельном поле
            this.data[`${field}_full_url`] = this.data[field];
            
            // Создаем готовый HTML тег для прямой вставки изображения
            this.data[`${field}_html`] = `<img src="${this.data[field]}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar">`;
          }
        }
      }
      
      // Специально добавляем новое поле для полного URL аватара пользователя
      if (this.data.photo_thumb) {
        this.data.user_photo_full_url = this.data.photo_thumb_full_url || this.data.photo_thumb;
        this.data.user_photo_html = this.data.photo_thumb_html || `<img src="${this.data.user_photo_full_url}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar">`;
      }
      
      if (this.data.big_photo_thumb) {
        this.data.user_big_photo_full_url = this.data.big_photo_thumb_full_url || this.data.big_photo_thumb;
        this.data.user_big_photo_html = this.data.big_photo_thumb_html || `<img src="${this.data.user_big_photo_full_url}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar-large">`;
      }
      
      // Создаем URL с разными размерами для более гибкого использования
      if (this.data.photo_thumb_full_url) {
        const baseUrl = this.data.photo_thumb_full_url.split('?')[0];
        this.data.user_photo_small_url = baseUrl + '?size=64x64';
        this.data.user_photo_medium_url = baseUrl + '?size=128x128';
        this.data.user_photo_large_url = baseUrl + '?size=256x256';
        
        // Создаем HTML для разных размеров
        this.data.user_photo_small_html = `<img src="${this.data.user_photo_small_url}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar-small">`;
        this.data.user_photo_medium_html = `<img src="${this.data.user_photo_medium_url}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar-medium">`;
        this.data.user_photo_large_html = `<img src="${this.data.user_photo_large_url}" alt="${this.data.fullname || 'Фото пользователя'}" class="user-avatar-large">`;
      }
      
      console.log('[UserVariables2] Созданы поля с полными URL изображений:', 
                 this.data.user_photo_full_url, 
                 this.data.user_big_photo_full_url);
    } catch (error) {
      console.error('[UserVariables2] Ошибка при обработке URL изображений:', error);
    }
  },
  
  // Генерация дополнительных полей для персонализации
  generatePersonalizationFields() {
    try {
      console.log('[UserVariables2] Генерация полей персонализации...');
      
      // Приветствие с учетом времени суток
      this.data.greeting = this.getTimeBasedGreeting();
      
      // Полное приветствие с именем
      this.data.greeting_with_name = `${this.data.greeting}, ${this.data.firstname || this.data.fullname || 'пользователь'}!`;
      
      // Сокращенное имя и отчество
      if (this.data.firstname && this.data.patronymic) {
        this.data.short_name_patronymic = `${this.data.firstname} ${this.data.patronymic.charAt(0)}.`;
      }
      
      // Инициалы
      if (this.data.firstname && this.data.secondname) {
        this.data.initials = `${this.data.firstname.charAt(0)}.${this.data.secondname.charAt(0)}.`;
        if (this.data.patronymic) {
          this.data.initials_full = `${this.data.firstname.charAt(0)}.${this.data.secondname.charAt(0)}.${this.data.patronymic.charAt(0)}.`;
        }
      }
      
      console.log('[UserVariables2] Созданы поля персонализации:', 
                 this.data.greeting_with_name,
                 this.data.short_name_patronymic,
                 this.data.initials);
    } catch (error) {
      console.error('[UserVariables2] Ошибка при создании полей персонализации:', error);
    }
  },
  
  // Получение приветствия в зависимости от времени суток
  getTimeBasedGreeting() {
    try {
      const hour = new Date().getHours();
      
      if (hour >= 5 && hour < 12) {
        return 'Доброе утро';
      } else if (hour >= 12 && hour < 18) {
        return 'Добрый день';
      } else if (hour >= 18 && hour < 23) {
        return 'Добрый вечер';
      } else {
        return 'Доброй ночи';
      }
    } catch (error) {
      console.error('[UserVariables2] Ошибка при создании приветствия:', error);
      return 'Здравствуйте';
    }
  },
  
  // Формирование полного URL изображения
  getFullImageUrl(relativeUrl) {
    try {
      if (!relativeUrl) return '';
      
      // Если URL уже начинается с http, возвращаем как есть
      if (relativeUrl.startsWith('http')) {
        return relativeUrl;
      }
      
      // Обрабатываем специальный формат /preview/cbr.prod.XXX/...
      if (relativeUrl.includes('/preview/') || relativeUrl.startsWith('preview/')) {
        // Если путь начинается с /preview/ и текущий URL не содержит /preview/,
        // используем только домен из базового URL
        const domainMatch = this.lmsBaseUrl.match(/(https?:\/\/[^\/]+)/);
        if (domainMatch && domainMatch[1]) {
          const domain = domainMatch[1];
          const cleanPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
          return `${domain}${cleanPath}`;
        }
      }
      
      // Убираем начальный слеш, если есть
      const cleanUrl = relativeUrl.startsWith('/') ? relativeUrl.substring(1) : relativeUrl;
      
      // Формируем полный URL
      let baseUrl = this.lmsBaseUrl;
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }
      
      return `${baseUrl}/${cleanUrl}`;
    } catch (error) {
      console.error('[UserVariables2] Ошибка при формировании полного URL:', error);
      return relativeUrl;
    }
  },
  
  findLMSAPI(win) {
    if (!win) return null;
    try {
      if (win.hasOwnProperty("API")) return win.API;
      if (win.hasOwnProperty("API_1484_11")) return win.API_1484_11;
      else if (win.parent === win || !win.parent) return null;
      else return this.findLMSAPI(win.parent);
    } catch (e) {
      console.error('[UserVariables2] Ошибка при поиске LMS API:', e);
      return null;
    }
  },
  
  async getSCORMValue(element) {
    try {
      const lmsAPI = this.findLMSAPI(window);
      if (!lmsAPI) {
        console.error("[UserVariables2] LMS API не найден");
        return null;
      }
      
      let value = null;
      
      // SCORM 1.2
      if (typeof lmsAPI.LMSGetValue === "function") {
        value = lmsAPI.LMSGetValue(element);
        console.log(`[UserVariables2] Получено значение SCORM 1.2 для ${element}:`, value);
      }
      // SCORM 2004
      else if (typeof lmsAPI.GetValue === "function") {
        value = lmsAPI.GetValue(element);
        console.log(`[UserVariables2] Получено значение SCORM 2004 для ${element}:`, value);
      }
      
      return value;
    } catch (error) {
      console.error(`[UserVariables2] Ошибка получения ${element}:`, error);
      return null;
    }
  },
  
  async fetchUserData() {
    try {
      // Получаем полный перечень данных о пользователе из SCORM
      console.log("[UserVariables2] Запрашиваем данные пользователя из SCORM...");
      let studentInfo = await this.getSCORMValue("cmi.core.student_info");
      console.log("[UserVariables2] Результат запроса cmi.core.student_info:", studentInfo);
      
      // Если не получили через cmi.core.student_info, пробуем другие варианты
      if (!studentInfo) {
        console.log("[UserVariables2] Пробуем запросить cmi.suspend_data...");
        studentInfo = await this.getSCORMValue("cmi.suspend_data");
        console.log("[UserVariables2] Результат запроса cmi.suspend_data:", studentInfo);
      }
      
      // Получаем дополнительные данные напрямую
      const studentName = await this.getSCORMValue("cmi.core.student_name");
      const studentId = await this.getSCORMValue("cmi.core.student_id");
      
      console.log("[UserVariables2] Имя пользователя из SCORM:", studentName);
      console.log("[UserVariables2] ID пользователя из SCORM:", studentId);
      
      // Проверка студента по ID
      if (studentId && !studentInfo) {
        console.log("[UserVariables2] Используем только ID пользователя:", studentId);
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
            console.log("[UserVariables2] Парсим JSON данные...");
            parsedData = JSON.parse(studentInfo);
          } else if (typeof studentInfo === 'string') {
            // Проверяем, не является ли это строкой с разделителями
            if (studentInfo.includes('|') || studentInfo.includes(';')) {
              console.log("[UserVariables2] Обнаружена строка с разделителями, преобразуем в объект...");
              parsedData = this.parseDelimitedString(studentInfo);
            } else {
              console.log("[UserVariables2] Используем строку как есть:", studentInfo);
              parsedData = { 
                fullname: studentInfo,
                id: studentId
              };
            }
          } else if (typeof studentInfo === 'object') {
            console.log("[UserVariables2] Используем полученный объект напрямую");
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
            console.error("[UserVariables2] Не удалось распарсить данные");
            this.data = { 
              fullname: studentName || "Пользователь",
              id: studentId || "0"
            };
          }
          
          // Проверяем наличие всех необходимых полей
          this.ensureAllFields();
          
        } catch (parseError) {
          console.error("[UserVariables2] Ошибка парсинга данных:", parseError);
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
        console.log("[UserVariables2] Не удалось получить данные пользователя, используем только имя");
        this.data = {
          firstname: studentName || "Пользователь",
          fullname: studentName || "Пользователь",
          id: studentId || "0"
        };
        
        // Создаем базовые пустые поля
        this.ensureAllFields();
      }
      
      // Отображаем полученный набор данных в консоли
      console.log("[UserVariables2] Итоговые данные пользователя:", JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("[UserVariables2] Ошибка получения данных:", error);
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
  },
  
  processAllContent() {
    this.processTextNodes(document.body);
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

// Запускаем систему замены переменных при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables2] DOMContentLoaded, запускаем инициализацию');
  UserVariables2.init();
});

// Запускаем еще раз после полной загрузки страницы
window.addEventListener('load', () => {
  console.log('[UserVariables2] Page loaded, запускаем повторную обработку');
  if (!UserVariables2.initialized) {
    UserVariables2.init();
  } else {
    UserVariables2.processAllContent();
  }
});

// Запускаем с задержкой для уверенности в загрузке Rise
setTimeout(() => {
  console.log('[UserVariables2] Запуск с таймаутом');
  if (!UserVariables2.initialized) {
    UserVariables2.init();
  } else {
    UserVariables2.processAllContent();
  }
}, 1000);

// Запуск дополнительной обработки с большей задержкой
setTimeout(() => {
  console.log('[UserVariables2] Дополнительная проверка и обработка');
  if (UserVariables2.initialized) {
    UserVariables2.processAllContent();
  }
}, 3000);

// Немедленный запуск
console.log('[UserVariables2] Немедленный запуск скрипта');
UserVariables2.init();

// Экспортируем для доступа извне
window.UserVariables2 = UserVariables2; 