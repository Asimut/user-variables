
    window.UserVariables = {
      initialized: false,
      data: {},          // сюда соберём ВСЕ данные
      ready: false,
    
      /* 1. Список поддерживаемых полей (добавляй, если появятся новые) */
      SUPPORTED_FIELDS: [
        'id','uid','is_chief','position_rank','email','fullname','gender','city',
        'position','department','firstname','secondname','patronymic',
        'international_name','photo_thumb','big_photo_thumb'
      ],
    
      init() {
        if (this.initialized) return;
        this.initialized = true;
    
        console.log('[UserVariables] Инициализация…');
    
        this.fetchUserData()
          .then(() => {
            console.log('[UserVariables] Данные пользователя загружены:', this.data);
            this.ready = true;
    
            this.startObserver();
            this.initRiseSpecific();
          })
          .catch(err => console.error('[UserVariables] Ошибка загрузки данных:', err));
      },
    
      /* ——— SCORM helpers ——— */
      findLMSAPI(win) {
        if (win.API) return win.API;          // SCORM-1.2
        if (win.API_1484_11) return win.API_1484_11; // SCORM-2004
        if (win.parent === win) return null;
        return this.findLMSAPI(win.parent);
      },
    
      async getSCORMValue(el) {
        try {
          const api = this.findLMSAPI(window);
          if (!api) return null;
    
          if (typeof api.LMSGetValue === 'function')       // SCORM-1.2
            return api.LMSGetValue(el);
          if (typeof api.GetValue === 'function')          // SCORM-2004
            return api.GetValue(el);
    
          return null;
        } catch (e) {
          console.warn(`[UserVariables] LMS error for ${el}:`, e);
          return null;
        }
      },
    
      /* ——— Основное получение профиля ——— */
      async fetchUserData() {
        // 1) Пытаемся забрать JSON строкой
        let raw = await this.getSCORMValue('cmi.core.student_info') ||
                  await this.getSCORMValue('cmi.suspend_data');
    
        if (raw && typeof raw === 'string' && raw.trim().match(/^(\{|\[)/)) {
          try {
            this.data = JSON.parse(raw);
          } catch (e) {
            console.warn('[UserVariables] JSON parse failed, продолжу частичным сбором');
          }
        }
    
        // 2) Если ещё нет всех полей — добираем по отдельности
        for (const field of this.SUPPORTED_FIELDS) {
          if (this.data[field] !== undefined && this.data[field] !== null) continue;
    
          let scormKey = null;
          switch (field) {
            case 'id':          scormKey = 'cmi.core.student_id';       break; // 1.2
            case 'uid':         scormKey = 'cmi.learner_id';            break; // 2004
            case 'fullname':    scormKey = 'cmi.core.student_name';     break; // 1.2
            case 'firstname':   scormKey = 'cmi.learner_name';          break; // 2004 (может вернуть «Фамилия, Имя»)
            default:            scormKey = null;                        break;
          }
    
          if (scormKey) {
            const val = await this.getSCORMValue(scormKey);
            if (val) {
              if (field === 'firstname' && !this.data.firstname) {
                // дробим «Фамилия, Имя» или «Имя Фамилия»
                const parts = val.replace(',', ' ').trim().split(/\s+/);
                if (parts.length) this.data.firstname = parts[0];
              } else {
                this.data[field] = val;
              }
            }
          }
        }
    
        /* 3) Мини-пост-обработка: если fullname есть, но нет firstname */
        if (this.data.fullname && !this.data.firstname) {
          const p = this.data.fullname.replace(',', ' ').trim().split(/\s+/);
          if (p.length) this.data.firstname = p[0];
        }
    
        // 4) Стандарт: если поле всё ещё пустое — ставим пустую строку,
        //    чтобы при %user_xxx% не выводилось «undefined».
        this.SUPPORTED_FIELDS.forEach(f => {
          if (this.data[f] === undefined || this.data[f] === null) this.data[f] = '';
        });
      },
    
      /* ——— Rise-specific логика (не менялась) ——— */
      initRiseSpecific() { /* …как было… */ },
    
      /* ——— DOM Observer и замены текста ——— */
      processTextNode(node) {
        if (!this.ready) return;
    
        let txt = node.nodeValue;
        const matches = txt.match(/%user_[a-z_]+%/gi);
        if (!matches) return;
    
        matches.forEach(tag => {
          const clean = tag.replace(/%/g,'');     // user_email
          const key   = clean.replace('user_',''); // email
          const val   = this.data[key] ?? this.data[clean] ?? ''; // проверяем оба варианта
          txt = txt.replace(tag, val);
        });
    
        node.nodeValue = txt;
      },
    
      /* остальные методы (startObserver, processRiseElements, …) оставлены без изменений */
      // ... ⬇︎ ⬇︎ ⬇︎   (смотри полный код ниже)
    };
    
    /*  Запускаем после DOMContentLoaded  */
    window.addEventListener('DOMContentLoaded', () => {
      console.log('[UserVariables] DOM готов ➜ init()');
      window.UserVariables.init();
    
      window.addEventListener('load', () => {
        setTimeout(() => {
          window.UserVariables.processRiseElements?.();
          window.UserVariables.processRiseContentIframes?.();
        }, 500);
      });
    });
    
