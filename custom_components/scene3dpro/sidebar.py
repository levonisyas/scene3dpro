async def async_setup_sidebar(hass):
    hass.components.frontend.async_register_built_in_panel(
        component_name="lovelace",
        sidebar_title="3D",
        sidebar_icon="mdi:cube-scan",
        frontend_url_path="lovelace-scene3d",
        config={
            "mode": "yaml",
            "dashboard": "scene3d"
        },
        require_admin=False,
    )

    hass.logger.info("pro.[scene3d] sidebar added")
