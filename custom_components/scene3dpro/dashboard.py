from homeassistant.components.lovelace.const import DOMAIN as LOVELACE_DOMAIN

RUNTIME_DASHBOARD = {
    "id": "scene3d",
    "mode": "yaml",
    "title": "Scene3D",
    "icon": "mdi:cube-scan",
    "show_in_sidebar": False,
    "require_admin": False,
    "config": {
        "title": "Scene3D",
        "views": [
            {
                "title": "3D",
                "panel": True,
                "cards": [
                    {"type": "custom:scene3d-bootstrap"}
                ]
            }
        ]
    }
}

async def async_setup_dashboards(hass):
    dashboards = hass.data.setdefault(LOVELACE_DOMAIN, {}).setdefault("dashboards", {})
    dashboards["scene3d"] = RUNTIME_DASHBOARD
    hass.logger.info("pro.[scene3d] dashboard registered")
