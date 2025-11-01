import os
from safetensors import safe_open
from .sd15_pipeline import SD15Pipeline
from .sd2_pipeline import SD2Pipeline
from .sdxl_pipeline import SDXLPipeline
from .sd3_pipeline import SD3Pipeline
from .flux_pipeline import ArtTicFLUXPipeline
import logging

logger = logging.getLogger("arttic_lab")

MODELS_DIR = "./models"


def _is_flux(keys):
    has_flux_signature = any("transformer." in k for k in keys) or any(
        "double_blocks." in k for k in keys
    )
    has_unet_signature = any("input_blocks" in k for k in keys) or any(
        "output_blocks" in k for k in keys
    )
    return has_flux_signature and not has_unet_signature


def _is_sd3(keys):
    return any(k.startswith("text_encoders.") for k in keys)


def _is_xl(keys):
    return any(k.startswith("conditioner.embedders.1") for k in keys)


def _is_v2(keys):
    return (
        "model.diffusion_model.input_blocks.8.1.transformer_blocks.0.attn2.to_k.weight"
        in keys
    )


def get_pipeline_for_model(model_name):
    model_path = os.path.join(MODELS_DIR, f"{model_name}.safetensors")
    model_name_lower = model_name.lower()

    try:
        with safe_open(model_path, framework="pt", device="cpu") as f:
            keys = list(f.keys())
    except Exception as e:
        logger.error(
            f"Could not inspect model '{model_name}': {e}. Assuming SD 1.5 as fallback."
        )
        return SD15Pipeline(model_path)

    if _is_sd3(keys):
        logger.info(f"Model '{model_name}' detected as SD3.")
        return SD3Pipeline(model_path)
    elif _is_xl(keys):
        logger.info(f"Model '{model_name}' detected as SDXL.")
        return SDXLPipeline(model_path)
    elif _is_flux(keys):
        logger.info(f"Model '{model_name}' detected as FLUX based on tensor keys.")
        if "schnell" in model_name_lower:
            logger.info("FLUX model identified as 'Schnell' variant from filename.")
            return ArtTicFLUXPipeline(model_path, is_schnell=True)
        else:
            logger.info("FLUX model identified as 'DEV' variant.")
            return ArtTicFLUXPipeline(model_path, is_schnell=False)
    elif _is_v2(keys):
        logger.info(f"Model '{model_name}' detected as SD 2.x.")
        return SD2Pipeline(model_path)
    else:
        logger.info(f"Model '{model_name}' detected as SD 1.5.")
        return SD15Pipeline(model_path)
