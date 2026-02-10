// Scene3D Pro Panel Host
// - Loads Floor3DPro (Layer 1) + OverlayPro (Layer 2)
// - Ensures click-through overlay behavior (3D stays active; overlay UI areas handle clicks)
//
// This file is loaded by panel_custom as a webcomponent module.

const BASE_URL = "/scene3dpro_panel";

async function ensureModule(url) {
  try {
    await import(url);
  } catch (e) {
    console.error("[scene3dpro] Failed to import", url, e);
  }
}

async function ensureDependencies() {
  if (!customElements.get("floor3dpro-card")) {
    await ensureModule(`${BASE_URL}/floor3dpro-card.js`);
  }
  if (!customElements.get("overlaypro-card")) {
    await ensureModule(`${BASE_URL}/overlaypro-card.js`);
  }
}

class Scene3DProPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._panel = null;
    this._ready = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._ready) this._applyHass();
  }

  set panel(panel) {
    this._panel = panel;
    if (this._ready) this._applyPanel();
  }

  async connectedCallback() {
    await ensureDependencies();
    this._render();
    this._ready = true;
    this._applyHass();
    this._applyPanel();
  }

  _applyHass() {
    const root = this.shadowRoot;
    const floor = root?.getElementById("floor");
    const overlay = root?.getElementById("overlay");
    if (floor) floor.hass = this._hass;
    if (overlay) overlay.hass = this._hass;
  }

  _applyPanel() {
    // In the future, you can load/save scene config here.
    // For now, we keep defaults and rely on the cards' own config UIs.
  }

  _render() {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host { display:block; height:100vh; width:100%; }
        .scene-root { position: relative; height: 100%; width: 100%; overflow: hidden; background: var(--primary-background-color); }
        .layer { position: absolute; inset: 0; }
        /* Floor is always interactive */
        .floor-layer { z-index: 0; pointer-events: auto; }
        /* Overlay container is glass (click-through). OverlayPro internally marks real UI as pointer-events:auto */
        .overlay-layer { z-index: 10; pointer-events: none; }
        .overlay-layer > * { pointer-events: none; }
      </style>
      <div class="scene-root">
        <div class="layer floor-layer">
          <floor3dpro-card id="floor"></floor3dpro-card>
        </div>
        <div class="layer overlay-layer">
          <overlaypro-card id="overlay"></overlaypro-card>
        </div>
      </div>
    `;

    // Default minimal configs (user will configure through your existing card editors later)
    const floor = root.getElementById("floor");
    const overlay = root.getElementById("overlay");

    // Don't override user configs if already set
    if (floor && !floor._scene3dpro_defaulted) {
      floor._scene3dpro_defaulted = true;
      try {
        floor.setConfig?.({ type: "custom:floor3dpro-card" });
      } catch (e) {
        // ignore
      }
    }

    if (overlay && !overlay._scene3dpro_defaulted) {
      overlay._scene3dpro_defaulted = true;
      try {
        overlay.setConfig?.({ type: "custom:overlaypro-card", portal_mode: "local" });
      } catch (e) {
        // ignore
      }
    }
  }
}

customElements.define("scene3dpro-panel", Scene3DProPanel);

// Expose for panel_custom: it uses the element tag name you register (name=scene3dpro-panel).
window.customPanels = window.customPanels || {};
window.customPanels["scene3dpro-panel"] = { name: "Scene3D Pro Panel" };

console.info(
  "%c Scene3D Pro %c loaded",
  "color: white; background: #0b7285; font-weight: 700; padding: 2px 6px; border-radius: 4px;",
  "color: #0b7285; background: transparent;"
);
