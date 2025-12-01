import logging
import sys
import http
import torch
import intel_extension_for_pytorch as ipex
import diffusers

APP_LOGGER_NAME = "arttic_lab"
APP_VERSION = "3.1.0"


class ArtTicFilter(logging.Filter):
    def filter(self, record):
        return record.name == APP_LOGGER_NAME


class CustomFormatter(logging.Formatter):
    MINT_2 = "\x1b[38;2;82;183;136m"
    SEA_GREEN = "\x1b[38;2;64;145;108m"
    DARTMOUTH_GREEN = "\x1b[38;2;45;106;79m"
    BRUNSWICK_GREEN = "\x1b[38;2;27;67;50m"
    DARK_GREEN = "\x1b[38;2;8;28;21m"
    CELADON = "\x1b[38;2;183;228;199m"
    RED_BRIGHT = "\x1b[38;2;239;68;68m"
    ORANGE = "\x1b[38;2;249;115;22m"
    GREY = "\x1b[38;2;156;163;175m"
    RESET = "\x1b[0m"

    FORMATS = {
        logging.INFO: f"{MINT_2}[ArtTic-LAB] >{RESET} %(message)s",
        logging.WARNING: f"{ORANGE}[ArtTic-LAB] [WARN] >{RESET} %(message)s",
        logging.ERROR: f"{RED_BRIGHT}[ArtTic-LAB] [ERROR] >{RESET} %(message)s",
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno, self._fmt)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


class UvicornAccessFormatter(logging.Formatter):
    def format(self, record):
        try:
            status_code = record.args[4]
            status_phrase = http.HTTPStatus(status_code).phrase
        except (IndexError, ValueError):
            return super().format(record)

        if status_code >= 500:
            status_color = CustomFormatter.RED_BRIGHT
        elif status_code >= 400:
            status_color = CustomFormatter.ORANGE
        elif status_code >= 300:
            status_color = CustomFormatter.GREY
        else:
            status_color = CustomFormatter.SEA_GREEN

        return (
            f"{CustomFormatter.DARTMOUTH_GREEN}[Web]{CustomFormatter.RESET} "
            f"{record.args[1]} {record.args[2]} -> "
            f"{status_color}{status_code} {status_phrase}{CustomFormatter.RESET}"
        )


def log_system_info():
    logger = logging.getLogger(APP_LOGGER_NAME)

    art = f"""
    {CustomFormatter.CELADON}     █████╗ ██████╗ ████████╗ ████████╗██╗ ██████╗          ██╗      █████╗ ██████╗ 
    {CustomFormatter.MINT_2}    ██╔══██╗██╔══██╗╚══██╔══╝ ╚══██╔══╝██║██╔════╝          ██║     ██╔══██╗██╔══██╗
    {CustomFormatter.MINT_2}    ███████║██████╔╝   ██║       ██║   ██║██║       ██████  ██║     ███████║██████╔╝
    {CustomFormatter.SEA_GREEN}    ██╔══██║██╔══██╗   ██║       ██║   ██║██║               ██║     ██╔══██║██╔══██╗
    {CustomFormatter.DARTMOUTH_GREEN}    ██║  ██║██║  ██║   ██║       ██║   ██║╚██████╗          ███████╗██║  ██║██████╔╝
    {CustomFormatter.BRUNSWICK_GREEN}    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝       ╚═╝   ╚═╝ ╚═════╝          ╚══════╝╚═╝  ╚═╝╚═════╝ 
    {CustomFormatter.RESET}
    """
    print(art)

    logger.info(f"Welcome to ArtTic-LAB v{APP_VERSION}!")
    logger.info("A modern, clean, and powerful UI for Intel ARC GPUs.")
    logger.info("-" * 60)
    logger.info("System Information:")

    py_version = (
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    )
    logger.info(
        f"  Python: {py_version}, Torch: {torch.__version__}, IPEX: {ipex.__version__}, Diffusers: {diffusers.__version__}"
    )

    if torch.xpu.is_available():
        gpu_name = torch.xpu.get_device_name(0)
        logger.info(
            f"  Intel GPU: {CustomFormatter.MINT_2}{gpu_name}{CustomFormatter.RESET} (Detected)"
        )
    else:
        logger.error("  Intel GPU: Not Detected! The application may not work.")

    logger.info("-" * 60)


def setup_logging(disable_filters=False):
    if disable_filters:
        logging.basicConfig(
            level=logging.INFO, format="[%(name)s] [%(levelname)s] > %(message)s"
        )
        return

    logging.getLogger().addHandler(logging.NullHandler())
    logging.getLogger().setLevel(logging.ERROR)

    app_logger = logging.getLogger(APP_LOGGER_NAME)
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False

    if app_logger.hasHandlers():
        app_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CustomFormatter())
    handler.addFilter(ArtTicFilter())
    app_logger.addHandler(handler)


def setup_web_logging():
    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    uvicorn_error_logger.propagate = False
    if uvicorn_error_logger.hasHandlers():
        uvicorn_error_logger.handlers.clear()
    error_handler = logging.StreamHandler(sys.stderr)
    error_handler.setFormatter(CustomFormatter())
    uvicorn_error_logger.addHandler(error_handler)

    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    uvicorn_access_logger.propagate = False
    if uvicorn_access_logger.hasHandlers():
        uvicorn_access_logger.handlers.clear()
    access_handler = logging.StreamHandler(sys.stdout)
    access_handler.setFormatter(UvicornAccessFormatter())
    uvicorn_access_logger.addHandler(access_handler)
