import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from core import logic as core
from core.logic import OOMError
import os

APP_LOGGER_NAME = "arttic_lab"
logger = logging.getLogger(APP_LOGGER_NAME)

app = FastAPI()

app.mount("/static", StaticFiles(directory="web/static"), name="static")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
app.mount("/fonts", StaticFiles(directory="web/fonts"), name="fonts")
app.mount("/icons", StaticFiles(directory="web/icons"), name="icons")

env = Environment(loader=FileSystemLoader("web/templates"))
index_template = env.get_template("index.html")


@app.get("/", response_class=HTMLResponse)
async def read_root():
    return index_template.render()


@app.get("/api/status")
async def get_status():
    return core.get_app_status()


@app.get("/api/config")
async def get_initial_config():
    return core.get_config()


@app.get("/api/gallery")
async def get_gallery_images():
    return {"images": core.get_output_images()}


@app.get("/api/prompts")
async def get_prompts():
    return core.get_prompts()


from fastapi import Request
import json


@app.post("/api/prompts")
async def add_prompt(request: Request):
    body = await request.json()
    title = body.get("title")
    prompt = body.get("prompt")
    negative_prompt = body.get("negative_prompt", "")
    return core.add_prompt(title, prompt, negative_prompt)


@app.put("/api/prompts")
async def update_prompt(request: Request):
    body = await request.json()
    old_title = body.get("old_title")
    new_title = body.get("new_title")
    prompt = body.get("prompt")
    negative_prompt = body.get("negative_prompt")
    return core.update_prompt(old_title, new_title, prompt, negative_prompt)


@app.delete("/api/prompts")
async def delete_prompt(request: Request):
    body = await request.json()
    title = body.get("title")
    return core.delete_prompt(title)


@app.get("/api/image_metadata/{filename}")
async def get_image_metadata(filename: str):
    return core.get_image_metadata(filename)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        loop = asyncio.get_running_loop()
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload", {})

            async def progress_callback(progress, desc):
                await websocket.send_json(
                    {
                        "type": "progress_update",
                        "data": {"progress": progress, "description": desc},
                    }
                )

            try:
                if action == "load_model":
                    result = await asyncio.to_thread(
                        core.load_model,
                        **payload,
                        progress_callback=progress_callback,
                        loop=loop,
                    )
                    await websocket.send_json({"type": "model_loaded", "data": result})

                elif action == "generate_image":
                    try:
                        gen_args = {
                            "prompt": payload.get("prompt"),
                            "negative_prompt": payload.get("negative_prompt"),
                            "steps": payload.get("steps"),
                            "guidance": payload.get("guidance"),
                            "seed": payload.get("seed"),
                            "width": payload.get("width"),
                            "height": payload.get("height"),
                            "lora_weight": payload.get("lora_weight"),
                            "init_image": payload.get("init_image"),
                            "strength": payload.get("strength"),
                        }
                        result = await asyncio.to_thread(
                            core.generate_image,
                            **gen_args,
                            progress_callback=progress_callback,
                            loop=loop,
                        )
                        await websocket.send_json(
                            {"type": "generation_complete", "data": result}
                        )
                        await manager.broadcast(
                            {
                                "type": "gallery_updated",
                                "data": {"images": core.get_output_images()},
                            }
                        )
                    except OOMError as e:
                        await websocket.send_json(
                            {"type": "generation_failed", "data": {"message": str(e)}}
                        )

                elif action == "unload_model":
                    result = await asyncio.to_thread(core.unload_model)
                    await websocket.send_json(
                        {"type": "model_unloaded", "data": result}
                    )

                elif action == "delete_image":
                    filename = payload.get("filename")
                    result = await asyncio.to_thread(core.delete_image, filename)
                    await websocket.send_json({"type": "image_deleted", "data": result})
                    await manager.broadcast(
                        {
                            "type": "gallery_updated",
                            "data": {"images": core.get_output_images()},
                        }
                    )

                elif action == "get_settings_data":
                    data = {
                        "models": await asyncio.to_thread(core.get_model_files),
                        "loras": await asyncio.to_thread(core.get_lora_files),
                    }
                    await websocket.send_json({"type": "settings_data", "data": data})

                elif action == "delete_model_file":
                    filename = payload.get("filename")
                    result = await asyncio.to_thread(core.delete_model_file, filename)
                    await websocket.send_json(
                        {"type": "model_file_deleted", "data": result}
                    )
                    if result.get("status") == "success":
                        updated_data = {
                            "models": await asyncio.to_thread(core.get_model_files),
                            "loras": await asyncio.to_thread(core.get_lora_files),
                        }
                        await manager.broadcast(
                            {"type": "settings_data_updated", "data": updated_data}
                        )

                elif action == "delete_lora_file":
                    filename = payload.get("filename")
                    result = await asyncio.to_thread(core.delete_lora_file, filename)
                    await websocket.send_json(
                        {"type": "lora_file_deleted", "data": result}
                    )
                    if result.get("status") == "success":
                        updated_data = {
                            "models": await asyncio.to_thread(core.get_model_files),
                            "loras": await asyncio.to_thread(core.get_lora_files),
                        }
                        await manager.broadcast(
                            {"type": "settings_data_updated", "data": updated_data}
                        )

                elif action == "restart_backend":
                    await websocket.send_json(
                        {"type": "backend_restarting", "data": {}}
                    )
                    await asyncio.sleep(0.5)
                    core.restart_backend()
                    break

                elif action == "clear_cache":
                    result = await asyncio.to_thread(core.clear_cache)
                    await websocket.send_json({"type": "cache_cleared", "data": result})

                else:
                    logger.warning(f"Unknown WebSocket action received: {action}")

            except Exception as e:
                logger.error(f"Error processing action '{action}': {e}", exc_info=True)
                await websocket.send_json(
                    {"type": "error", "data": {"message": str(e)}}
                )

    except WebSocketDisconnect:
        logger.info("Client disconnected.")
    except Exception as e:
        logger.error(f"An unexpected error occurred in WebSocket: {e}", exc_info=True)
    finally:
        if websocket in manager.active_connections:
            manager.disconnect(websocket)
