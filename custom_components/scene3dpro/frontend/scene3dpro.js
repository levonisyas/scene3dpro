class Scene3DProPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) this._render();
  }

  set panel(panel) {
    this._panel = panel;
    // panel.config.title gibi şeyler burada
  }

  connectedCallback() {
    if (this._hass && !this._rendered) this._render();
  }

  _render() {
    this._rendered = true;
    this.style.display = "block";
    this.style.height = "100%";

    // Root
    const root = document.createElement("div");
    root.className = "scene3dpro-root";

    // Layer 1: Floor3DPro (active)
    const base = document.createElement("div");
    base.className = "layer layer-base";
    const floor = document.createElement("floor3dpro-card");
    // floor config: şimdilik boş; sonra senin config kaynağınla beslenecek
    floor.setConfig?.({}); 
    base.appendChild(floor);

    // Layer 2: OverlayPro (click-through except its own UI)
    const top = document.createElement("div");
    top.className = "layer layer-top";
    // Tüm üst katman cam gibi: tıklama almaz
    top.style.pointerEvents = "none";

    const overlay = document.createElement("overlaypro-card");
    // Overlay kendi içinde etkileşimli alanları pointer-events:auto yapacak şekilde zaten tasarlandı.
    // Local portal_mode: inline basın, dışarı taşmasın
    overlay.setConfig?.({ portal_mode: "local" });

    // Overlay kartın kendisi tıklama alabilsin (ama sadece kendi içindeki alanlar)
    overlay.style.pointerEvents = "auto";
    top.appendChild(overlay);

    // Style
    const style = document.createElement("style");
    style.textContent = `
      .scene3dpro-root{
        position: relative;
        height: 100vh;
        width: 100%;
        overflow: hidden;
        background: var(--primary-background-color);
      }
      .layer{
        position: absolute;
        inset: 0;
      }
      .layer-base{
        z-index: 0;
      }
      .layer-top{
        z-index: 10;
      }
    `;

    root.appendChild(style);
    root.appendChild(base);
    root.appendChild(top);

    this.innerHTML = "";
    this.appendChild(root);

    // hass propagate
    floor.hass = this._hass;
    overlay.hass = this._hass;
  }
}

customElements.define("scene3dpro-panel", Scene3DProPanel);
