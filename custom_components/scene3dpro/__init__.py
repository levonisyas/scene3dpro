from __future__ import annotations

import os

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig

from .const import (
    DOMAIN,
    FRONTEND_URL_PATH,
    PANEL_URL,
    PANEL_COMPONENT,
    SIDEBAR_ICON,
    SIDEBAR_TITLE,
    PANEL_TITLE,
)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Scene3DPro from a config entry."""
    await _async_register_panel(hass)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload config entry."""
    # Panel kaldırma zorunlu değil; HA restart ile temiz.
    return True

async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel (only once)."""
    # Aynı paneli iki kez eklemeyelim
    if DOMAIN in hass.data.get("frontend_panels", {}):
        return

    # /custom_components/scene3dpro/frontend klasörünü statik path olarak yayınla
    panel_path = os.path.join(os.path.dirname(__file__), "frontend")

    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_URL, panel_path, cache_headers=False)]
    )

    # Paneli sidebar’a ekle
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_COMPONENT,           # JS tarafındaki customElements.define()
        frontend_url_path=FRONTEND_URL_PATH,         # /scene3dpro
        sidebar_title=SIDEBAR_TITLE,                # "3D"
        sidebar_icon=SIDEBAR_ICON,
        module_url=f"{PANEL_URL}/scene3dpro.js",     # statik path'ten gelecek
        config={"title": PANEL_TITLE},              # panel props
        require_admin=False,
    )
