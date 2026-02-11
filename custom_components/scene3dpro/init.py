from homeassistant.components.lovelace.resources import async_add_resource
from .dashboard import async_setup_dashboards
from .sidebar import async_setup_sidebar

async def async_setup(hass, config):

    hass.logger.info("pro.[scene3d] initializing")

    await async_add_resource(
        hass,
        "/scene3d_pro/scene3d-bootstrap.js",
        "module"
    )

    await async_setup_dashboards(hass)
    await async_setup_sidebar(hass)

    hass.logger.info("pro.[scene3d] ready")

    return True
