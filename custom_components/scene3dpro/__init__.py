from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import frontend

from .const import DOMAIN

PANEL_URL = "scene3dpro"
PANEL_TITLE = "3D Scene Pro"
SIDEBAR_TITLE = "3D"
ICON = "mdi:cube-scan"

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Serve frontend assets from this integration (no Lovelace resources needed)
    hass.http.register_static_path(
        "/api/scene3dpro/scene3dpro.js",
        hass.config.path("custom_components/scene3dpro/frontend/scene3dpro.js"),
        cache_headers=False,
    )
    hass.http.register_static_path(
        "/api/scene3dpro/overlaypro-card.js",
        hass.config.path("custom_components/scene3dpro/frontend/overlaypro-card.js"),
        cache_headers=False,
    )
    hass.http.register_static_path(
        "/api/scene3dpro/floor3dpro-card.js",
        hass.config.path("custom_components/scene3dpro/frontend/floor3dpro-card.js"),
        cache_headers=False,
    )

    # Register sidebar panel
    await frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=SIDEBAR_TITLE,
        sidebar_icon=ICON,
        frontend_url_path=PANEL_URL,
        config={
            "_panel_custom": {
                "name": "ha-panel-scene3dpro",
                "embed_iframe": False,
                "trust_external": False,
                "js_url": "/api/scene3dpro/scene3dpro.js",
            }
        },
        require_admin=False,
    )
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True
