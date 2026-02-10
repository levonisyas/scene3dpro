"""Scene3D Pro - sidebar custom panel that composes Floor3DPro + OverlayPro."""
from __future__ import annotations

import os
import logging

from homeassistant.core import HomeAssistant
from homeassistant.components.http import StaticPathConfig

from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_NAME,
    PANEL_TITLE,
    PANEL_URL_PATH,
)

_LOGGER = logging.getLogger(__name__)

PANEL_STATIC_URL = f"/{DOMAIN}_panel"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up Scene3D Pro."""

    # Avoid duplicate registration on reload
    if DOMAIN in hass.data.get("frontend_panels", {}):
        return True

    # 1) Serve our frontend modules from the integration directory
    panel_path = os.path.join(os.path.dirname(__file__), "frontend")
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_STATIC_URL, panel_path, cache_headers=False)]
    )

    # 2) Register the sidebar panel
    from homeassistant.components import panel_custom

    try:
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name=PANEL_NAME,                 # must match customElements.define()
            frontend_url_path=PANEL_URL_PATH,             # /3d
            sidebar_title=PANEL_TITLE,                    # 3D
            sidebar_icon=PANEL_ICON,                      # mdi:cube
            module_url=f"{PANEL_STATIC_URL}/scene3dpro.js",
            embed_iframe=False,
            require_admin=False,
            config={"title": "3D Scene Pro"},
        )
        _LOGGER.info("Registered Scene3D Pro panel at /%s", PANEL_URL_PATH)
    except ValueError:
        _LOGGER.debug("Scene3D Pro panel already registered")
    return True
