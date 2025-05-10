/*  ──────────────────────────────────────────────────────────────
    UserVariables v2.2 — полный профиль + шаблоны %user_xxx%
    Работает в Articulate Rise и Storyline (Web-Object)
    Обновление 10 мая 2025:
      • processTextNode() теперь нечувствителен к регистру «user_»
      • В консоли логирует:  [%user_firstname% → "Олег"]
    ────────────────────────────────────────────────────────────── */

window.UserVariables = {
  /* ─── базовые флаги ─── */
  initialized: false,
  ready: false,
  data: {},

  /* ─── список поддерживаемых полей ─── */
  SUPPORTED_FIELDS: [
    'id', 'uid', 'is_chief', 'position_rank', 'email', 'fullname', 'gender',
    'city', 'position', 'department', 'firstname', 'secondname', 'patronymic',
    'international_name', 'photo_thumb', 'big_photo_thumb'
  ],

  /* ─── ИНИЦИАЛИЗАЦИЯ ─── */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[UserVariables] init()…');

    this.fetchUserData()
      .then(() => {
        console.log('[UserVariables] profile:', this.data);
        this.ready = true;

        this.startObserver();
        this.initRiseSpecific();
      })
      .catch(err => console.error('[UserVariables] fetch error:', err));
  },

  /* ───────────────── SCORM HELPERS ───────────────── */
  findLMSAPI(win) {
    if (win.API) return win.API;                 // SCORM-1.2
    if (win.API_1484_11) return win.API_1484_11; // SCORM-2004
    if (win.parent === win) return null;
    return this.findLMSAPI(win.parent);
  },

  async getSCORMValue(key) {
    try {
      const api = this.findLMSAPI(window);
      if (!api) return null;

      if (typeof api.LMSGetValue === 'function') return api.LMSGetValue(key); // 1.2
      if (typeof api.GetValue === 'function')    return api.GetValue(key);    // 2004
      return null;
    } catch (e) {
      console.warn('[UserVariables] LMS error for', key, e);
      return null;
    }
  },

  /* ───────────────── ПОЛУЧАЕМ ДАННЫЕ ───────────────── */
  async fetchUserData() {
    // 1) пробуем JSON-строкой
    let raw = await this.getSCORMValue('cmi.core.student_info') ||
              await this.getSCORMValue('cmi.suspend_data');

    if (raw && typeof raw === 'string' && raw.trim().match(/^(\{|\[)/)) {
      try { this.data = JSON.parse(raw); }
      catch { console.warn('[UserVariables] JSON parse failed'); }
    }

    // 2) добираем поля по отдельности
    for (const fld of this.SUPPORTED_FIELDS) {
      if (this.data[fld] !== undefined && this.data[fld] !== null) continue;

      let key = null;
      switch (fld) {
        case 'id':        key = 'cmi.core.student_id';   break; // 1.2
        case 'uid':       key = 'cmi.learner_id';        break; // 2004
        case 'fullname':  key = 'cmi.core.student_name'; break; // 1.2
        case 'firstname': key = 'cmi.learner_name';      break; // 2004
        default:          key = null;
      }
      if (key) {
        const val = await this.getSCORMValue(key);
        if (val) {
          if (fld === 'firstname') {
            this.data.firstname = val.replace(',', ' ').trim().split(/\s+/)[0];
          } else {
            this.data[fld] = val;
          }
        }
      }
    }

    // 3) firstname из fullname при необходимости
    if (this.data.fullname && !this.data.firstname) {
      this.data.firstname = this.data.fullname.replace(',', ' ').split(/\s+/)[0];
    }

    // 4) заполняем пустышки
    this.SUPPORTED_FIELDS.forEach(f => {
      if (this.data[f] === undefined || this.data[f] === null) this.data[f] = '';
    });
  },

  /* ───────────────── Rise-специфика ───────────────── */
  initRiseSpecific() {
    this.processRiseElements();
    this.monitorRiseRouteChanges();
    this.processRiseContentIframes();
  },

  /* ▸ проход по актуальному контенту Rise */
  processRiseElements() {
    const root = document.getElementById('app') || document.body;
    if (!root) return;
    this.processTextNodes(root);

    const extras = root.querySelectorAll(
      '.rich-text-content, .text-block, h1, h2, h3, h4, h5, h6, .heading'
    );
    extras.forEach(el => this.processTextNodes(el));
  },

  /* ▸ отслеживаем SPA-маршруты Rise */
  monitorRiseRouteChanges() {
    let last = location.href;
    setInterval(() => {
      if (location.href !== last) {
        last = location.href;
        setTimeout(() => {
          this.processRiseElements();
          this.processRiseContentIframes();
        }, 300);
      }
    }, 200);
  },

  /* ▸ прокидываем данные внутрь iframe-ов Rise */
  processRiseContentIframes() {
    document.querySelectorAll('iframe').forEach(iframe => {
      const inject = () => {
        try {
          iframe.contentWindow.UserVariables = {
            data: this.data,
            ready: true,
            processTextNodes: this.processTextNodes.bind(this)
          };
          this.processTextNodes(iframe.contentDocument.body);
        } catch (e) { /* cross-domain? игнор */ }
      };
      iframe.contentDocument ? inject() : iframe.addEventListener('load', inject);
    });
  },

  /* ───────────────── Замена плейсхолдеров ───────────────── */
  processTextNode(node) {
    if (!this.ready) return;

    let txt = node.nodeValue;
    const matches = txt.match(/%user_[a-z_]+%/gi);
    if (!matches) return;

    matches.forEach(tag => {
      const raw   = tag.slice(1, -1);                 // UserFirstName
      const lower = raw.toLowerCase();                // userfirstname
      const key   = lower.replace(/^user_/i, '');     // firstname
      const val   = this.data[key] ?? this.data[raw] ?? '';

      console.log(`[UserVariables] ${tag} → "${val}"`);
      txt = txt.replace(tag, val);
    });

    node.nodeValue = txt;
  },

  processTextNodes(root) {
    if (!this.ready || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes('%user_')) texts.push(walker.currentNode);
    }
    texts.forEach(n => this.processTextNode(n));
  },

  /* ───────────────── DOM-наблюдатель ───────────────── */
  startObserver() {
    this.observer = new MutationObserver(muts => {
      let update = false;
      muts.forEach(m => {
        if (m.type === 'childList' && m.addedNodes.length) update = true;
        if (m.type === 'characterData' && m.target.nodeValue.includes('%user_')) {
          this.processTextNode(m.target);
        }
      });
      if (update) this.processRiseElements();
    });

    this.observer.observe(document.body, {
      childList: true, subtree: true, characterData: true
    });

    this.processTextNodes(document.body);
    console.log('[UserVariables] MutationObserver ON');
  }
};

/* ───────────────────────── Bootstrap ───────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  console.log('[UserVariables] DOMContentLoaded ➜ init');
  window.UserVariables.init();

  window.addEventListener('load', () =>
    setTimeout(() => {
      window.UserVariables.processRiseElements();
      window.UserVariables.processRiseContentIframes();
    }, 500)
  );
});
