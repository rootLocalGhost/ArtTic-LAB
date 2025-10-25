# core/logic.py
import torch
import os
import time
import random
import logging
from glob import glob
from diffusers import (
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    LMSDiscreteScheduler,
    DPMSolverMultistepScheduler,
    DDIMScheduler,
    UniPCMultistepScheduler,
)
from pipelines import get_pipeline_for_model
from pipelines.sdxl_pipeline import SDXLPipeline
from pipelines.sd2_pipeline import SD2Pipeline
from pipelines.sd3_pipeline import SD3Pipeline
from pipelines.flux_pipeline import ArtTicFLUXPipeline

app_state = {
    "current_pipe": None,
    "current_model_name": "",
    "current_lora_name": "",
    "is_model_loaded": False,
    "status_message": "No model loaded.",
    "current_cpu_offload_state": False,
    "current_model_type": "",
    "default_width": 512,
    "default_height": 512,
}

APP_LOGGER_NAME = "arttic_lab"
logger = logging.getLogger(APP_LOGGER_NAME)
SCHEDULER_MAP = {
    "Euler A": EulerAncestralDiscreteScheduler,
    "DPM++ 2M": DPMSolverMultistepScheduler,
    "DDIM": DDIMScheduler,
    "UniPC": UniPCMultistepScheduler,
    "Euler": EulerDiscreteScheduler,
    "LMS": LMSDiscreteScheduler,
}


def get_config():
    return {
        "models": get_available_models(),
        "loras": get_available_loras(),
        "schedulers": list(SCHEDULER_MAP.keys()),
        "gallery_images": get_output_images(),
    }


def get_available_models():
    models_path = os.path.join("./models", "*.safetensors")
    return [os.path.basename(p).replace(".safetensors", "") for p in glob(models_path)]


def get_available_loras():
    os.makedirs("./loras", exist_ok=True)
    loras_path = os.path.join("./loras", "*.safetensors")
    return [os.path.basename(p).replace(".safetensors", "") for p in glob(loras_path)]


def get_output_images():
    outputs_path = os.path.join("./outputs", "*.png")
    return [
        os.path.basename(f)
        for f in sorted(glob(outputs_path), key=os.path.getmtime, reverse=True)
    ]


def unload_model():
    if not app_state["is_model_loaded"]:
        logger.info("Unload command received, but no model is currently loaded.")
        return {"status_message": "No model loaded."}

    logger.info(f"Unloading model '{app_state['current_model_name']}' from VRAM...")
    pipe_to_delete = app_state["current_pipe"]

    if hasattr(pipe_to_delete, "pipe"):
        del pipe_to_delete.pipe
    del pipe_to_delete

    app_state.update(
        {
            "current_pipe": None,
            "current_model_name": "",
            "current_lora_name": "",
            "is_model_loaded": False,
            "status_message": "No model loaded.",
            "current_cpu_offload_state": False,
            "current_model_type": "",
            "default_width": 512,
            "default_height": 512,
        }
    )

    torch.xpu.empty_cache()

    logger.info("Model unloaded and VRAM cache cleared.")
    return {"status_message": app_state["status_message"]}


def load_model(
    model_name,
    scheduler_name,
    vae_tiling,
    cpu_offload,
    lora_name,
    progress_callback=None,
):
    if not model_name:
        raise ValueError("Please select a model from the dropdown.")

    lora_name = lora_name if lora_name != "None" else ""

    if (
        app_state["is_model_loaded"]
        and app_state["current_model_name"] == model_name
        and app_state["current_lora_name"] == lora_name
        and app_state["current_cpu_offload_state"] == cpu_offload
    ):
        logger.info(
            f"Model '{model_name}' with the same configuration is already loaded. Skipping."
        )
        return {
            "status_message": app_state["status_message"],
            "model_type": app_state["current_model_type"],
            "width": app_state["default_width"],
            "height": app_state["default_height"],
        }

    def update_progress(progress, desc):
        if progress_callback:
            progress_callback(progress, desc)

    try:
        if app_state["is_model_loaded"]:
            unload_model()

        logger.info(f"Loading model: {model_name}...")
        update_progress(0, f"Getting pipeline for {model_name}...")

        pipe = get_pipeline_for_model(model_name)
        pipe.load_pipeline(lambda progress, desc: update_progress(progress, desc))
        pipe.place_on_device(use_cpu_offload=cpu_offload)

        if lora_name:
            lora_path = os.path.join("./loras", f"{lora_name}.safetensors")
            if os.path.exists(lora_path):
                logger.info(f"Loading LoRA: {lora_name}")
                update_progress(0.7, f"Loading LoRA: {lora_name}")
                pipe.pipe.load_lora_weights(lora_path)
                app_state["current_lora_name"] = lora_name
            else:
                logger.warning(f"LoRA file not found: {lora_path}. Skipping.")
                app_state["current_lora_name"] = ""
        else:
            app_state["current_lora_name"] = ""

        pipe.optimize_with_ipex(lambda progress, desc: update_progress(progress, desc))

        if not isinstance(pipe, (SD3Pipeline, ArtTicFLUXPipeline)):
            logger.info(f"Setting scheduler to: {scheduler_name}")
            SchedulerClass = SCHEDULER_MAP[scheduler_name]
            pipe.pipe.scheduler = SchedulerClass.from_config(pipe.pipe.scheduler.config)

        if not isinstance(pipe, ArtTicFLUXPipeline):
            if vae_tiling:
                logger.info("Enabling VAE Slicing & Tiling for memory efficiency.")
                pipe.pipe.enable_vae_slicing()
                pipe.pipe.enable_vae_tiling()
            else:
                logger.info("Disabling VAE Slicing & Tiling.")
                pipe.pipe.disable_vae_slicing()
                pipe.pipe.disable_vae_tiling()
        else:
            logger.info("VAE Tiling is not applicable for FLUX models.")

        app_state["current_pipe"] = pipe
        app_state["current_model_name"] = model_name
        app_state["current_cpu_offload_state"] = cpu_offload

        if isinstance(pipe, ArtTicFLUXPipeline):
            model_type = "FLUX Schnell" if pipe.is_schnell else "FLUX Dev"
            default_res = 1024
        elif isinstance(pipe, SD3Pipeline):
            default_res, model_type = 1024, "SD3"
        elif isinstance(pipe, SDXLPipeline):
            default_res, model_type = 1024, "SDXL"
        elif isinstance(pipe, SD2Pipeline):
            default_res, model_type = 768, "SD 2.x"
        else:
            default_res, model_type = 512, "SD 1.5"

        status_suffix = "(CPU Offload)" if cpu_offload else ""
        lora_suffix = (
            f" + {app_state['current_lora_name']}"
            if app_state["current_lora_name"]
            else ""
        )
        status_message = (
            f"Ready: {model_name} ({model_type}){lora_suffix} {status_suffix}"
        )

        app_state["status_message"] = status_message
        app_state["is_model_loaded"] = True
        app_state["current_model_type"] = model_type
        app_state["default_width"] = default_res
        app_state["default_height"] = default_res

        logger.info(
            f"Model '{model_name}' is ready! Type: {model_type} {status_suffix}."
        )
        update_progress(1, "Model Ready!")

        return {
            "status_message": status_message,
            "model_type": model_type,
            "width": default_res,
            "height": default_res,
        }
    except Exception as e:
        logger.error(
            f"Failed to load model '{model_name}'. Full error: {e}", exc_info=True
        )
        unload_model()
        raise RuntimeError(
            f"Failed to load model '{model_name}'. Check logs for details."
        )


def generate_image(
    prompt,
    negative_prompt,
    steps,
    guidance,
    seed,
    width,
    height,
    lora_weight,
    progress_callback=None,
):
    if not app_state["is_model_loaded"]:
        raise ConnectionAbortedError("Cannot generate, no model is loaded.")

    logger.info("Starting image generation...")
    start_time = time.time()

    seed = int(seed if seed is not None else random.randint(0, 2**32 - 1))
    generator = torch.Generator("xpu").manual_seed(seed)

    def pipeline_progress_callback(pipe, step, timestep, callback_kwargs):
        progress = step / int(steps)
        if progress_callback:
            progress_callback(progress, f"Sampling... {step + 1}/{int(steps)}")
        return callback_kwargs

    gen_kwargs = {
        "prompt": prompt,
        "num_inference_steps": int(steps),
        "guidance_scale": float(guidance),
        "width": int(width),
        "height": int(height),
        "generator": generator,
        "callback_on_step_end": pipeline_progress_callback,
    }

    if app_state["current_lora_name"] and float(lora_weight) > 0:
        gen_kwargs["cross_attention_kwargs"] = {"scale": float(lora_weight)}
        logger.info(
            f"Applying LoRA '{app_state['current_lora_name']}' with weight {lora_weight}"
        )

    if negative_prompt and negative_prompt.strip():
        gen_kwargs["negative_prompt"] = negative_prompt

    image = app_state["current_pipe"].generate(**gen_kwargs).images[0]
    generation_time = time.time() - start_time
    logger.info(f"Generation completed in {generation_time:.2f} seconds.")

    os.makedirs("./outputs", exist_ok=True)
    filename = (
        f"{time.strftime('%Y%m%d-%H%M%S')}_{app_state['current_model_name']}_{seed}.png"
    )
    filepath = os.path.join("./outputs", filename)
    image.save(filepath)

    info_text = f"Generated in {generation_time:.2f}s on '{app_state['current_model_name']}' with seed {seed}."
    if app_state["current_lora_name"]:
        info_text += f" LoRA: {app_state['current_lora_name']} @ {lora_weight}."

    return {"image_filename": filename, "info": info_text}
