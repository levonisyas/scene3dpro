(async () => {
  const loadOnce = (url) => new Promise((resolve, reject) => {
    const existing = [...document.querySelectorAll("script")].find(s => (s.src || "").includes(url));
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = url;
    s.type = "module";
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });

  await loadOnce("/api/scene3dpro/floor3dpro-card.js");
  await loadOnce("/api/scene3dpro/overlaypro-card.js");

  class Scene3DProPanel extends HTMLElement {
    set hass(hass) {
      this._hass = hass;
      if (!this._inited) this._init();
      this._syncHass();
    }
    connectedCallback() {
      if (!this._inited) this._init();
    }
    _init() {
      this._inited = true;
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <style>
          :host { display:block; height: 100vh; width: 100vw; }
          .root { position: relative; height: 100%; width: 100%; overflow: hidden; }
          .layer { position: absolute; inset: 0; }
          .base { z-index: 0; }
          .top { z-index: 1; pointer-events: none; }
          .top > * { pointer-events: auto; }
        </style>
        <div class="root">
          <div class="layer base"></div>
          <div class="layer top"></div>
        </div>
      `;
      this._base = this.shadowRoot.querySelector(".base");
      this._top = this.shadowRoot.querySelector(".top");
      this._render();
    }
    _render() {
      this._base.innerHTML = "";
      this._top.innerHTML = "";

      this._floor = document.createElement("floor3dpro-card");
      this._floor.setConfig?.({ type: "custom:floor3dpro-card" });
      this._base.appendChild(this._floor);

      this._overlay = document.createElement("overlaypro-card");
      this._overlay.setConfig?.({ type: "custom:overlaypro-card", portal_mode: "local" });
      this._top.appendChild(this._overlay);

      this._syncHass();
    }
    _syncHass() {
      if (!this._hass) return;
      if (this._floor) this._floor.hass = this._hass;
      if (this._overlay) this._overlay.hass = this._hass;
    }
  }

  if (!customElements.get("scene3dpro-panel")) {
    customElements.define("scene3dpro-panel", Scene3DProPanel);
  }

  class HaPanelScene3DPro extends HTMLElement {
    set hass(hass) {
      if (!this._el) {
        this._el = document.createElement("scene3dpro-panel");
        this.appendChild(this._el);
      }
      this._el.hass = hass;
    }
  }
  if (!customElements.get("ha-panel-scene3dpro")) {
    customElements.define("ha-panel-scene3dpro", HaPanelScene3DPro);
  }
})();
