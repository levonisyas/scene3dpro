// ============================================================================
// Overlay Pro Card for Home Assistant
// ============================================================================

class overlayprocard extends HTMLElement {
    // --------------------------------------------------------------------------
    // Lovelace UI: Default YAML (Stub Config)
    // Home Assistant uses this when user adds the card from UI.
    // --------------------------------------------------------------------------
    static getStubConfig() {
      return {
        overlay_log: false,
        portal_mode: 'global',
        multi_mode: false,
        menu: {
          enabled: true,
          position: {
            mode: 'fixed',
            bottom: '15%',
            right: '5%',
            z_index: 1100
          },
          buttons: [
            {
              label: 'Lights',
              icon: 'mdi:lightbulb',
              target: '001'
            },
            {
              label: 'Climate',
              icon: 'mdi:thermostat',
              target: '002'
            }
          ]
        },

        embedders: [
          {
            embed_id: '001',
            dashboard: 'dashboard-test',
            embedder_title: 'Lights',
            show_close: true,
            show_title: true,
            default_visible: false,
            enable_scroll: true,
            content: {
              position: {
                mode: 'fixed',
                top: '15%',
                right: '5%',
                width: '300px',
                height: '350px',
                z_index: 1000
              }
            }
          },
          {
            embed_id: '002',
            dashboard: 'dashboard-test',
            embedder_title: 'Climate',
            show_close: true,
            show_title: true,
            default_visible: false,
            enable_scroll: true,
            content: {
              position: {
                mode: 'fixed',
                top: '35%',
                right: '15%',
                width: '300px',
                height: '350px',
                z_index: 1000
              }
            }
          }
        ]
      };
    }

    // --------------------------------------------------------------------------
    // SETTING: OVERLAY_LOG
    // --------------------------------------------------------------------------
    _log(...args) {
      try {
        if (this._config && this._config.overlay_log === true) console.log(...args);
      } catch (e) {}
    }
    _warn(...args) {
      try {
        if (this._config && this._config.overlay_log === true) console.warn(...args);
      } catch (e) {}
    }
    _error(...args) {
      try {
        console.error(...args);
      } catch (e) {}
    }
    // --------------------------------------------------------------------------
    // BACKBONE GATE (Global/Local)
    // Goal:
    // - portal_mode=global => SINGLE roots + SINGLE hash listener + SINGLE owner instance
    // - portal_mode=local  => per-instance behavior (unchanged)
    // This eliminates duplicate triggers/logs/blink and prevents stale z-index click blocking.
    // --------------------------------------------------------------------------

    _getPortalMode() {
      return (this._config && this._config.portal_mode) ? this._config.portal_mode : 'global';
    }

    _getGate() {
      if (!window.__overlaypro_gate) {
        window.__overlaypro_gate = {
          instances: new Set(),
          owner: null,
          roots: null,
          hashListener: null,
          refCount: 0,
        };
      }
      return window.__overlaypro_gate;
    }

    _electOwnerIfNeeded() {
      const gate = this._getGate();

      // If current owner is missing/disconnected, re-elect
      if (gate.owner && (!gate.owner.isConnected)) {
        gate.owner = null;
      }

      if (!gate.owner) {
        // Prefer choosing owner based on current hash target (legacy single + list mode)
        let hashId = null;
        try {
          const raw = String(window.location.hash || '');
          const m = /^#embed_(\d{3})$/.exec(raw);
          hashId = m ? m[1] : null;
        } catch (e) {}

        if (hashId) {
          for (const inst of gate.instances) {
            if (!inst || !inst.isConnected) continue;
            if (!inst._config) continue;

            // embedders[] list mode: pick the instance that owns the hash target
            try {
              if (typeof inst._hasEmbeddersList === 'function' && inst._hasEmbeddersList()) {
                if (typeof inst._getEmbedderDef === 'function' && inst._getEmbedderDef(hashId)) {
                  gate.owner = inst;
                  break;
                }
              }
            } catch (e) {}

            // legacy single mode: pick matching embed_id
            try {
              const eid = (inst._config && inst._config.embed_id != null) ? String(inst._config.embed_id).padStart(3, '0') : null;
              if (eid && eid === hashId) {
                gate.owner = inst;
                break;
              }
            } catch (e) {}
          }
        }

        // Fallback: first connected instance
        if (!gate.owner) {
          for (const inst of gate.instances) {
            if (inst && inst.isConnected) {
              gate.owner = inst;
              break;
            }
          }
        }
      }

      return gate.owner;
    }

    _isGateOwner() {
      const mode = this._getPortalMode();
      if (mode === 'local') return true;
      const gate = this._getGate();
      this._electOwnerIfNeeded();
      return gate.owner === this;
    }

    _registerGateInstance() {
      const mode = this._getPortalMode();
      if (mode === 'local') return;

      const gate = this._getGate();
      if (!gate.instances.has(this)) {
        gate.instances.add(this);
        gate.refCount++;
      }
      this._electOwnerIfNeeded();
    }

    _unregisterGateInstance() {
      const mode = this._getPortalMode();
      if (mode === 'local') return;

      const gate = this._getGate();
      if (gate.instances.has(this)) {
        gate.instances.delete(this);
        gate.refCount = Math.max(0, gate.refCount - 1);
      }

      if (gate.owner === this) {
        gate.owner = null;
        this._electOwnerIfNeeded();
      }
    }

    // --------------------------------------------------------------------------
    // Configuration Setup - optimized validation
    // --------------------------------------------------------------------------
    setConfig(config) {
      // --------------------------------------------------------------------------
      // SETTING: CONFIG_VALIDATION (Etap.1)
      // - Menu does NOT require dashboard
      // - Embedded content supports Floor3D-style list: embedders[]
      // - Backward compatible: single embed_id + dashboard
      // --------------------------------------------------------------------------

      const menuOnly = config.menu_only === true;

      // NEW: embedders[] support (single card, multiple popups)
      const hasEmbedders = Array.isArray(config.embedders) && config.embedders.length > 0;

      // Backward compatibility: old single-embed requires dashboard + embed_id (unless menu_only)
      // New mode: dashboard can be per-embedder (global dashboard optional)
      if (!hasEmbedders) {
        // legacy path
        if (!menuOnly) {
          if (!config.dashboard) {
            throw new Error('Overlay Pro Card requires dashboard parameter (legacy mode)');
          }
          if (!config.embed_id) {
            throw new Error('Overlay Pro Card requires embed_id (unless menu_only: true)');
          }
          const embedIdRegex = /^\d{3}$/;
          if (!embedIdRegex.test(config.embed_id.toString())) {
            throw new Error('embed_id must be a 3-digit number (001-999)');
          }
        }
      } else {
        // new path: validate each embedder entry
        const embedIdRegex = /^\d{3}$/;
        const globalDash = config.dashboard ? String(config.dashboard) : null;

        config.embedders.forEach((e, idx) => {
          const id = e && e.embed_id != null ? String(e.embed_id) : '';
          if (!embedIdRegex.test(id)) {
            throw new Error(`embedders[${idx}].embed_id must be a 3-digit number (001-999)`);
          }
          const dash = (e && e.dashboard != null) ? String(e.dashboard) : globalDash;
          if (!dash) {
            throw new Error(`embedders[${idx}].dashboard is required (or set global dashboard)`);
          }
        });
      }

      // Normalize embedders[] (store stable defaults per embedder)
      const normalizedEmbedders = hasEmbedders
        ? config.embedders.map((e) => {
            const globalDash = config.dashboard ? String(config.dashboard) : null;
            const embedId = String(e.embed_id).padStart(3, '0');
            const dash = (e.dashboard != null) ? String(e.dashboard) : globalDash;

            return {
              ...e,
              embed_id: embedId,
              dashboard: dash,
              embedder_title: (e.embedder_title != null ? String(e.embedder_title) : ''),
              show_close: (e.show_close === true),
              show_title: (e.show_title !== false),
              default_visible: (e.default_visible === true),
              enable_scroll: (e.enable_scroll !== false),
              content: {
                position: {
                  mode: (e.content && e.content.position && e.content.position.mode) || 'fixed',
                  // IMPORTANT: content defaults should NOT force right/bottom unless user sets
                  top: (e.content && e.content.position && e.content.position.top) ?? null,
                  left: (e.content && e.content.position && e.content.position.left) ?? null,
                  right: (e.content && e.content.position && e.content.position.right) ?? null,
                  bottom: (e.content && e.content.position && e.content.position.bottom) ?? null,
                  z_index: (e.content && e.content.position && e.content.position.z_index) ?? 1000,
                  width: (e.content && e.content.position && e.content.position.width) ?? 520,
                  height: (e.content && e.content.position && e.content.position.height) ?? 420
                }
              }
            };
          })
        : [];

      // Store configuration with new parameters
      this._config = {
        ...config,
        menu_only: menuOnly,
        embedders: normalizedEmbedders,              // NEW: single card multi-embed list
        enable_scroll: config.enable_scroll !== false, // legacy single-embed default: true
        // SETTING: OVERLAY_LOG
        // Controls: console log/warn verbosity
        // Default: false
        overlay_log: (config.overlay_log === true),

        // SETTING: PORTAL_MODE
        // "global" (default) = mount to document.body
        // "local"            = mount inside this card (container)
        portal_mode: (config.portal_mode === 'local') ? 'local' : 'global',
        // SETTING: MULTI_MODE
        // Controls: single popup vs multi popup
        // Default: false
        // NOTE: legacy "multi" still supported as fallback
        multi_mode: (config.multi_mode === true) || (config.multi === true),

        // Legacy header defaults (only used when NOT using embedders[])
        show_close: config.show_close || false,
        embedder_title: config.embedder_title || '',
        show_title: config.show_title !== false,
        // Default: false (overlay_log gibi). Sadece açıkça true yazılırsa açılır.
        default_visible: (config.default_visible === true),

        // NEW: Sabit menü + overlay içerik (tek card içinde)
        menu: {
          enabled: (config.menu && config.menu.enabled === true), // Default: false
          position: {
            mode: (config.menu && config.menu.position && config.menu.position.mode) || 'fixed',
            // IMPORTANT: top/right default ZORLA gelmesin; user bottom/right verirse top boş kalmalı
            top: (config.menu && config.menu.position && config.menu.position.top) ?? null,
            left: (config.menu && config.menu.position && config.menu.position.left) ?? null,
            right: (config.menu && config.menu.position && config.menu.position.right) ?? null,
            bottom: (config.menu && config.menu.position && config.menu.position.bottom) ?? null,
            z_index: (config.menu && config.menu.position && config.menu.position.z_index) ?? 1100
          },
          buttons: (config.menu && Array.isArray(config.menu.buttons)) ? config.menu.buttons : [],

          // NEW: Button styling (global) - ONLY STATIC (no hover)
          button_style: (config.menu && typeof config.menu.button_style === 'string') ? config.menu.button_style : null
        },

        // NEW: İçerik overlay pozisyonu (card-mod yok)
        content: {
          position: {
            mode: (config.content && config.content.position && config.content.position.mode) || 'fixed',
            top: (config.content && config.content.position && config.content.position.top) ?? null,
            left: (config.content && config.content.position && config.content.position.left) ?? null,
            right: (config.content && config.content.position && config.content.position.right) ?? null,
            bottom: (config.content && config.content.position && config.content.position.bottom) ?? null,
            z_index: (config.content && config.content.position && config.content.position.z_index) ?? 1000,
            width: (config.content && config.content.position && config.content.position.width) ?? 520,
            height: (config.content && config.content.position && config.content.position.height) ?? 420
          }
        }
      };

      // NOT: hass setter daha sonra set ediliyor; ama edit-save sonrası hass zaten set olabilir.
      // hass'ı burada sıfırlamayalım; state reset yapıp yeniden render edelim.
      this._loaded = false;
      // SETTING: OVERLAY_LOG (global flag for helper functions too)
      window.__OVERLAY_PRO_LOG = (this._config && this._config.overlay_log === true);

      // --------------------------------------------------------------------------
      // SETTING: VIEW_VISIBILITY_GUARD (Etap.1 Fix)
      // Prevents:
      // - menu flash on other views
      // - sidebar clicks blocked by stale overlay/content
      // --------------------------------------------------------------------------
      this._viewIO = null;
      this._boundLocationChanged = null;
      this._portalActive = true;

      // Portal/layer refs reset (edit/save sonrası kaybolmayı engeller)
      try {
        if (this._menuRoot && this._menuRoot.parentNode) this._menuRoot.parentNode.removeChild(this._menuRoot);
        if (this._contentRoot && this._contentRoot.parentNode) this._contentRoot.parentNode.removeChild(this._contentRoot);
        if (this._portalRoot && this._portalRoot.parentNode) this._portalRoot.parentNode.removeChild(this._portalRoot);
      } catch (e) {}

      this._portalRoot = null;
      this._menuRoot = null;
      this._contentRoot = null;
      // MULTI POPUP RUNTIME STATE
      this._contentContainer = null;      // click-through container
      this._contentRoots = new Map();     // embed_id -> root
      this._openSet = new Set();          // open embed list
      this._cardCache = new Map();        // embed_id -> card element
      this._lastOpened = null;
      // ENGINE PATCH: BACKBONE_UNIFY_V1
      this._pendingSingleRewrite = null;

      // ENGINE: menu render dedupe state (prevents blink)
      this._menuRenderKey = null;

      // Host temizle (ama portal body'de olduğu için asıl UI zaten orada)
      this.innerHTML = '';

      // Eğer hass zaten geldiyse (edit/save sonrası sık olur) yeniden yükle
      if (this._hass) {
        Promise.resolve().then(() => this._loadCard());
      } else {
        // hass gelmeden de menüyü kur (menu-only veya genel menü)
        Promise.resolve().then(() => {
          if (typeof this._ensureLayerRoots === 'function') {
            this._ensureLayerRoots();
            // default visible content sadece embed modda anlamlı
            if (this._config && this._config.default_visible) {
              this._showContentLayer();
            } else {
              this._hideContentLayer();
            }
          }
        });
      }
    }
    // --------------------------------------------------------------------------
    // SETTING: VIEW_VISIBILITY_GUARD (Etap.1 Fix)
    // Hide menu/content when this card is not visible in current view.
    // --------------------------------------------------------------------------
    _setPortalActive(active) {
      this._portalActive = !!active;

      // If roots not created yet, nothing to do
      if (!this._menuRoot && !this._contentRoot) return;

      // Menu: only show if enabled AND portal active
      if (this._menuRoot) {
        const enabled = !!(this._config && this._config.menu && this._config.menu.enabled);
        this._menuRoot.style.display = (this._portalActive && enabled) ? 'block' : 'none';
      }

      // Content: when portal inactive => force-hide (prevents click-block / stale overlays)
      if (this._contentRoot || this._contentContainer) {
        if (!this._portalActive) {
          // SINGLE
          if (this._contentRoot) {
            this._contentRoot.style.display = 'none';
            this._contentRoot.style.pointerEvents = 'none';
          }

          // MULTI: hide all roots
          if (this._contentRoots && this._contentRoots.size > 0) {
            for (const root of this._contentRoots.values()) {
              root.style.display = 'none';
              root.style.pointerEvents = 'none';
            }
          }
        } else {
          // When active again, respect hash/default logic (single mode only)
          try {
            if (typeof this._checkHash === 'function') {
              this._checkHash();
            }
          } catch (e) {}
        }
      }
    }

    _setupViewVisibilityGuard() {
      try {
        // Clear previous observer/listeners
        if (this._viewIO) {
          this._viewIO.disconnect();
          this._viewIO = null;
        }

        // Observe card visibility
        this._viewIO = new IntersectionObserver((entries) => {
          const visible = !!(entries && entries.some(e => e.isIntersecting && e.intersectionRatio > 0));
          this._setPortalActive(visible);
        }, { threshold: 0.01 });

        this._viewIO.observe(this);

        // Also react to route/view changes
        if (!this._boundLocationChanged) {
          this._boundLocationChanged = () => {
            setTimeout(() => {
              // “isConnected + offsetParent” = pratik görünürlük check
              // Always hide first (prevents menu sticking on other dashboards)
              this._setPortalActive(false);

              // Then re-check after HA finishes rendering new view
              setTimeout(() => {
                const visible = !!(this.isConnected && this.offsetParent !== null);
                this._setPortalActive(visible);
              }, 100);
            }, 0);
          };
          window.addEventListener('location-changed', this._boundLocationChanged);
          // EXTRA: HA navigation sometimes does not trigger IntersectionObserver correctly
          // Force-hide portal UI on real navigation events (NOT on hash changes)
          window.addEventListener('popstate', this._boundLocationChanged);

        }
      } catch (e) {
        // fail-safe: hide everything to avoid blocking HA UI
        this._setPortalActive(false);
      }
    }

    _teardownViewVisibilityGuard() {
      try {
        if (this._viewIO) {
          this._viewIO.disconnect();
          this._viewIO = null;
        }
        if (this._boundLocationChanged) {
          window.removeEventListener('location-changed', this._boundLocationChanged);
          window.removeEventListener('popstate', this._boundLocationChanged);

          this._boundLocationChanged = null;
        }
      } catch (e) {}
    }


    // --------------------------------------------------------------------------
    // SETTING: EDIT_SAVE_LIFECYCLE_FIX
    // Lovelace edit/save reload stability (re-attach portal + layers)
    // --------------------------------------------------------------------------

    connectedCallback() {
      try {
        // Gate registration (global only; local is no-op)
        this._registerGateInstance();
        this._electOwnerIfNeeded();

        this._ensureLayerRoots();

        // SETTING: VIEW_VISIBILITY_GUARD
        this._setupViewVisibilityGuard();

        // content başlangıç görünürlüğü (owner-only in global; local unchanged)
        if (this._config && this._config.default_visible) {
          this._showContentLayer();
        } else {
          this._hideContentLayer();
        }

        const visible = !!(this.isConnected && this.offsetParent !== null);
        this._setPortalActive(visible);

      } catch (e) {}
    }
  
    // --------------------------------------------------------------------------
    // Home Assistant Integration
    // --------------------------------------------------------------------------
    set hass(hass) {
      this._hass = hass;
      if (!this._loaded) {
        this._loadCard();
      } else if (this._contentElement) {
        this._contentElement.hass = hass;
      }
    }
    // --------------------------------------------------------------------------
    // Layer Root Setup (Menu: always visible, Content: overlay toggles)
    // --------------------------------------------------------------------------
    // --------------------------------------------------------------------------
    // SETTING: PORTAL_MODE
    // Menu/content mounted to document.body for Lovelace stability
    // --------------------------------------------------------------------------

    _ensureLayerRoots() {
      // SETTING: PORTAL_MODE
      // global (default) => SINGLE roots on document.body (via backbone gate)
      // local            => per-instance roots (unchanged)
      const mode = this._getPortalMode();

      // Always register (global only). Safe in local (no-op).
      this._registerGateInstance();

      const mountTarget = (mode === 'local') ? this : document.body;

      // =========================================================================
      // DEBUG: Portal mount mode log (ALWAYS visible, once)
      // =========================================================================
      if (!this._portalModeLogged) {
        this._portalModeLogged = true;

        const targetName =
          (mountTarget === document.body)
            ? 'document.body'
            : (mountTarget.tagName ? mountTarget.tagName.toLowerCase() : 'local-container');

        console.info(
          `pro.[OVERLAY] portal_mode:"${mode}" mounted to → ${targetName}`
        );
      }

      // GLOBAL MODE: Use SINGLE shared roots.
      if (mode !== 'local') {
        const gate = this._getGate();
        this._electOwnerIfNeeded();

        // Create shared roots once
        if (!gate.roots) {
          const portalRoot = document.createElement('div');
          portalRoot.className = 'overlaypro-card-portal';
          portalRoot.style.cssText = `display: none;`;

          const menuRoot = document.createElement('div');
          menuRoot.className = 'overlaypro-card-menu-root';
          menuRoot.style.pointerEvents = 'auto';

          // SINGLE (legacy) root
          const contentRoot = document.createElement('div');
          contentRoot.className = 'overlaypro-card-content-root';
          contentRoot.style.pointerEvents = 'auto';

          // MULTI container (always exists, click-through)
          const contentContainer = document.createElement('div');
          contentContainer.className = 'overlaypro-card-content-container';
          contentContainer.style.cssText = `
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1000;
          `;

          document.body.appendChild(portalRoot);
          document.body.appendChild(menuRoot);
          document.body.appendChild(contentRoot);
          document.body.appendChild(contentContainer);

          gate.roots = { portalRoot, menuRoot, contentRoot, contentContainer };
        }


        // Bind this instance to shared roots
        this._portalRoot = gate.roots.portalRoot;
        this._menuRoot = gate.roots.menuRoot;
        this._contentRoot = gate.roots.contentRoot;
        this._contentContainer = gate.roots.contentContainer || null;

        // Only OWNER should render/position (prevents blink + duplicate handlers)
        if (!this._isGateOwner()) {
          return;
        }

        this._applyMenuPositioning();

        // SINGLE positioning (legacy root)
        this._applyContentPositioning(this._getActiveEmbedderSettings(), this._contentRoot);

        this._renderMenu();
        return;
      }

      // LOCAL MODE: per-instance roots (original behavior)
      if (!this._portalRoot) {
        this._portalRoot = document.createElement('div');
        this._portalRoot.className = 'overlaypro-card-portal';
        this._portalRoot.style.cssText = `display: none;`;
        mountTarget.appendChild(this._portalRoot);
      }

      if (!this._menuRoot) {
        this._menuRoot = document.createElement('div');
        this._menuRoot.className = 'overlaypro-card-menu-root';
        this._menuRoot.style.pointerEvents = 'auto';

        this._menuRoot.style.position = 'absolute';
        this._menuRoot.style.inset = '0';

        mountTarget.appendChild(this._menuRoot);
      }
      this._applyMenuPositioning();

      if (!this._contentRoot) {
        this._contentRoot = document.createElement('div');
        this._contentRoot.className = 'overlaypro-card-content-root';
        this._contentRoot.style.pointerEvents = 'auto';

        this._contentRoot.style.position = 'absolute';
        this._contentRoot.style.inset = '0';

        mountTarget.appendChild(this._contentRoot);
      }
      // MULTI: click-through container (local mode)
      if (!this._contentContainer) {
        this._contentContainer = document.createElement('div');
        this._contentContainer.className = 'overlaypro-card-content-container';
        this._contentContainer.style.cssText = `
          position: absolute;
          inset: 0;
          pointer-events: auto;
          z-index: 1000;
          background: transparent;
        `;
        mountTarget.appendChild(this._contentContainer);
      }

      // SINGLE positioning (legacy root)
      this._applyContentPositioning(this._getActiveEmbedderSettings(), this._contentRoot);

      this._renderMenu();
    }
    // --------------------------------------------------------------------------
    // MULTI POPUP: Root Factory
    // --------------------------------------------------------------------------

    _getOrCreateContentRootFor(embedId) {
      if (!this._contentContainer) return null;

      const id = String(embedId || '').padStart(3, '0');

      if (!this._contentRoots) this._contentRoots = new Map();

      if (this._contentRoots.has(id)) {
        return this._contentRoots.get(id);
      }

      const root = document.createElement('div');
      root.className = 'overlaypro-card-content-root';
      root.dataset.id = id;

      // CRITICAL:
      // - container pointer-events: none
      // - root pointer-events: auto
      root.style.pointerEvents = 'auto';
      root.style.display = 'none';

      this._contentContainer.appendChild(root);
      this._contentRoots.set(id, root);

      return root;
    }

    // --------------------------------------------------------------------------
    // SETTING: MENU_POSITION
    // Controls: menu top/left/right/bottom/z-index/mode
    // --------------------------------------------------------------------------

    _applyMenuPositioning() {
      const p = (this._config.menu && this._config.menu.position) ? this._config.menu.position : {};
      const toPx = (v) => (typeof v === 'number' ? `${v}px` : v);

      this._menuRoot.style.position = p.mode || 'fixed';
      this._menuRoot.style.zIndex = String(p.z_index ?? 1100);

      // reset
      this._menuRoot.style.top = '';
      this._menuRoot.style.left = '';
      this._menuRoot.style.right = '';
      this._menuRoot.style.bottom = '';

      // Fallback: user hiç konum vermediyse sağ üst
      const hasVertical = (p.top != null) || (p.bottom != null);
      const hasHorizontal = (p.left != null) || (p.right != null);

      if (!hasVertical) this._menuRoot.style.bottom = '20px';
      if (!hasHorizontal) this._menuRoot.style.right = '20px';

      if (p.top != null) this._menuRoot.style.top = toPx(p.top);
      if (p.left != null) this._menuRoot.style.left = toPx(p.left);
      if (p.right != null) this._menuRoot.style.right = toPx(p.right);
      if (p.bottom != null) this._menuRoot.style.bottom = toPx(p.bottom);
    }
    // --------------------------------------------------------------------------
    // SETTING: CONTENT_POSITION
    // Controls: popup width/height/top/left/z-index
    // --------------------------------------------------------------------------

    _applyContentPositioning(active = null, rootEl = null) {
      const cfgPos =
        (active && active.content && active.content.position)
          ? active.content.position
          : ((this._config.content && this._config.content.position) ? this._config.content.position : {});

      const p = cfgPos || {};
      const toPx = (v) => (typeof v === 'number' ? `${v}px` : v);

      const target = rootEl || this._contentRoot;
      if (!target) return;

      target.style.position = p.mode || 'fixed';
      target.style.zIndex = String(p.z_index ?? 1000);

      // reset
      target.style.top = '';
      target.style.left = '';
      target.style.right = '';
      target.style.bottom = '';
      target.style.width = '';
      target.style.height = '';

      // Fallback: user hiç konum vermediyse varsayılan ver SETTING: CONTENT_POSITION (sağ üst)
      // IMPORTANT: user bottom/right verirse top/left zorlanmaz (menu ile aynı mantık)
      const hasVertical = (p.top != null) || (p.bottom != null);
      const hasHorizontal = (p.left != null) || (p.right != null);

      if (!hasVertical) target.style.top = '80px';
      if (!hasHorizontal) target.style.right = '20px';

      if (p.top != null) target.style.top = toPx(p.top);
      if (p.left != null) target.style.left = toPx(p.left);
      if (p.right != null) target.style.right = toPx(p.right);
      if (p.bottom != null) target.style.bottom = toPx(p.bottom);

      if (p.width != null) target.style.width = toPx(p.width);
      if (p.height != null) target.style.height = toPx(p.height);
    }

    _showContentLayer(rootEl = null) {
      const mode = this._getPortalMode();
      if (mode !== 'local' && !this._isGateOwner()) return;

      const target = rootEl || this._contentRoot;
      if (!target) return;

      target.style.display = 'block';
      target.style.pointerEvents = 'auto';
    }

    _hideContentLayer(rootEl = null) {
      const mode = this._getPortalMode();
      if (mode !== 'local' && !this._isGateOwner()) return;

      const target = rootEl || this._contentRoot;
      if (!target) return;

      // IMPORTANT: display:none => alttaki UI tıklamaları engellenmez
      // EXTRA SAFETY: DOM asılı kalsa bile click-block olmasın
      target.style.display = 'none';
      target.style.pointerEvents = 'none';
    }

    _clearHash() {
      try {
        // Deterministic: trigger real hashchange so _checkHash can close content
        if (window.location.hash) {
          window.location.hash = '';
        }
      } catch (e) {
        // fallback
        window.location.hash = '';
      }
    }
    // --------------------------------------------------------------------------
    // MULTI HASH HELPERS
    // Format: #embed_001,002,005
    // --------------------------------------------------------------------------
    _parseMultiHash() {
      const raw = String(window.location.hash || '');
      const m = /^#embed_(.+)$/.exec(raw);
      if (!m || !m[1]) return [];
      return m[1]
        .split(',')
        .map(v => v.trim())
        .filter(v => /^\d{3}$/.test(v));
    }

    _writeMultiHash(ids) {
      const uniq = [];
      for (const id of ids) {
        const v = String(id).padStart(3, '0');
        if (!uniq.includes(v)) uniq.push(v);
      }
      if (uniq.length === 0) {
        this._clearHash();
        return;
      }
      const next = `#embed_${uniq.join(',')}`;
      if (window.location.hash !== next) {
        window.location.hash = next;
      }
    }

    // --------------------------------------------------------------------------
    // MULTI POPUP: Toggle embedder without hash
    // --------------------------------------------------------------------------

    async _toggleEmbedderMulti(embedId) {
      // IMPORTANT: roots must exist before DOM ops
      this._ensureLayerRoots();

      const id = String(embedId || '').padStart(3, '0');
      const root = this._getOrCreateContentRootFor(id);
      if (!root) return;

      if (!this._openSet) this._openSet = new Set();

      // CLOSE
      if (this._openSet.has(id)) {
        this._hideContentLayer(root);
        this._openSet.delete(id);
        return;
      }

      // OPEN (stabilize: allow close even if open fails)
      // - mark as open BEFORE attempting load (so next toggle can close)
      // - do NOT clear/alter other open states
      this._openSet.add(id);
      this._showContentLayer(root);

      await this._openEmbedderById(id, { fromHash: false, targetRoot: root, multi: true });

      this._lastOpened = id;
    }

    _toggleHash(embedId) {
      const myHash = `#embed_${embedId}`;
      if (window.location.hash === myHash) {
        this._clearHash();
      } else {
        window.location.hash = myHash;
      }
    }

    _renderMenu() {
      if (!this._menuRoot) return;

      // ENGINE RULE (global): only owner can render menu
      const mode = this._getPortalMode();
      if (mode !== 'local' && !this._isGateOwner()) return;

      // Menü kapalıysa bile root durur; sadece görünüm yönetimi
      const enabled = !!(this._config.menu && this._config.menu.enabled);
      if (!enabled) {
        this._menuRoot.style.display = 'none';
        return;
      }

      // ENGINE DEDUPE: same config => do not rebuild menu DOM (blink fix)
      const _menuCfg = this._config.menu || {};
      const _posCfg = _menuCfg.position || {};
      const _btnCfg = Array.isArray(_menuCfg.buttons) ? _menuCfg.buttons : [];

      const renderKey = JSON.stringify({
        portal_mode: this._getPortalMode(),
        enabled: !!_menuCfg.enabled,
        position: {
          mode: _posCfg.mode,
          top: _posCfg.top,
          left: _posCfg.left,
          right: _posCfg.right,
          bottom: _posCfg.bottom,
          z_index: _posCfg.z_index
        },
        button_style: _menuCfg.button_style || null,
        buttons: _btnCfg.map((b) => ({
          label: b.label,
          icon: b.icon,
          target: b.target || b.embed_id
        }))
      });

      if (this._menuRenderKey === renderKey && this._menuRoot.children.length > 0) {
        this._menuRoot.style.display = 'block';
        return;
      }

      this._menuRenderKey = renderKey;

      this._menuRoot.style.display = 'block';
      this._menuRoot.innerHTML = '';

      // ------------------------------------------------------------------------
      // SETTING: MENU_CONTAINER_STYLE
      // Controls: wrapper background, padding, gap, border-radius, shadow
      // ------------------------------------------------------------------------

      const wrap = document.createElement('div');
      wrap.className = 'overlaypro-card-menu';
      wrap.style.cssText = `
        display: flex;
        gap: 8px;
        padding: 8px;
        border-radius: 0px;
        background: transparent;
        box-shadow: none;
        align-items: center;
      `;

      const buttons = (this._config.menu && Array.isArray(this._config.menu.buttons)) ? this._config.menu.buttons : [];
      buttons.forEach((b) => {
        const target = b.target || b.embed_id;
        if (!target) return;
        // ----------------------------------------------------------------------
        // SETTING: BUTTON_STYLE
        // Controls: button background, color, radius, font, spacing
        // ----------------------------------------------------------------------

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'overlaypro-card-menu-button';
        const baseStyle = `
          border: none;
          cursor: pointer;
          padding: 8px 10px;
          border-radius: 0px;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-weight: 600;
          display: inline-flex;
          gap: 6px;
          align-items: center;
        `;
        // ----------------------------------------------------------------------
        // SETTING: BUTTON_STYLE_OVERRIDE
        // YAML: menu.button_style (global) or buttons[].style (per button)
        // ----------------------------------------------------------------------

        // Static override (per-button > global)
        const overrideStyle =
          (b.style && typeof b.style === 'string' ? b.style : '') ||
          (this._config.menu && typeof this._config.menu.button_style === 'string'
            ? this._config.menu.button_style
            : '');

        btn.style.cssText = baseStyle + (overrideStyle ? `\n${overrideStyle}` : '');

        // Optional icon support (mdi:...)
        if (b.icon) {
          const iconEl = document.createElement('ha-icon');
          iconEl.setAttribute('icon', b.icon);
          iconEl.style.cssText = `
            width: 18px;
            height: 18px;
            color: inherit;
          `;
          btn.appendChild(iconEl);
        }

        const labelSpan = document.createElement('span');
        labelSpan.textContent = b.label || target;
        btn.appendChild(labelSpan);
          // DETERMINISTIC ENGINE BACKBONE:
          // Click => ONLY hash change
          // Open/Close => ONLY _checkHash() via hashchange / state sync
          btn.addEventListener('click', () => {
            const id = String(target).padStart(3, '0');

            if (this._config && this._config.multi_mode === true) {
              const current = this._parseMultiHash();
              const has = current.includes(id);
              const next = has
                ? current.filter(x => x !== id)
                : current.concat(id);
              this._writeMultiHash(next);
            } else {
              this._toggleHash(id);
            }
          });


        wrap.appendChild(btn);
      });

      this._menuRoot.appendChild(wrap);
    }
  
    // --------------------------------------------------------------------------
    // ERROR UI (Deterministic backbone) - single template
    // --------------------------------------------------------------------------
    _renderError(targetRoot, error, active = null) {
      try {
        if (!targetRoot) return;

        const embedId = String(
          (active && active.embed_id)
            ? active.embed_id
            : (this._config && this._config.embed_id)
              ? this._config.embed_id
              : ''
        ).padStart(3, '0');

        const dashboard = (active && active.dashboard)
          ? String(active.dashboard)
          : (this._config && this._config.dashboard)
            ? String(this._config.dashboard)
            : '';

        const msg = (error && error.message) ? String(error.message) : String(error || 'Unknown error');

        targetRoot.innerHTML = `
          <div style="color: var(--error-color); padding: 20px; text-align: center;">
            <div style="font-size: 1.2em; margin-bottom: 10px;">
              🔍 Embedding Failed
            </div>
            <div style="margin-bottom: 15px;">
              ${msg}
            </div>
            <div style="font-size: 0.9em; color: var(--secondary-text-color);">
              <strong>Troubleshooting tips:</strong><br>
              1. Add <code>icon: EMBED#${embedId}</code> to your source card<br>
              2. Verify dashboard name: "${dashboard}"<br>
              3. Ensure embed_id is unique (001-999)
            </div>
          </div>
        `;
      } catch (e) {
        // fail-safe (do nothing)
      }
    }

    // --------------------------------------------------------------------------
    // Main Loading Function - optimized performance
    // --------------------------------------------------------------------------
    async _loadCard() {
      // Clean host setup
      // SETTING: PORTAL_MODE (local = closed system viewport, global = click-through)
      const mode = (this._config && this._config.portal_mode) ? this._config.portal_mode : 'global';

      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.padding = '0';
      this.style.margin = '0';
      this.style.borderRadius = '0';

      if (mode === 'local') {
        // LOCAL: host is the viewport container
        this.style.width = '100%';
        this.style.height = '100%';
        this.style.minHeight = '1px';
        this.style.pointerEvents = 'auto';
      } else {
        // GLOBAL: host is click-through (0x0)
        this.style.width = '0';
        this.style.height = '0';
        this.style.minHeight = '0';
        this.style.pointerEvents = 'none'; // host kesinlikle click yakalamasın
      }


      // Prepare layer roots (menu always visible, content toggles)
      this.innerHTML = '';
      this._ensureLayerRoots();

      // LOADING HTML REMOVED (deterministic backbone)
      // SINGLE: start hidden unless default_visible (hash can still open later)
      // MULTI : start hidden (per-root will be shown on toggle)
      if (this._config && this._config.multi_mode === true) {
        this._hideContentLayer();
      } else {
        if (this._config && this._config.default_visible) {
          this._showContentLayer();
        } else {
          this._hideContentLayer();
        }
      }

  
      try {
        // Menü her durumda kurulsun (menu sabit)
        this._ensureLayerRoots();

        // NEW: If embedders[] exists, this single card manages multiple popups
        const hasList = this._hasEmbeddersList();

        // menu_only legacy: only menu + hash (NO content) if there is no embedders list
        if (this._config.menu_only && !hasList) {
          this._setupHashControl();
          this._hideContentLayer();
          this._loaded = true;
          this._log('🎛️ Overlay Pro Card: menu_only mode active (legacy - no embedded content)');
          return;
        }

        // HASH CONTROL (works for both legacy and list)
        this._setupHashControl();

        if (hasList) {
          // If any embedder has default_visible: true, open it without forcing hash
          const defId = this._getDefaultVisibleEmbedderId();
          if (defId) {
            await this._openEmbedderById(defId, { fromHash: false });
            this._showContentLayer();
          } else {
            this._hideContentLayer();
          }
          this._loaded = true;
          return;
        }

        // Legacy single-embed behavior
        const cardConfig = await this._findCardByEmbedId(this._config.dashboard, this._config.embed_id, this._config.show_title);
        await this._createCardContent(cardConfig, this._contentRoot);

        // default visibility now only affects CONTENT layer (menu stays visible)
        if (this._config.default_visible) {
          this._showContentLayer();
        } else {
          this._hideContentLayer();
        }
        
      } catch (error) {
        // ERROR always visible in UI (even if overlay_log off)
        // ALSO: preserve log flow (overlay_log + console.error)
        this._warn('❌ Overlay Pro Card: _loadCard() failed (UI error shown).', error);
        this._error('❌ Overlay Pro Card: _loadCard() failed.', error);

        this._ensureLayerRoots();
        this._showContentLayer();
        this._renderError(this._contentRoot, error, this._getActiveEmbedderSettings());
      }
    }
    // --------------------------------------------------------------------------
    // SETTING: EMBEDDERS_LIST (Etap.1)
    // Controls: single card contains multiple embedder definitions (Floor3D style)
    // - menu.buttons[].target -> embedders[].embed_id
    // - dashboard is per-embedder (global dashboard optional)
    // --------------------------------------------------------------------------

    _hasEmbeddersList() {
      return !!(this._config && Array.isArray(this._config.embedders) && this._config.embedders.length > 0);
    }

    _getEmbedderDef(embedId) {
      if (!this._hasEmbeddersList()) return null;
      const id = String(embedId || '').padStart(3, '0');
      return this._config.embedders.find(e => String(e.embed_id) === id) || null;
    }

    _getActiveEmbedderSettings(embedIdOverride = null) {
      // Legacy mode (single embed_id)
      if (!this._hasEmbeddersList()) {
        return {
          embed_id: this._config.embed_id,
          dashboard: this._config.dashboard,
          embedder_title: this._config.embedder_title || '',
          show_close: !!this._config.show_close,
          show_title: (this._config.show_title !== false),
          default_visible: !!this._config.default_visible,
          enable_scroll: (this._config.enable_scroll !== false),
          content: this._config.content
        };
      }

      const id = String(embedIdOverride || this._activeEmbedId || '').padStart(3, '0');
      const def = this._getEmbedderDef(id);

      if (!def) return null;

      return {
        embed_id: def.embed_id,
        dashboard: def.dashboard,
        embedder_title: def.embedder_title || '',
        show_close: (def.show_close === true),
        show_title: (def.show_title !== false),
        default_visible: (def.default_visible === true),
        enable_scroll: (def.enable_scroll !== false),
        content: def.content
      };
    }

    _getDefaultVisibleEmbedderId() {
      if (!this._hasEmbeddersList()) return null;
      const d = this._config.embedders.find(e => e && e.default_visible === true);
      return d ? String(d.embed_id) : null;
    }

    async _openEmbedderById(embedId, { fromHash = false, targetRoot = null, multi = false } = {}) {
      const active = this._getActiveEmbedderSettings(embedId);
      if (!active) {
        this._warn(`⚠️ Overlay Pro Card: embedder not defined for ${embedId}`);

        this._ensureLayerRoots();

        const root = (multi === true)
          ? (targetRoot || this._getOrCreateContentRootFor(String(embedId || '').padStart(3, '0')))
          : this._contentRoot;

        if (root) {
          this._showContentLayer(root);
          this._renderError(root, new Error(`Embedder not defined for ${String(embedId || '').padStart(3, '0')}`), null);
        }

        return;
      }

      // Remember active
      this._activeEmbedId = String(active.embed_id).padStart(3, '0');

      // Ensure layers exist
      this._ensureLayerRoots();

      // Apply positioning for this embedder
      const root = (multi === true)
        ? (targetRoot || this._getOrCreateContentRootFor(active.embed_id))
        : this._contentRoot;

      if (!root) return;

      this._applyContentPositioning(active, root);
      this._showContentLayer(root);

      // LOADING HTML REMOVED (deterministic backbone)
      try {
        const cardConfig = await this._findCardByEmbedId(active.dashboard, active.embed_id, active.show_title);
        await this._createCardContent(cardConfig, root, { multi: !!multi, embedId: String(active.embed_id).padStart(3, '0') });
      } catch (err) {
        // Deterministic ERROR UI (both multi & single)
        // - Multi: do NOT throw
        // - Single: also show error UI in the same target root (content layer),
        //           so user always sees the failure even if logs are off.

        // Preserve log flow (overlay_log + console.error)
        const eid = (active && active.embed_id) ? String(active.embed_id).padStart(3, '0') : String(embedId || '').padStart(3, '0');
        this._warn(`❌ Overlay Pro Card: open failed for embed_id:${eid} (UI error shown).`, err);
        this._error(`❌ Overlay Pro Card: open failed for embed_id:${eid}.`, err);

        this._showContentLayer(root);
        this._renderError(root, err, active);
        return;
      }

      // Multi-embed coordination (other instances)
      if (!multi) {
        this._closeOtherEmbedders();
      }

      // If opened not by hash (default_visible), do NOT force hash
      if (!fromHash) {
        // keep hash unchanged
      }
    }
  
    // --------------------------------------------------------------------------
    // HASH CONTROL FUNCTIONS - YENİ EKLENDİ (BUTON KONTROLÜ)
    // --------------------------------------------------------------------------
    // --------------------------------------------------------------------------
    // SETTING: HASH_CONTROL
    // Controls: #embed_001 open/close logic and multi-embed coordination
    // --------------------------------------------------------------------------

    _setupHashControl() {
      // MULTI: hash ON (tek omurga = hash)

      const mode = this._getPortalMode();

      // Ensure roots/gate are initialized
      this._registerGateInstance();
      this._electOwnerIfNeeded();

      // GLOBAL: single hash listener, handled by current owner only
      if (mode !== 'local') {
        const gate = this._getGate();

        if (!gate.hashListener) {
          gate.hashListener = () => {
            try {
              // Owner may change; always re-elect
              const owner = this._electOwnerIfNeeded();
              if (owner && typeof owner._checkHash === 'function') {
                owner._checkHash();
              }
            } catch (e) {}
          };
          window.addEventListener('hashchange', gate.hashListener);
        }

        // Non-owner should not run initial checks (prevents duplicate opens/logs)
        if (!this._isGateOwner()) return;

        if (this._hashControlInitDone) return;
        this._hashControlInitDone = true;

        setTimeout(() => this._checkHash(), 100);
        return;
      }

      // LOCAL: per-instance listener (original behavior)
      if (!this._boundHashChanged) {
        this._boundHashChanged = () => this._checkHash();
        window.addEventListener('hashchange', this._boundHashChanged);
      }

      if (this._hashControlInitDone) return;
      this._hashControlInitDone = true;

      setTimeout(() => this._checkHash(), 100);
    }
    
    _checkHash() {
      // MULTI: hash ON (state hash ile senkron)

      const mode = this._getPortalMode();

      // GLOBAL: only OWNER reacts to hash (prevents 2-3x log sets)
      if (mode !== 'local' && !this._isGateOwner()) return;

      const hash = window.location.hash; // Örnek: #embed_001
      if (this._config) {
        // ENGINE PATCH: BACKBONE_UNIFY_V1
        // Use Set/List reconciliation backbone for BOTH modes.
        // - multi_mode:true  => allow multiple ids
        // - multi_mode:false => capacity=1 (normalize to single hash)
        this._ensureLayerRoots();

        const hasList = (typeof this._hasEmbeddersList === 'function') ? this._hasEmbeddersList() : false;

        // menu_only legacy: do not open content
        if (this._config.menu_only === true && !hasList) {
          this._hideContentLayer();
          return;
        }

        // Latch: if we rewrote the hash to single form, clear when reached
        if (this._pendingSingleRewrite && hash === this._pendingSingleRewrite) {
          this._pendingSingleRewrite = null;
        }

        // Accept both "#embed_001" and "#embed_001,003"
        let wantRaw = this._parseMultiHash();

        // Legacy single-embed: only honor our own embed_id
        if (!hasList) {
          const myId = (this._config && this._config.embed_id != null) ? String(this._config.embed_id).padStart(3, '0') : '';
          wantRaw = wantRaw.filter(x => x === myId);
        }

        const capacityOne = !(this._config && this._config.multi_mode === true);

        // In capacity-1 mode, normalize multi hash to single hash (keep last id deterministically)
        if (capacityOne && wantRaw.length > 1) {
          const keep = wantRaw[wantRaw.length - 1];
          const singleHash = `#embed_${keep}`;
          if (hash !== singleHash && this._pendingSingleRewrite !== singleHash) {
            this._pendingSingleRewrite = singleHash;
            window.location.hash = singleHash;
            return;
          }
          wantRaw = [keep];
        }

        const want = wantRaw;
        const wantSet = new Set(want);

        if (!this._openSet) this._openSet = new Set();

        // CLOSE: open but not in hash
        for (const openId of Array.from(this._openSet)) {
          if (!wantSet.has(openId)) {
            if (hasList) {
              const r = this._contentRoots && this._contentRoots.get(openId);
              if (r) this._hideContentLayer(r); // CLICK-BLOCK SAFE
            } else {
              this._hideContentLayer();
            }
            this._openSet.delete(openId);
          }
        }

        // OPEN: in hash but not open
        for (const id of want) {
          if (this._openSet.has(id)) {
            if (hasList) {
              const r = this._contentRoots && this._contentRoots.get(id);
              if (r) this._showContentLayer(r);
            } else {
              this._showContentLayer();
            }
            continue;
          }

          if (hasList) {
            const root = this._getOrCreateContentRootFor(id);
            if (!root) continue;

            this._openSet.add(id);
            this._showContentLayer(root);
            this._openEmbedderById(id, {
              fromHash: true,
              targetRoot: root,
              multi: true
            });
          } else {
            // Legacy single: use the existing content root
            this._openSet.add(id);
            this._showContentLayer();
            this._openEmbedderById(id, { fromHash: true });
          }
        }

        return;
      }

      // Ensure roots exist (owner creates/renders in global)
      if (!this._menuRoot || !this._contentRoot || !this._portalRoot) {
        this._ensureLayerRoots();
      }

      const hasList = this._hasEmbeddersList();

      // Parse hash pattern
      const m = /^#embed_(\d{3})$/.exec(hash || '');
      const hashId = m ? m[1] : null;

      // Helper: visible check (idempotency)
      const isContentVisible = () => {
        try {
          if (!this._contentRoot) return false;
          const d = this._contentRoot.style.display;
          return d && d !== 'none';
        } catch (e) { return false; }
      };

      // If we have embedders list => open matching embedder from list
      if (hasList) {
        if (hashId && this._getEmbedderDef(hashId)) {
          // Idempotent: same active + already visible => do nothing (no blink, no duplicate logs)
          if (this._activeEmbedId === hashId && isContentVisible()) return;

          // DETERMINISTIC GUARD:
          // _checkHash can be triggered twice (hashchange + portalActive/view flows).
          // Prevent starting the same open flow twice.
          if (this._pendingHashOpenId === hashId) {
            return;
          }
          this._pendingHashOpenId = hashId;

          this._log(`✅ Overlay Pro Card: Hash matched (list)! Opening embedder ${hashId}`);

          try {
            const p = this._openEmbedderById(hashId, { fromHash: true });
            if (p && typeof p.finally === 'function') {
              p.finally(() => {
                if (this._pendingHashOpenId === hashId) {
                  this._pendingHashOpenId = null;
                }
              });
            } else {
              // If not a promise, clear immediately
              if (this._pendingHashOpenId === hashId) {
                this._pendingHashOpenId = null;
              }
            }
          } catch (e) {
            if (this._pendingHashOpenId === hashId) {
              this._pendingHashOpenId = null;
            }
          }
        } else {
          this._pendingHashOpenId = null;
          this._activeEmbedId = null;
          this._hideContentLayer();
        }
        return;
      }

      // Legacy single-embed behavior
      if (this._config.menu_only) {
        this._hideContentLayer();
        return;
      }

      const myHash = `#embed_${this._config.embed_id}`; // #embed_001
      this._log(`🔗 Overlay Pro Card: Hash check - Current: "${hash}", My hash: "${myHash}"`);

      if (hash === myHash) {
        // Idempotent: already visible => no duplicate logs/flash
        if (isContentVisible()) return;

        this._log(`✅ Overlay Pro Card: Hash matched! Opening embedder ${this._config.embed_id}`);
        this._showContentLayer();
        this._closeOtherEmbedders();
      } else {
        this._hideContentLayer();
      }
    }
    
    _closeOtherEmbedders() {
      // Aynı view'deki diğer embedder'ları bul
      const view = this.closest('hui-view');
      if (!view) {
        this._log('⚠️ Overlay Pro Card: No view found for closing others');
        return;
      }
      
      const embedders = view.querySelectorAll('overlaypro-card');
      let closedCount = 0;
      
      embedders.forEach(embedder => {
        if (embedder !== this && embedder._config) {
          // Menu sabit kalsın, sadece content kapansın
          if (typeof embedder._hideContentLayer === 'function') {
            embedder._hideContentLayer();
          } else {
            embedder.style.display = 'none';
          }
          closedCount++;
        }
      });
      
      this._log(`📌 Overlay Pro Card: Closed ${closedCount} other embedder(s)`);
    }
  
    // --------------------------------------------------------------------------
    // Card Discovery Function - search algorithm
    // --------------------------------------------------------------------------
    async _findCardByEmbedId(dashboard, targetId, showTitle = true) {
      this._log(`🔍 Overlay Pro Card: Searching for card #${targetId} in '${dashboard}'`);
      
      try {
        // Fetch dashboard configuration
        const lovelaceConfig = await this._hass.connection.sendMessagePromise({
          type: 'lovelace/config',
          url_path: dashboard === 'lovelace' ? null : dashboard
        });
  
        // Search through all views
        const searchResult = this._searchCardInViews(lovelaceConfig.views, targetId);
        
        if (!searchResult.found) {
          throw new Error(`Card with embed ID #${targetId} not found in dashboard '${dashboard}'`);
        }
  
        if (searchResult.duplicate) {
          this._warn(`⚠️ Overlay Pro Card: Duplicate embed ID #${targetId} found! Using first occurrence.`);
        }
  
        this._log(`✅ Overlay Pro Card: Successfully located card #${targetId} in ${dashboard}`);
        
        // Kaynak kartın title'ını gizle (show_title: false ise)
        if (showTitle === false && searchResult.card.title) {
          delete searchResult.card.title;
        }
        
        return searchResult.card;
        
      } catch (err) {
        if (err.message.includes('Not found')) {
          throw new Error(`Dashboard '${dashboard}' not found or inaccessible`);
        }
        throw new Error(`Search error: ${err.message}`);
      }
    }
  
    // --------------------------------------------------------------------------
    // Recursive Card Search -pattern matching algorithm
    // --------------------------------------------------------------------------
    _searchCardInViews(views, targetId) {
      let foundCard = null;
      let duplicateFound = false;
      
      const searchRecursive = (cards, path = '') => {
        if (!cards) return;
        
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const cardPath = path ? `${path}/cards/${i}` : `view_${i}`;
          
          // Check icon property for EMBED#001 format
          if (card && typeof card === 'object') {
            if (card.icon && typeof card.icon === 'string') {
              const iconMatch = card.icon.match(/^EMBED#(\d{3})$/i);
              if (iconMatch && iconMatch[1] === targetId) {
                if (foundCard) {
                  duplicateFound = true;
                } else {
                  foundCard = card;
                  this._log(`   Found at path: ${cardPath} (via icon: ${card.icon})`);
                }
              }
            }
            
            // Recursive search for nested cards
            if (card.cards && Array.isArray(card.cards)) {
              searchRecursive(card.cards, `${cardPath}/cards`);
            }
            
            // Support for vertical/horizontal stacks
            if (card.type && card.type.includes('stack') && card.cards) {
              searchRecursive(card.cards, `${cardPath}/stack`);
            }
          }
        }
      };
      
      // Process all views
      views.forEach((view, viewIndex) => {
        if (view.cards) {
          searchRecursive(view.cards, `view_${viewIndex}`);
        }
      });
      
      return {
        found: !!foundCard,
        card: foundCard,
        duplicate: duplicateFound
      };
    }
  
    // --------------------------------------------------------------------------
    // Card Content Creation - optimized rendering
    // --------------------------------------------------------------------------
    async _createCardContent(cardConfig, rootEl = null, meta = null) {
      const helpers = await window.loadCardHelpers();
      
      // Create card element
      const cardConfigCopy = JSON.parse(JSON.stringify(cardConfig));
      this._contentElement = await helpers.createCardElement(cardConfigCopy);
      this._contentElement.hass = this._hass;
      
      // Ensure roots exist (menu must remain)
      this._ensureLayerRoots();

      // Clean content layer only (menu stays)
      const targetRoot = rootEl || this._contentRoot;
      if (!targetRoot) return;
      targetRoot.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'overlaypro-card-container';
      container.style.padding = '0';
      container.style.margin = '0';
      container.style.height = '100%';
      
      // Card wrapper - HA ORJINAL HEADER YAPISI
      const cardWrapper = document.createElement('ha-card');
      cardWrapper.style.display = 'flex';
      cardWrapper.style.flexDirection = 'column';
      cardWrapper.style.height = '100%';
      cardWrapper.style.width = '100%';
      cardWrapper.style.padding = '0';
      cardWrapper.style.margin = '0';
      cardWrapper.style.borderRadius = '0';
      cardWrapper.style.background = 'none';
      cardWrapper.style.boxShadow = 'none';
      
      const embedId = (meta && meta.embedId) ? String(meta.embedId).padStart(3, '0') : null;
      const active = embedId ? this._getActiveEmbedderSettings(embedId) : this._getActiveEmbedderSettings();
      // HA Header - Sadece embedder_title veya show_close varsa
      if ((active && active.embedder_title) || (active && active.show_close)) {
        const header = document.createElement('div');
        header.className = 'card-header';
        header.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          min-height: 48px;
        `;
        
        // Sol taraf: embedder_title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'name';
        titleDiv.textContent = (active && active.embedder_title) ? active.embedder_title : '';
        titleDiv.style.cssText = `
          font-size: 16px;
          font-weight: 500;
          color: var(--primary-text-color);
          flex: 1;
        `;
        header.appendChild(titleDiv);
        
        // Sağ taraf: X butonu (show_close: true ise)
        if (active && active.show_close) {
          const closeButton = document.createElement('button');
          closeButton.innerHTML = '×';
          closeButton.className = 'close-button';
          closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--secondary-text-color);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.3s;
            margin: 0;
          `;
          
          // Hover efekti
          closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = 'var(--divider-color, #e0e0e0)';
          });
          
          closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'transparent';
          });
          
          // Kapatma fonksiyonu
          closeButton.addEventListener('click', () => {
            const isMulti = !!(this._config && this._config.multi_mode === true);
            const id = (active && active.embed_id) ? String(active.embed_id).padStart(3, '0') : null;

            if (isMulti) {
              const current = this._parseMultiHash();
              const next = current.filter(x => x !== id);
              this._writeMultiHash(next);
              return;
            }

            // single: legacy
            this._hideContentLayer();
            this._clearHash();
            this._log(`❌ Overlay Pro Card: Closed via X button - embed_id: ${(active && active.embed_id) ? active.embed_id : '???'}`);
          });
          
          header.appendChild(closeButton);
        }
        
        cardWrapper.appendChild(header);
      }
         // ------------------------------------------------------------------------
      // SETTING: SCROLL_BEHAVIOR
      // Controls: enable_scroll and overflow handling inside embedded content
      // ------------------------------------------------------------------------
   
      // Content area - minimum yükseklik
      const cardContent = document.createElement('div');
      cardContent.className = 'card-content';
      cardContent.style.cssText = `
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 0;
        overflow: ${(active && active.enable_scroll === false) ? 'visible' : 'auto'};
      `;
      // ------------------------------------------------------------------------
      // SETTING: EMBED_FULL_HEIGHT_FIX
      // Removes bottom empty space inside embedded card container
      // ------------------------------------------------------------------------

      // FIX: Embedded card full-height (removes bottom empty space) WITHOUT breaking scroll
      // Scroll stays on cardContent (overflow:auto). We only make embedded card a proper flex child.
      if (this._contentElement) {
        this._contentElement.style.display = 'flex';
        this._contentElement.style.flexDirection = 'column';
        this._contentElement.style.flex = '1';
        this._contentElement.style.height = '100%';
        this._contentElement.style.minHeight = '0';
        this._contentElement.style.margin = '0';
        this._contentElement.style.padding = '0';
      }
      
      // Assemble the card
      cardContent.appendChild(this._contentElement);
      cardWrapper.appendChild(cardContent);
      container.appendChild(cardWrapper);
      targetRoot.appendChild(container);
      
      // Finalization
      this._loaded = true;
      // ------------------------------------------------------------------------
      // SETTING: DEBUG_LOGGING
      // Controls: console.log verbosity for development
      // ------------------------------------------------------------------------
      
      const dbg = this._getActiveEmbedderSettings();
      const dbgId = (dbg && dbg.embed_id) ? dbg.embed_id : (this._config ? this._config.embed_id : '???');
      const dbgDash = (dbg && dbg.dashboard) ? dbg.dashboard : (this._config ? this._config.dashboard : '???');

      this._log(`🎉 Overlay Pro Card successfully embedded card #${dbgId}`);
      this._log(`   Dashboard: ${dbgDash}`);
      this._log(`   Embedder Title: "${(dbg && dbg.embedder_title) ? dbg.embedder_title : ''}"`);
      this._log(`   Show Close: ${!!(dbg && dbg.show_close)}`);
      this._log(`   Show Title: ${(dbg ? (dbg.show_title !== false) : (this._config && this._config.show_title !== false))}`);
      this._log(`   Default Visible (CONTENT): ${!!(dbg && dbg.default_visible)}`);
      this._log(`   Menu Enabled: ${!!(this._config && this._config.menu && this._config.menu.enabled)}`);
      this._log(`   Hash Control: ACTIVE (use #embed_${dbgId})`);
    }
  
    // --------------------------------------------------------------------------
    // Card Size Helper - optimized sizing
    // --------------------------------------------------------------------------
    getCardSize() {
      return this._config.card_size || 1;
    }
    
    // --------------------------------------------------------------------------
    // Public methods for external control
    // --------------------------------------------------------------------------
    show() {
      this._ensureLayerRoots();
      this._showContentLayer();
    }
    
    hide() {
      this._ensureLayerRoots();
      this._hideContentLayer();
      if (typeof this._clearHash === 'function') {
        this._clearHash();
      }
    }

    // --------------------------------------------------------------------------
    // Lifecycle: Cleanup (FIXED - was broken by copy/paste)
    // --------------------------------------------------------------------------
    disconnectedCallback() {
      this._teardownViewVisibilityGuard();

      const mode = this._getPortalMode();

      // LOCAL: cleanup per-instance (original)
      if (mode === 'local') {
        try {
          if (this._boundHashChanged) {
            window.removeEventListener('hashchange', this._boundHashChanged);
            this._boundHashChanged = null;
          }
          this._hashControlInitDone = false;
        } catch (e) {}

        try {
          if (this._menuRoot && this._menuRoot.parentNode) {
            this._menuRoot.parentNode.removeChild(this._menuRoot);
          }
          if (this._contentRoot && this._contentRoot.parentNode) {
            this._contentRoot.parentNode.removeChild(this._contentRoot);
          }
          if (this._portalRoot && this._portalRoot.parentNode) {
            this._portalRoot.parentNode.removeChild(this._portalRoot);
          }
        } catch (e) {}

        this._portalRoot = null;
        this._menuRoot = null;
        this._contentRoot = null;
        return;
      }

      // GLOBAL: shared roots + shared hash listener (cleanup only when refCount hits 0)
      try {
        this._unregisterGateInstance();
        const gate = this._getGate();
        this._hashControlInitDone = false;

        if (gate.refCount === 0) {
          // remove global hash listener
          try {
            if (gate.hashListener) {
              window.removeEventListener('hashchange', gate.hashListener);
              gate.hashListener = null;
            }
          } catch (e) {}

          // remove shared roots
          try {
            if (gate.roots) {
              const { menuRoot, contentRoot, portalRoot } = gate.roots;

              if (menuRoot && menuRoot.parentNode) menuRoot.parentNode.removeChild(menuRoot);
              if (contentRoot && contentRoot.parentNode) contentRoot.parentNode.removeChild(contentRoot);
              if (portalRoot && portalRoot.parentNode) portalRoot.parentNode.removeChild(portalRoot);
            }
          } catch (e) {}

          gate.roots = null;
          gate.owner = null;
        }
      } catch (e) {}

      // Detach references (do not remove DOM unless refCount==0)
      this._portalRoot = null;
      this._menuRoot = null;
      this._contentRoot = null;
    }
    
    toggle() {
      this._ensureLayerRoots();
      const isHidden = !this._contentRoot || this._contentRoot.style.display === 'none';
      if (isHidden) {
        this._showContentLayer();
      } else {
        this._hideContentLayer();
        if (typeof this._clearHash === 'function') {
          this._clearHash();
        }
      }
    }
  }

// ============================================================================
// Overlay Pro Card - Startup Banner (ALWAYS VISIBLE)
// ============================================================================

const overlayTitle = '  OVERLAY[PRO]-CARD ';
const overlayVersion = '  Version Faz.2    ';

// Longest line width
const overlayWidth = Math.max(overlayTitle.length, overlayVersion.length);

console.info(
  `%c${overlayTitle.padEnd(overlayWidth)}\n%c${overlayVersion.padEnd(overlayWidth)}`,
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);
 
  // ============================================================================
  // Custom Element Registration - SIMPLE & COMPATIBLE
  // ============================================================================
  if (!customElements.get('overlaypro-card')) {
    customElements.define('overlaypro-card', overlayprocard);
    
    // Lovelace editor integration
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: 'overlaypro-card',
      name: 'Overlay Pro Card',
      preview: true,
      description: 'Engine Powering Overlay Popup UI Layers',
    });
  }
  
  // ============================================================================
  // Helper Functions (Optional - for future enhancements)
  // ============================================================================
  window.embedderHelpers = window.embedderHelpers || {
    // Find unused embed IDs
    findUnusedId: async function(hass, dashboard = 'lovelace') {
      if (window.__OVERLAY_PRO_LOG) console.log('Overlay Pro Card: Analyzing available embed IDs...');
      
      try {
        const config = await hass.connection.sendMessagePromise({
          type: 'lovelace/config',
          url_path: dashboard === 'lovelace' ? null : dashboard
        });
        
        const usedIds = new Set();
        const iconPattern = /^EMBED#(\d{3})$/i;
        
        const collectIds = (cards) => {
          if (!cards) return;
          
          cards.forEach(card => {
            if (card && typeof card === 'object') {
              if (card.icon) {
                const match = iconPattern.exec(card.icon);
                if (match && match[1]) usedIds.add(match[1]);
              }
              
              if (card.cards) {
                collectIds(card.cards);
              }
            }
          });
        };
        
        config.views.forEach(view => collectIds(view.cards));
        
        // Find first unused ID
        for (let i = 1; i <= 999; i++) {
          const id = i.toString().padStart(3, '0');
          if (!usedIds.has(id)) {
            if (window.__OVERLAY_PRO_LOG) console.log(`✅ Available embed ID: ${id}`);
            return id;
          }
        }
        
        if (window.__OVERLAY_PRO_LOG) console.warn('⚠️ All embed IDs (001-999) are in use!');
        return null;
        
      } catch (error) {
        console.error('ID search failed:', error);
        return '001';
      }
    },
    
    // Validate embed ID format
    validateEmbedId: function(id) {
      const regex = /^\d{3}$/;
      if (!regex.test(id)) {
        throw new Error('embed_id must be 3 digits (001-999)');
      }
      
      const num = parseInt(id, 10);
      if (num < 1 || num > 999) {
        throw new Error('embed_id must be between 001 and 999');
      }
      
      return true;
    }
  };
