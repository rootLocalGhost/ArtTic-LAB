# core/logic.py
import torch
import os
import time
import random
import logging
import math
import re
import asyncio
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


class OOMError(Exception):
    pass


app_state = {
    "current_pipe": None,
    "current_model_name": "",
    "current_lora_name": "",
    "is_model_loaded": False,
    "status_message": "No model loaded.",
    "current_cpu_offload_state": False,
    "current_vae_tiling_state": True,
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


def _get_next_image_number():
    files = get_output_images()
    if not files:
        return 1

    highest_num = 0
    pattern = re.compile(r"ArtTic-LAB_(\d+)\.png")
    for f in files:
        match = pattern.match(f)
        if match:
            num = int(match.group(1))
            if num > highest_num:
                highest_num = num
    return highest_num + 1


def delete_image(filename):
    if not filename:
        raise ValueError("Filename cannot be empty.")

    outputs_dir = os.path.abspath("./outputs")
    file_path = os.path.abspath(os.path.join(outputs_dir, filename))

    if os.path.commonpath([file_path, outputs_dir]) != outputs_dir:
        logger.error(
            f"Attempted to delete file outside of outputs directory: {filename}"
        )
        raise PermissionError("Cannot delete files outside of the outputs directory.")

    if not os.path.exists(file_path):
        logger.warning(f"Attempted to delete non-existent file: {filename}")
        return {"status": "not_found", "message": f"File '{filename}' not found."}

    try:
        os.remove(file_path)
        logger.info(f"Successfully deleted image: {filename}")
        return {"status": "success", "message": f"Deleted '{filename}'."}
    except Exception as e:
        logger.error(f"Error deleting file '{filename}': {e}", exc_info=True)
        raise IOError(f"Could not delete file '{filename}'.")


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
            "current_vae_tiling_state": True,
            "current_model_type": "",
            "default_width": 512,
            "default_height": 512,
        }
    )

    torch.xpu.empty_cache()

    logger.info("Model unloaded and VRAM cache cleared.")
    return {"status_message": app_state["status_message"]}


def _calculate_max_resolution(model_type):
    if not torch.xpu.is_available():
        return 1024

    GB = 1024**3
    total_mem = torch.xpu.get_device_properties(0).total_memory / GB
    reserved_mem = torch.xpu.memory_reserved(0) / GB
    free_mem = total_mem - reserved_mem

    vram_per_megapixel = {
        "SD 1.5": 0.9,
        "SD 2.x": 1.2,
        "SDXL": 2.5,
        "SD3": 3.0,
        "FLUX Dev": 3.2,
        "FLUX Schnell": 2.8,
    }.get(model_type, 1.5)

    base_res_mp = {
        "SD 1.5": 0.26,
        "SD 2.x": 0.59,
    }.get(model_type, 1.05)

    try:
        effective_free_mem = max(0, free_mem - 0.25)
        max_additional_mp = effective_free_mem / vram_per_megapixel
        total_mp = base_res_mp + max_additional_mp
        side_length = math.sqrt(total_mp * 1024 * 1024)
        max_res = int(side_length // 64 * 64)
        return max(512, min(4096, max_res))
    except Exception:
        return 1024


def load_model(
    model_name,
    scheduler_name,
    vae_tiling,
    cpu_offload,
    lora_name,
    progress_callback=None,
    loop=None,
):
    if not model_name:
        raise ValueError("Please select a model from the dropdown.")

    lora_name = lora_name if lora_name != "None" else ""

    if (
        app_state["is_model_loaded"]
        and app_state["current_model_name"] == model_name
        and app_state["current_lora_name"] == lora_name
        and app_state["current_cpu_offload_state"] == cpu_offload
        and app_state["current_vae_tiling_state"] == vae_tiling
    ):
        logger.info(
            f"Model '{model_name}' with the same configuration is already loaded. Skipping."
        )
        max_res_vram = _calculate_max_resolution(app_state["current_model_type"])
        return {
            "status_message": app_state["status_message"],
            "model_type": app_state["current_model_type"],
            "width": app_state["default_width"],
            "height": app_state["default_height"],
            "max_res_vram": max_res_vram,
            "max_res_offload": 2048,
        }

    def update_progress(progress, desc):
        if progress_callback and loop:
            asyncio.run_coroutine_threadsafe(progress_callback(progress, desc), loop)

    try:
        if app_state["is_model_loaded"]:
            unload_model()

        logger.info(f"Loading model: {model_name}...")
        update_progress(0, f"Getting pipeline for {model_name}...")

        pipe = get_pipeline_for_model(model_name)
        pipe.load_pipeline(update_progress)
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

        pipe.optimize_with_ipex(update_progress)

        if not isinstance(pipe, (SD3Pipeline, ArtTicFLUXPipeline)):
            logger.info(f"Setting scheduler to: {scheduler_name}")
            SchedulerClass = SCHEDULER_MAP[scheduler_name]
            pipe.pipe.scheduler = SchedulerClass.from_config(pipe.pipe.scheduler.config)

        if not isinstance(pipe, ArtTicFLUXPipeline):
            if vae_tiling:
                logger.info("Enabling VAE Slicing & Tiling.")
                pipe.pipe.enable_vae_slicing()
                pipe.pipe.enable_vae_tiling()
            else:
                logger.info("Disabling VAE Slicing & Tiling.")
                pipe.pipe.disable_vae_slicing()
                pipe.pipe.disable_vae_tiling()
        else:
            logger.info("VAE Tiling is not applicable for FLUX models.")

        app_state["current_vae_tiling_state"] = vae_tiling
        app_state["current_pipe"] = pipe
        app_state["current_model_name"] = model_name
        app_state["current_cpu_offload_state"] = cpu_offload

        if isinstance(pipe, ArtTicFLUXPipeline):
            model_type = "FLUX Schnell" if pipe.is_schnell else "FLUX Dev"
            default_res = 1024
        elif isinstance(pipe, SD3Pipeline):
            model_type = "SD3"
            default_res = 1024
        elif isinstance(pipe, SDXLPipeline):
            model_type = "SDXL"
            default_res = 1024
        elif isinstance(pipe, SD2Pipeline):
            model_type = "SD 2.x"
            default_res = 768
        else:
            model_type = "SD 1.5"
            default_res = 512

        status_suffix = "(CPU Offload)" if cpu_offload else ""
        lora_suffix = (
            f" + {app_state['current_lora_name']}"
            if app_state["current_lora_name"]
            else ""
        )
        status_message = (
            f"Ready: {model_name} ({model_type}){lora_suffix} {status_suffix}"
        )

        app_state.update(
            {
                "status_message": status_message,
                "is_model_loaded": True,
                "current_model_type": model_type,
                "default_width": default_res,
                "default_height": default_res,
            }
        )

        logger.info(
            f"Model '{model_name}' is ready! Type: {model_type} {status_suffix}."
        )
        update_progress(1, "Model Ready!")

        max_res_vram = _calculate_max_resolution(model_type)

        return {
            "status_message": status_message,
            "model_type": model_type,
            "width": default_res,
            "height": default_res,
            "max_res_vram": max_res_vram,
            "max_res_offload": 2048,
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
    loop=None,
):
    if not app_state["is_model_loaded"]:
        raise ConnectionAbortedError("Cannot generate, no model is loaded.")

    logger.info("Starting image generation...")
    start_time = time.time()
    seed = int(seed if seed is not None else random.randint(0, 2**32 - 1))
    generator = torch.Generator("xpu").manual_seed(seed)

    def pipeline_progress_callback(pipe, step, timestep, callback_kwargs):
        progress = step / int(steps)
        if progress_callback and loop:
            asyncio.run_coroutine_threadsafe(
                progress_callback(progress, f"Sampling... {step + 1}/{int(steps)}"),
                loop,
            )
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

    try:
        image = app_state["current_pipe"].generate(**gen_kwargs).images[0]
    except torch.OutOfMemoryError as e:
        torch.xpu.empty_cache()
        logger.error(f"XPU Out of Memory during generation: {e}")
        raise OOMError(
            "Your GPU ran out of memory while generating the image. Try reducing the resolution or steps."
        )

    generation_time = time.time() - start_time
    logger.info(f"Generation completed in {generation_time:.2f} seconds.")

    os.makedirs("./outputs", exist_ok=True)
    filename = f"ArtTic-LAB_{_get_next_image_number()}.png"
    filepath = os.path.join("./outputs", filename)
    image.save(filepath)

    info_text = f"Generated in {generation_time:.2f}s on '{app_state['current_model_name']}' with seed {seed}."
    if app_state["current_lora_name"]:
        info_text += f" LoRA: {app_state['current_lora_name']} @ {lora_weight}."

    return {"image_filename": filename, "info": info_text}
