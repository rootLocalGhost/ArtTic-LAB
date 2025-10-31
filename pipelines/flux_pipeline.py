import torch
import logging
import os
import requests
from diffusers import FluxPipeline
from huggingface_hub.errors import GatedRepoError
from .base_pipeline import ArtTicPipeline

logger = logging.getLogger("arttic_lab")

FLUX_DEV_BASE_REPO = "black-forest-labs/FLUX.1-dev"
FLUX_SCHNELL_BASE_REPO = "black-forest-labs/FLUX.1-schnell"


class ArtTicFLUXPipeline(ArtTicPipeline):
    def __init__(self, model_path, dtype=torch.bfloat16, is_schnell=False):
        super().__init__(model_path, dtype)
        self.is_schnell = is_schnell

    def load_pipeline(self, progress):
        if self.is_schnell:
            repo_id = FLUX_SCHNELL_BASE_REPO
            desc = "Loading base FLUX.1 Schnell components..."
        else:
            repo_id = FLUX_DEV_BASE_REPO
            desc = "Loading base FLUX.1 DEV components..."

        progress(0.2, desc)
        try:
            self.pipe = FluxPipeline.from_pretrained(
                repo_id,
                torch_dtype=self.dtype,
                use_safetensors=True,
                progress_bar_config={"disable": True},
            )
        except GatedRepoError as e:
            logger.error(
                "Hugging Face Gated Repo Error: User needs to be logged in and have accepted the license for FLUX models."
            )
            raise RuntimeError(
                "Access to FLUX base model is restricted. Please run 'huggingface-cli login' "
                "and ensure you have accepted the license for 'black-forest-labs/FLUX.1-dev' on the Hugging Face website."
            ) from e
        except (requests.exceptions.RequestException, FileNotFoundError) as e:
            logger.error(
                f"Failed to download FLUX base model from '{repo_id}'. This is likely due to a network issue or a corrupted cache. Error: {e}"
            )
            cache_path = os.path.join(
                os.path.expanduser("~"), ".cache", "huggingface", "hub"
            )
            error_message = (
                "Could not download base FLUX components from Hugging Face.<br><br>"
                "<b>This is likely a network issue or a corrupted file cache.</b><br><br>"
                "<b>Action Required:</b><br>"
                "1. Ensure your internet connection is stable.<br>"
                "2. Delete the Hugging Face cache folder to force a fresh download.<br>"
                "3. Restart ArtTic-LAB and try again.<br><br>"
                f"Your cache folder is located at:<br><b>{cache_path}</b>"
            )
            raise RuntimeError(error_message) from e

        progress(0.5, "Injecting local model weights...")
        self.pipe.load_lora_weights(self.model_path)
        model_type = "Schnell" if self.is_schnell else "DEV"
        logger.info(
            f"Successfully injected FLUX {model_type} weights from '{self.model_path}'"
        )

    def generate(self, *args, **kwargs):
        if self.is_schnell and "negative_prompt" in kwargs:
            logger.info(
                "FLUX Schnell does not use a negative prompt. It will be ignored."
            )
            kwargs.pop("negative_prompt")
        return super().generate(*args, **kwargs)
