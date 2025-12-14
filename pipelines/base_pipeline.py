# pipelines/base_pipeline.py
import torch
import intel_extension_for_pytorch as ipex
import logging

logger = logging.getLogger("arttic_lab")


class ArtTicPipeline:
    def __init__(self, model_path, dtype=torch.bfloat16):
        if not torch.xpu.is_available():
            raise RuntimeError("Intel ARC GPU (XPU) not detected.")
        self.pipe = None
        self.model_path = model_path
        self.dtype = dtype
        self.is_optimized = False
        self.is_offloaded = False

    def load_pipeline(self, progress):
        raise NotImplementedError("Subclasses must implement load_pipeline")

    def place_on_device(self, use_cpu_offload=False):
        if not self.pipe:
            raise RuntimeError("Pipeline must be loaded before placing on device.")

        if use_cpu_offload:
            logger.info("Enabling Model CPU Offload for low VRAM usage.")
            self.pipe.enable_model_cpu_offload()
            self.is_offloaded = True
        else:
            logger.info("Moving model to XPU (ARC GPU) for maximum performance.")
            self.pipe.to("xpu")
            self.is_offloaded = False

    def optimize_with_ipex(self, progress):
        if self.is_optimized:
            logger.info("Model is already optimized.")
            return
        if self.is_offloaded:
            logger.warning("IPEX optimization is not available in CPU Offload mode.")
            return
        if not self.pipe:
            raise RuntimeError("Pipeline must be loaded before optimization.")

        progress(0.8, "Optimizing model with IPEX...")

        # Optimize Text Encoders
        if hasattr(self.pipe, "text_encoder"):
            self.pipe.text_encoder = ipex.optimize(
                self.pipe.text_encoder.eval(), dtype=self.dtype, inplace=True
            )
            logger.info("Text Encoder optimized with IPEX.")

        if hasattr(self.pipe, "text_encoder_2"):
            self.pipe.text_encoder_2 = ipex.optimize(
                self.pipe.text_encoder_2.eval(), dtype=self.dtype, inplace=True
            )
            logger.info("Text Encoder 2 optimized with IPEX.")

        if hasattr(self.pipe, "text_encoder_3"):
            self.pipe.text_encoder_3 = ipex.optimize(
                self.pipe.text_encoder_3.eval(), dtype=self.dtype, inplace=True
            )
            logger.info("Text Encoder 3 optimized with IPEX.")

        # Optimize U-Net / Transformer
        if hasattr(self.pipe, "unet"):
            # Suggest Channels Last memory format for Conv2d layers
            self.pipe.unet = self.pipe.unet.to(memory_format=torch.channels_last)
            self.pipe.unet = ipex.optimize(
                self.pipe.unet.eval(),
                dtype=self.dtype,
                inplace=True,
                weights_prepack=True,
            )
            logger.info("U-Net optimized with IPEX (Channels Last).")

        elif hasattr(self.pipe, "transformer"):
            self.pipe.transformer = ipex.optimize(
                self.pipe.transformer.eval(), dtype=self.dtype, inplace=True
            )
            logger.info("Transformer optimized with IPEX.")

        # Optimize VAE
        if hasattr(self.pipe, "vae"):
            self.pipe.vae = self.pipe.vae.to(memory_format=torch.channels_last)
            self.pipe.vae = ipex.optimize(
                self.pipe.vae.eval(),
                dtype=self.dtype,
                inplace=True,
                weights_prepack=True,
            )
            logger.info("VAE optimized with IPEX (Channels Last).")

        self.is_optimized = True

    def generate(self, *args, **kwargs):
        if not self.pipe:
            raise RuntimeError("Pipeline not loaded.")
        with torch.xpu.amp.autocast(enabled=True, dtype=self.dtype):
            return self.pipe(*args, **kwargs)
