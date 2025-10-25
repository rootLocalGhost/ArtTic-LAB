# helpers/cli_manager.py
import logging
import sys

APP_LOGGER_NAME = "arttic_lab"
APP_VERSION = "2.0.0"


class ArtTicFilter(logging.Filter):
    def filter(self, record):
        return record.name == APP_LOGGER_NAME


class CustomFormatter(logging.Formatter):
    TEAL_DARK = "\x1b[38;2;13;148;136m"
    TEAL_MID = "\x1b[38;2;20;184;166m"
    CYAN_BRIGHT = "\x1b[38;2;103;232;249m"
    RED_BRIGHT = "\x1b[38;2;239;68;68m"
    RESET = "\x1b[0m"

    FORMATS = {
        logging.INFO: f"{TEAL_MID}[ArtTic-LAB] >{RESET} %(message)s",
        logging.WARNING: f"{TEAL_MID}[ArtTic-LAB] [WARN] >{RESET} %(message)s",
        logging.ERROR: f"{RED_BRIGHT}[ArtTic-LAB] [ERROR] >{RESET} %(message)s",
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno, self._fmt)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def log_system_info():
    import torch
    import intel_extension_for_pytorch as ipex
    import diffusers

    logger = logging.getLogger(APP_LOGGER_NAME)

    art = f"""
    {CustomFormatter.CYAN_BRIGHT}     █████╗ ██████╗ ████████╗ ████████╗██╗ ██████╗          ██╗      █████╗ ██████╗ 
    {CustomFormatter.TEAL_MID}    ██╔══██╗██╔══██╗╚══██╔══╝ ╚══██╔══╝██║██╔════╝          ██║     ██╔══██╗██╔══██╗
    {CustomFormatter.TEAL_MID}    ███████║██████╔╝   ██║       ██║   ██║██║       ██████  ██║     ███████║██████╔╝
    {CustomFormatter.TEAL_DARK}    ██╔══██║██╔══██╗   ██║       ██║   ██║██║               ██║     ██╔══██║██╔══██╗
    {CustomFormatter.TEAL_DARK}    ██║  ██║██║  ██║   ██║       ██║   ██║╚██████╗          ███████╗██║  ██║██████╔╝
    {CustomFormatter.TEAL_DARK}    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝       ╚═╝   ╚═╝ ╚═════╝          ╚══════╝╚═╝  ╚═╝╚═════╝ 
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
            f"  Intel GPU: {CustomFormatter.CYAN_BRIGHT}{gpu_name}{CustomFormatter.RESET} (Detected)"
        )
    else:
        logger.error("  Intel GPU: Not Detected! The application may not work.")

    logger.info("-" * 60)


def setup_logging(disable_filters=False):
    if disable_filters:
        logging.basicConfig(level=logging.INFO)
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
