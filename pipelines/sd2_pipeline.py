from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
from .base_pipeline import ArtTicPipeline


class SD2Pipeline(ArtTicPipeline):
    def __init__(self, model_path, dtype=None):
        super().__init__(model_path, dtype)
        self.t2i_class = StableDiffusionPipeline
        self.i2i_class = StableDiffusionImg2ImgPipeline

    def load_pipeline(self, progress):
        progress(0.2, "Loading StableDiffusionPipeline (v2)...")
        self.pipe = self.t2i_class.from_single_file(
            self.model_path,
            torch_dtype=self.dtype,
            use_safetensors=True,
            safety_checker=None,
            progress_bar_config={"disable": True},
        )
