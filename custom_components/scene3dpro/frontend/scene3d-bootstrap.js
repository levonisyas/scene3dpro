const TAG = "scene3d-bootstrap";
const log = (...a) => console.log("pro.[scene3d]", ...a);

if (!customElements.get(TAG)) {

  class Scene3DBootstrap extends HTMLElement {

    connectedCallback() {
      this.check();
    }

    check() {
      log("Checking dependencies...");

      const hasFloor = customElements.get("floor3d-pro");
      const hasOverlay = customElements.get("overlaypro-card");

      log("Floor3D:", hasFloor ? "FOUND" : "NOT FOUND");
      log("OverlayPro:", hasOverlay ? "FOUND" : "NOT FOUND");

      if (hasFloor && hasOverlay) {
        log("All dependencies found. Rendering Scene3D.");

        this.innerHTML = `
          <floor3d-pro></floor3d-pro>
          <overlaypro-card></overlaypro-card>
        `;
        return;
      }

      this.innerHTML = `
        <div style="padding:32px;text-align:center;">
          <h2>Scene3D Dependency Check</h2>

          <p>Floor3D Pro ... ${hasFloor ? "Found ✓" : "Not Found ✗"}</p>
          ${!hasFloor ? `
            <a href="/hacs/store/levonisyas_floor3d-pro" target="_blank">
              <button>Install Floor3D Pro</button>
            </a>
          ` : ""}

          <p style="margin-top:20px;">
            OverlayPro Card ... ${hasOverlay ? "Found ✓" : "Not Found ✗"}
          </p>
          ${!hasOverlay ? `
            <a href="/hacs/store/levonisyas_overlaypro-card" target="_blank">
              <button>Install OverlayPro Card</button>
            </a>
          ` : ""}
        </div>
      `;
    }
  }

  customElements.define(TAG, Scene3DBootstrap);
}
