document.addEventListener("DOMContentLoaded", () => {
  const state = {
    socket: null,
    isModelLoaded: false,
    lastGeneratedImage: null,
    maxVramRes: null,
    galleryImages: [],
    prompts: [],
    settings: { models: [], loras: [] },
    notifications: {},
    currentLightboxIndex: -1,
    zoomLevel: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panCurrent: { x: 0, y: 0 },
    canvas: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
    },
    nodes: new Map(),
    generationState: {
      model_name: null,
      scheduler_name: "Euler A",
      lora_name: null,
      lora_weight: 0.7,
      prompt:
        "fantasy portrait of an Ocean Spirit, mystical woman with flowing hair like seafoam green and celadon waves, watercolor art, cool color palette of mint green and dark brunswick green, luminous eyes, elegant posture, magical and calming aura, fine art style, detailed face, soft-focus lighting, painterly textures",
      negative_prompt:
        "ugly, deformed, blurry, noisy, saturated colors, warm colors",
      steps: 50,
      guidance: 5,
      seed: -1,
      width: 512,
      height: 512,
      vae_tiling: true,
      cpu_offload: false,
      init_image: null,
      strength: 0.75,
    },
  };

  const ui = {
    navLinks: document.querySelectorAll(".nav-link"),
    pages: {
      generate: document.getElementById("page-generate"),
      gallery: document.getElementById("page-gallery"),
      promptBook: document.getElementById("page-prompt-book"),
      settings: document.getElementById("page-settings"),
    },
    status: {
      indicator: document.getElementById("status-indicator"),
      connectionText: document.getElementById("connection-status"),
    },
    gallery: {
      grid: document.getElementById("gallery-grid"),
      placeholder: document.getElementById("gallery-placeholder"),
      refreshBtn: document.getElementById("refresh-gallery-btn"),
    },
    promptBook: {
      grid: document.getElementById("prompt-book-grid"),
      placeholder: document.getElementById("prompt-book-placeholder"),
      addBtn: document.getElementById("add-prompt-btn"),
      refreshBtn: document.getElementById("refresh-prompts-btn"),
      editor: {
        overlay: document.getElementById("prompt-editor-overlay"),
        title: document.getElementById("prompt-editor-title"),
        titleInput: document.getElementById("prompt-title"),
        promptInput: document.getElementById("prompt-content"),
        negativeInput: document.getElementById("prompt-negative"),
        buttons: document.getElementById("prompt-editor-buttons"),
        _oldTitle: null,
      },
    },
    settings: {
      modelsList: document.getElementById("models-list"),
      lorasList: document.getElementById("loras-list"),
      refreshModelsBtn: document.getElementById("refresh-models-btn"),
      refreshLorasBtn: document.getElementById("refresh-loras-btn"),
      fileItemTemplate: document.getElementById("file-item-template"),
    },
    lightbox: {
      container: document.getElementById("lightbox"),
      closeBtn: document.getElementById("lightbox-close"),
      img: document.getElementById("lightbox-img"),
      imageWrapper: document.getElementById("lightbox-image-wrapper"),
      caption: document.getElementById("lightbox-caption"),
      prevBtn: document.getElementById("lightbox-prev"),
      nextBtn: document.getElementById("lightbox-next"),
      zoomInBtn: document.getElementById("lightbox-zoom-in"),
      zoomOutBtn: document.getElementById("lightbox-zoom-out"),
      fitBtn: document.getElementById("lightbox-fit"),
      deleteBtn: document.getElementById("lightbox-delete"),
    },
    dialog: {
      overlay: document.getElementById("dialog-overlay"),
      title: document.getElementById("dialog-title"),
      message: document.getElementById("dialog-message"),
      buttons: document.getElementById("dialog-buttons"),
    },
    notificationContainer: document.getElementById("notification-container"),
    themeToggle: document.getElementById("theme-toggle-btn"),
    node: {
      canvas: document.getElementById("node-canvas"),
      connectorSvg: document.getElementById("node-connector-svg"),
      dock: document.getElementById("node-dock"),
      dockButtons: document.querySelectorAll("#node-dock .node-dock-button"),
      loadModelBtn: document.getElementById("dock-load-model-btn"),
      generateBtn: document.getElementById("dock-generate-btn"),
    },
    restartBtn: document.getElementById("restart-backend-btn"),
    clearCacheBtn: document.getElementById("clear-cache-btn"),
    resetZoomBtn: document.getElementById("reset-zoom-btn"),
  };

  function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    ui.themeToggle.querySelector(".material-symbols-outlined").textContent =
      savedTheme === "dark" ? "light_mode" : "dark_mode";
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    ui.themeToggle.querySelector(".material-symbols-outlined").textContent =
      newTheme === "dark" ? "light_mode" : "dark_mode";
  }

  function connectWebSocket() {
    const url = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host
      }/ws`;
    state.socket = new WebSocket(url);
    state.socket.onopen = () => {
      updateConnectionStatus("Connected", "connected");
      fetch("/api/status")
        .then((r) => r.json())
        .then((status) => {
          state.isModelLoaded = status.is_model_loaded;
          updateLoadUnloadButton();
          if (state.isModelLoaded) {
            updateNodeUI("model_sampler", {
              status: status.status_message,
              loaded: true,
            });
          }
        });
    };
    state.socket.onclose = () => {
      updateConnectionStatus("Reconnecting...", "connecting");
      setTimeout(connectWebSocket, 3000);
    };
    state.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      updateConnectionStatus("Error", "disconnected");
      state.socket.close();
    };
    state.socket.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      handleWebSocketMessage(type, data);
    };
  }

  function sendMessage(action, payload = {}) {
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ action, payload }));
    }
  }

  function handleWebSocketMessage(type, data) {
    const progressId = "progress_notification";
    const handlers = {
      model_loaded: (data) => {
        state.isModelLoaded = true;
        state.maxVramRes = data.max_res_vram;
        updateLoadUnloadButton();
        showNotification("Model loaded successfully", "success", 3000);
        updateNodeUI("model_sampler", {
          status: data.status_message,
          loaded: true,
        });
        state.generationState.width = data.width;
        state.generationState.height = data.height;
        updateNodeUI("parameters", {
          width: data.width,
          height: data.height,
          max_res: data.max_res_vram,
        });
        clearNotification(progressId);
      },
      generation_complete: (data) => {
        state.lastGeneratedImage = data.image_filename;
        updateNodeUI("image_preview", {
          image: data.image_filename,
          info: data.info,
        });
        showNotification("Image generated!", "success", 3000);
        clearNotification(progressId);
      },
      generation_failed: (data) => {
        showNotification(data.message, "error", 5000);
        clearNotification(progressId);
      },
      progress_update: (data) => {
        showNotification(
          data.description,
          "progress",
          null,
          progressId,
          data.progress
        );
      },
      model_unloaded: (data) => {
        state.isModelLoaded = false;
        state.maxVramRes = null;
        updateLoadUnloadButton();
        showNotification("Model unloaded", "info", 3000);
        updateNodeUI("model_sampler", {
          status: data.status_message,
          loaded: false,
        });
        updateNodeUI("parameters", { max_res: null });
      },
      gallery_updated: (data) => populateGallery(data.images),
      image_deleted: (data) => {
        if (data.status === "success") {
          closeLightbox();
          showNotification("Image deleted", "success", 2000);
        } else {
          showNotification(
            `Could not delete image: ${data.message}`,
            "error",
            4000
          );
        }
      },
      settings_data: (data) => {
        state.settings.models = data.models;
        state.settings.loras = data.loras;
        populateSettingsLists();
        updateNodeUI("model_sampler", {
          models: state.settings.models,
        });
        if (state.nodes.has("lora")) {
          updateNodeUI("lora", { loras: ["None", ...state.settings.loras] });
        }
      },
      settings_data_updated: (data) => {
        state.settings.models = data.models;
        state.settings.loras = data.loras;
        populateSettingsLists();
        updateNodeUI("model_sampler", {
          models: state.settings.models,
        });
        if (state.nodes.has("lora")) {
          updateNodeUI("lora", { loras: ["None", ...state.settings.loras] });
        }
        showNotification("File lists updated", "info", 2000);
      },
      error: (data) => {
        showNotification(data.message, "error", 5000);
        clearNotification(progressId);
      },
      backend_restarting: () =>
        showNotification("Backend is restarting...", "info"),
      cache_cleared: () =>
        showNotification("VRAM cache has been cleared.", "success", 3000),
    };
    (handlers[type] || (() => console.warn(`Unhandled message type: ${type}`)))(
      data
    );
  }

  function updateConnectionStatus(text, statusClass) {
    ui.status.connectionText.textContent = text;
    ui.status.indicator.className = `status-indicator ${statusClass}`;
  }

  function showNotification(
    message,
    type = "info",
    duration = 3000,
    id = null,
    progress = null
  ) {
    id = id || `noti_${Date.now()}`;
    let notification = state.notifications[id];

    const iconMap = {
      success: "check_circle",
      error: "error",
      info: "info",
      progress: "hourglass_top",
    };

    if (!notification) {
      notification = document.createElement("div");
      notification.className = `notification ${type}`;
      notification.innerHTML = `<span class="material-symbols-outlined">${iconMap[type] || "info"
        }</span><div class="notification-content">${message}</div>`;
      if (type === "progress") {
        const progressBar = document.createElement("div");
        progressBar.style.cssText =
          "position:absolute;bottom:0;left:0;right:0;height:4px;background-color:rgba(0,0,0,0.1);border-radius:0 0 12px 12px;overflow:hidden;";
        progressBar.innerHTML = `<div class="progress-bar-inner" style="height:100%;width:0%;background-color:var(--primary-500);transition:width 0.1s linear;"></div>`;
        notification.appendChild(progressBar);
      }
      ui.notificationContainer.appendChild(notification);
      state.notifications[id] = notification;
    }

    notification.querySelector(".notification-content").innerHTML = message;
    if (type === "progress" && progress !== null) {
      notification.querySelector(".progress-bar-inner").style.width = `${progress * 100
        }%`;
    }

    if (state.notifications[id].timeout) {
      clearTimeout(state.notifications[id].timeout);
    }

    if (duration) {
      state.notifications[id].timeout = setTimeout(
        () => clearNotification(id),
        duration
      );
    }
  }

  function clearNotification(id) {
    const notification = state.notifications[id];
    if (notification) {
      if (notification.timeout) clearTimeout(notification.timeout);
      notification.remove();
      delete state.notifications[id];
    }
  }

  function updateLoadUnloadButton() {
    const btn = ui.node.loadModelBtn;
    const generateBtn = ui.node.generateBtn;
    if (state.isModelLoaded) {
      btn.innerHTML = `<span class="material-symbols-outlined">cancel</span> Unload Model`;
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-danger");
      generateBtn.disabled = false;
    } else {
      btn.innerHTML = `<span class="material-symbols-outlined">download</span> Load Model`;
      btn.classList.add("btn-primary");
      btn.classList.remove("btn-danger");
      generateBtn.disabled = true;
    }
  }

  function showDialog(title, message, buttons) {
    ui.dialog.title.textContent = title;
    ui.dialog.message.innerHTML = message;
    ui.dialog.buttons.innerHTML = "";
    buttons.forEach((btnInfo) => {
      const button = document.createElement("button");
      button.textContent = btnInfo.text;
      button.className = `btn ${btnInfo.class || "btn-secondary"}`;
      button.onclick = () => {
        ui.dialog.overlay.classList.add("hidden");
        btnInfo.callback?.();
      };
      ui.dialog.buttons.appendChild(button);
    });
    ui.dialog.overlay.classList.remove("hidden");
  }

  function populateGallery(images) {
    state.galleryImages = images || [];
    ui.gallery.grid.innerHTML = "";
    const hasImages = state.galleryImages.length > 0;
    ui.gallery.placeholder.classList.toggle("hidden", !hasImages);
    if (hasImages) {
      state.galleryImages.forEach((imageInfo, index) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        const imageUrl = `/outputs/${imageInfo.filename}`;
        item.innerHTML = `<img src="${imageUrl}" alt="${imageInfo.filename}" class="gallery-item-image" loading="lazy"><div class="image-actions-overlay"><a href="${imageUrl}" target="_blank" class="image-action-btn" title="Open in New Tab"><span class="material-symbols-outlined">open_in_new</span></a></div>`;
        item
          .querySelector(".image-actions-overlay")
          .addEventListener("click", (e) => e.stopPropagation());
        item.addEventListener("click", () => openLightbox(index));
        ui.gallery.grid.appendChild(item);
      });
    }
  }

  function openLightbox(index) {
    showLightboxImage(index);
    ui.lightbox.container.classList.remove("hidden");
    document.addEventListener("keydown", handleLightboxKeys);
  }

  function closeLightbox() {
    ui.lightbox.container.classList.add("hidden");
    document.removeEventListener("keydown", handleLightboxKeys);
  }

  function showLightboxImage(index) {
    if (index < 0 || index >= state.galleryImages.length) return;
    state.currentLightboxIndex = index;
    const filename = state.galleryImages[index].filename;
    ui.lightbox.img.src = `/outputs/${filename}`;
    ui.lightbox.caption.textContent = filename;
    resetZoomAndPan();
  }

  function resetZoomAndPan() {
    state.zoomLevel = 1;
    state.panCurrent = { x: 0, y: 0 };
    updateImageTransform();
  }

  function updateImageTransform() {
    ui.lightbox.img.style.transform = `translate(${state.panCurrent.x}px, ${state.panCurrent.y}px) scale(${state.zoomLevel})`;
  }

  function handleLightboxKeys(e) {
    const keyMap = {
      Escape: closeLightbox,
      ArrowLeft: () => ui.lightbox.prevBtn.click(),
      ArrowRight: () => ui.lightbox.nextBtn.click(),
      "+": () => ui.lightbox.zoomInBtn.click(),
      "=": () => ui.lightbox.zoomInBtn.click(),
      "-": () => ui.lightbox.zoomOutBtn.click(),
      f: () => ui.lightbox.fitBtn.click(),
      Delete: () => ui.lightbox.deleteBtn.click(),
    };
    if (document.activeElement.tagName !== "INPUT") {
      keyMap[e.key]?.();
    }
  }

  function populateSettingsLists() {
    const createFileItem = (filename, type) => {
      const item = ui.settings.fileItemTemplate.content.cloneNode(true);
      item.querySelector(".file-name").textContent = filename;
      const deleteBtn = item.querySelector(".file-delete-btn");
      deleteBtn.addEventListener("click", () => {
        const action =
          type === "model" ? "delete_model_file" : "delete_lora_file";
        showDialog(
          "Confirm Deletion",
          `Delete <strong>${filename}</strong>? This cannot be undone.`,
          [
            { text: "Cancel" },
            {
              text: "Delete",
              class: "btn-danger",
              callback: () => sendMessage(action, { filename }),
            },
          ]
        );
      });
      return item;
    };

    ui.settings.modelsList.innerHTML = "";
    state.settings.models.forEach((model) =>
      ui.settings.modelsList.appendChild(createFileItem(model, "model"))
    );

    ui.settings.lorasList.innerHTML = "";
    state.settings.loras.forEach((lora) =>
      ui.settings.lorasList.appendChild(createFileItem(lora, "lora"))
    );
  }

  function initCanvasInteraction() {
    const { canvas } = ui.node;
    ui.resetZoomBtn.addEventListener("click", centerView);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const wheel = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(2, state.canvas.scale * wheel));
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      state.canvas.offsetX =
        mouseX -
        (mouseX - state.canvas.offsetX) * (newScale / state.canvas.scale);
      state.canvas.offsetY =
        mouseY -
        (mouseY - state.canvas.offsetY) * (newScale / state.canvas.scale);
      state.canvas.scale = newScale;
      updateCanvasTransform();
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.target === canvas) {
        state.canvas.isDragging = true;
        state.canvas.startX = e.clientX - state.canvas.offsetX;
        state.canvas.startY = e.clientY - state.canvas.offsetY;
        canvas.style.cursor = "grabbing";
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (state.canvas.isDragging) {
        state.canvas.offsetX = e.clientX - state.canvas.startX;
        state.canvas.offsetY = e.clientY - state.canvas.startY;
        updateCanvasTransform();
      }
    });
    document.addEventListener("mouseup", () => {
      state.canvas.isDragging = false;
      canvas.style.cursor = "default";
    });
  }

  function updateCanvasTransform() {
    const { canvas } = ui.node;
    canvas.style.transform = `translate(${state.canvas.offsetX}px, ${state.canvas.offsetY}px) scale(${state.canvas.scale})`;
  }

  function centerView() {
    if (state.nodes.size === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    state.nodes.forEach(({ el }) => {
      minX = Math.min(minX, el.offsetLeft);
      minY = Math.min(minY, el.offsetTop);
      maxX = Math.max(maxX, el.offsetLeft + el.offsetWidth);
      maxY = Math.max(maxY, el.offsetTop + el.offsetHeight);
    });

    const nodesWidth = maxX - minX;
    const nodesHeight = maxY - minY;
    const canvasRect = ui.node.canvas.parentElement.getBoundingClientRect();

    const scaleX = canvasRect.width / (nodesWidth + 200);
    const scaleY = canvasRect.height / (nodesHeight + 200);
    state.canvas.scale = Math.min(1, scaleX, scaleY);

    const centerX = minX + nodesWidth / 2;
    const centerY = minY + nodesHeight / 2;
    state.canvas.offsetX = canvasRect.width / 2 - centerX * state.canvas.scale;
    state.canvas.offsetY = canvasRect.height / 2 - centerY * state.canvas.scale;

    updateCanvasTransform();
  }

  function makeNodeDraggable(node) {
    const header = node.querySelector(".node-header");
    if (!header) return;
    header.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      let startX = e.clientX,
        startY = e.clientY;
      let startLeft = node.offsetLeft,
        startTop = node.offsetTop;
      const onMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startX) / state.canvas.scale;
        const dy = (moveEvent.clientY - startY) / state.canvas.scale;
        node.style.left = `${startLeft + dx}px`;
        node.style.top = `${startTop + dy}px`;
      };
      const onMouseUp = () =>
        document.removeEventListener("mousemove", onMouseMove);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp, { once: true });
    });
  }

  function createNode(type, x, y) {
    if (state.nodes.has(type)) {
      showNotification("A node of this type already exists.", "info", 2000);
      return;
    }
    const nodeEl = document.createElement("div");
    nodeEl.id = `node-${type}`;
    nodeEl.className = "node";
    nodeEl.style.left = `${x}px`;
    nodeEl.style.top = `${y}px`;
    const isPermanent = [
      "model_sampler",
      "parameters",
      "image_preview",
      "prompt",
    ].includes(type);
    let header = "",
      content = "";

    switch (type) {
      case "model_sampler":
        header = `<h3 class="node-title">Model & Sampler</h3>`;
        content = `<div class="node-content"><div class="control-group"><label>Model</label><div class="custom-dropdown" data-key="model_name"><div class="dropdown-selected">Select a model</div></div></div><div class="control-group"><label>Sampler</label><div class="custom-dropdown" data-key="scheduler_name"><div class="dropdown-selected">Euler A</div></div></div><div id="model-status" class="max-res-info">No model loaded.</div></div>`;
        break;
      case "parameters":
        header = `<h3 class="node-title">Parameters & Dimensions</h3>`;
        content = `<div class="node-content">
          <div class="control-group"><label>Steps</label><div class="slider-input-group"><input type="range" class="range-input" data-key="steps" min="1" max="100" value="${state.generationState.steps}" step="1"><input type="number" data-value-for="steps" value="${state.generationState.steps}"></div></div>
          <div class="control-group"><label>Guidance (CFG)</label><div class="slider-input-group"><input type="range" class="range-input" data-key="guidance" min="1" max="20" value="${state.generationState.guidance}" step="0.5"><input type="number" data-value-for="guidance" value="${state.generationState.guidance}" step="0.5"></div></div>
          <div class="control-group"><label>Img2Img Strength</label><div class="slider-input-group"><input type="range" class="range-input" data-key="strength" min="0.05" max="1.0" value="${state.generationState.strength}" step="0.05"><input type="number" data-value-for="strength" value="${state.generationState.strength}" step="0.05"></div></div>
          <div class="control-group"><label>Width</label><div class="slider-input-group"><input type="range" class="range-input" data-key="width" min="256" max="4096" value="${state.generationState.width}" step="64"><input type="number" data-value-for="width" value="${state.generationState.width}"></div></div>
          <div class="control-group"><label>Height</label><div class="slider-input-group"><input type="range" class="range-input" data-key="height" min="256" max="4096" value="${state.generationState.height}" step="64"><input type="number" data-value-for="height" value="${state.generationState.height}"></div></div>
          <div class="control-group"><div class="aspect-ratio-buttons"><button class="aspect-ratio-btn active" data-ratio="1:1" title="Square"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg></button><button class="aspect-ratio-btn" data-ratio="4:3" title="Landscape"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg></button><button class="aspect-ratio-btn" data-ratio="3:4" title="Portrait"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"></rect></svg></button></div></div>
          <div class="control-group"><label>Seed</label><div class="seed-input-wrapper"><input type="number" class="form-input" data-key="seed" value="${state.generationState.seed}"><button id="random-seed" class="icon-btn" title="Randomize Seed"><span class="material-symbols-outlined">casino</span></button></div></div>
          <div id="max-res-info" class="max-res-info">Load a model for VRAM estimate.</div>
          </div>`;
        break;
      case "image_preview":
        header = `<h3 class="node-title">Image Preview</h3>`;
        content = `<div class="node-content"><div class="image-preview-node"><div class="placeholder"><span class="material-symbols-outlined">wallpaper</span></div><img class="preview-img hidden" /></div><div id="image-info-text" class="max-res-info"></div><div class="image-preview-actions"><button id="view-image-btn" class="icon-btn" title="View Image" disabled><span class="material-symbols-outlined">visibility</span></button></div></div>`;
        break;
      case "input_image":
        header = `<h3 class="node-title">Input Image</h3>`;
        content = `
        <div class="node-content">
            <div class="input-image-dropzone" id="input-image-dropzone">
                <span class="material-symbols-outlined">add_photo_alternate</span>
                <p>Drag & Drop or Click</p>
                <input type="file" id="input-image-file" accept="image/*" hidden>
            </div>
            <div class="input-image-preview hidden">
                <img id="input-image-img" src="" alt="Input">
                <button class="remove-image-btn"><span class="material-symbols-outlined">close</span></button>
            </div>
        </div>`;
        break;
      case "prompt":
        header = `<h3 class="node-title">Prompt</h3>`;
        content = `<div class="node-content"><div class="control-group"><label>Positive Prompt</label><div class="autoresize-textarea-wrapper"><textarea class="form-textarea" data-key="prompt" rows="3">${state.generationState.prompt}</textarea></div></div><div class="control-group"><label>Negative Prompt</label><div class="autoresize-textarea-wrapper"><textarea class="form-textarea" data-key="negative_prompt" rows="2">${state.generationState.negative_prompt}</textarea></div></div></div>`;
        break;
      case "lora":
        header = `<h3 class="node-title">LoRA</h3>`;
        content = `<div class="node-content"><div class="control-group"><label>LoRA</label><div class="custom-dropdown" data-key="lora_name"><div class="dropdown-selected">None</div></div></div><div class="control-group"><label>Weight</label><div class="slider-input-group"><input type="range" class="range-input" data-key="lora_weight" min="0" max="1" value="${state.generationState.lora_weight}" step="0.05"><input type="number" data-value-for="lora_weight" value="${state.generationState.lora_weight}" step="0.05"></div></div></div>`;
        break;
      default:
        console.error("Unknown node type:", type);
        return;
    }

    nodeEl.innerHTML = `<div class="node-header">${header}${!isPermanent
      ? '<button class="node-delete icon-btn" title="Delete Node"><span class="material-symbols-outlined">close</span></button>'
      : ""
      }</div>${content}`;
    ui.node.canvas.appendChild(nodeEl);
    state.nodes.set(type, { el: nodeEl });
    makeNodeDraggable(nodeEl);
    initNodeControls(nodeEl, type);
  }

  function createCustomDropdown(container, options, key) {
    const selected = container.querySelector(".dropdown-selected");
    let optionsList = container.querySelector(".dropdown-options");
    if (!optionsList) {
      optionsList = document.createElement("ul");
      optionsList.className = "dropdown-options";
      container.appendChild(optionsList);
    }
    optionsList.innerHTML = "";

    options.forEach((option) => {
      const li = document.createElement("li");
      li.className = "dropdown-option";
      li.textContent = option;
      li.dataset.value = option;
      li.addEventListener("click", () => {
        selected.textContent = option;
        state.generationState[key] = option;
        container.classList.remove("open");
      });
      optionsList.appendChild(li);
    });

    selected.addEventListener("click", () =>
      container.classList.toggle("open")
    );
  }

  function initNodeControls(node, type) {
    const sliders = node.querySelectorAll('input[type="range"]');
    sliders.forEach((slider) => {
      const key = slider.dataset.key;
      const valueInput = node.querySelector(`input[data-value-for="${key}"]`);
      const updateSliderBg = () => {
        const percent =
          ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.backgroundSize = `${percent}% 100%`;
      };
      slider.addEventListener("input", () => {
        valueInput.value = slider.value;
        state.generationState[key] = Number(slider.value);
        updateSliderBg();
      });
      valueInput.addEventListener("change", () => {
        slider.value = valueInput.value;
        state.generationState[key] = Number(valueInput.value);
        updateSliderBg();
      });
      updateSliderBg();
    });

    const textareas = node.querySelectorAll("textarea");
    textareas.forEach((textarea) => {
      const key = textarea.dataset.key;
      const autoResize = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      };
      textarea.addEventListener("input", () => {
        state.generationState[key] = textarea.value;
        autoResize();
      });
      setTimeout(autoResize, 0);
    });

    if (type === "parameters") {
      node.querySelector("#random-seed").addEventListener("click", () => {
        updateNodeUI("parameters", { seed: -1 });
      });
      node
        .querySelectorAll(".aspect-ratio-btn")
        .forEach((btn) =>
          btn.addEventListener("click", () => setAspectRatio(btn.dataset.ratio))
        );
    }

    if (type === "image_preview") {
      node.querySelector("#view-image-btn").addEventListener("click", () => {
        const index = state.galleryImages.findIndex(
          (img) => img.filename === state.lastGeneratedImage
        );
        if (index !== -1) openLightbox(index);
      });
    }

    if (type === "input_image") {
      const dropzone = node.querySelector("#input-image-dropzone");
      const fileInput = node.querySelector("#input-image-file");
      const previewDiv = node.querySelector(".input-image-preview");
      const previewImg = node.querySelector("#input-image-img");
      const removeBtn = node.querySelector(".remove-image-btn");

      const handleFile = (file) => {
        if (file && file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target.result;
            state.generationState.init_image = base64;
            previewImg.src = base64;
            dropzone.classList.add("hidden");
            previewDiv.classList.remove("hidden");
          };
          reader.readAsDataURL(file);
        }
      };

      dropzone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) =>
        handleFile(e.target.files[0])
      );

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--primary-500)";
      });
      dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--input-border)";
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--input-border)";
        handleFile(e.dataTransfer.files[0]);
      });

      removeBtn.addEventListener("click", () => {
        state.generationState.init_image = null;
        previewImg.src = "";
        previewDiv.classList.add("hidden");
        dropzone.classList.remove("hidden");
        fileInput.value = "";
      });
    }

    if (!node.classList.contains("permanent")) {
      const deleteBtn = node.querySelector(".node-delete");
      deleteBtn?.addEventListener("click", () => {
        node.remove();
        state.nodes.delete(type);
        if (type === "input_image") state.generationState.init_image = null;
        const dockBtn = ui.node.dock.querySelector(
          `.node-dock-button[data-node-type="${type}"]`
        );
        if (dockBtn) dockBtn.classList.remove("active");
      });
    }
  }

  function updateNodeUI(type, updates) {
    const node = state.nodes.get(type)?.el;
    if (!node) return;
    for (const [key, value] of Object.entries(updates)) {
      if (key === "status") {
        node.querySelector("#model-status").textContent = value;
      } else if (key === "loaded") {
        node.querySelector("#model-status").style.color = value
          ? "var(--status-green)"
          : "var(--text-color)";
      } else if (key === "max_res") {
        const infoEl = node.querySelector("#max-res-info");
        infoEl.innerHTML = value
          ? `Est. Max VRAM Res: <strong>${value}x${value}</strong>`
          : "Load a model for VRAM estimate.";
      } else if (key === "image") {
        const img = node.querySelector(".preview-img");
        const placeholder = node.querySelector(".placeholder");
        img.src = `/outputs/${value}`;
        img.classList.remove("hidden");
        placeholder.classList.add("hidden");
        node.querySelector("#view-image-btn").disabled = false;
      } else if (key === "info") {
        node.querySelector("#image-info-text").textContent = value;
      } else if (key === "models" || key === "schedulers" || key === "loras") {
        const dropdownKey =
          key === "models"
            ? "model_name"
            : key === "loras"
              ? "lora_name"
              : "scheduler_name";
        const container = node.querySelector(
          `.custom-dropdown[data-key="${dropdownKey}"]`
        );
        if (container) createCustomDropdown(container, value, dropdownKey);
      } else {
        const input = node.querySelector(`[data-key="${key}"]`);
        if (input) {
          if (
            input.type === "range" ||
            input.type === "number" ||
            input.tagName === "TEXTAREA"
          ) {
            input.value = value;
            state.generationState[key] = value;
            if (input.type === "range") {
              const valueInput = node.querySelector(
                `input[data-value-for="${key}"]`
              );
              if (valueInput) valueInput.value = value;
              const percent =
                ((input.value - input.min) / (input.max - input.min)) * 100;
              input.style.backgroundSize = `${percent}% 100%`;
            }
            if (input.tagName === "TEXTAREA") {
              input.style.height = "auto";
              input.style.height = `${input.scrollHeight}px`;
            }
          }
        }
      }
    }
  }

  function setAspectRatio(ratio) {
    const node = state.nodes.get("parameters")?.el;
    if (!node) return;
    node
      .querySelectorAll(".aspect-ratio-btn")
      .forEach((b) => b.classList.remove("active"));
    node
      .querySelector(`.aspect-ratio-btn[data-ratio="${ratio}"]`)
      .classList.add("active");

    const isLandscape = ratio === "4:3";
    const isPortrait = ratio === "3:4";
    const width = state.generationState.width;
    const height = state.generationState.height;
    let newWidth, newHeight;

    if (isLandscape) {
      const smallerDim = Math.min(width, height);
      newWidth = Math.round((smallerDim * 4) / 3 / 64) * 64;
      newHeight = smallerDim;
    } else if (isPortrait) {
      const smallerDim = Math.min(width, height);
      newWidth = smallerDim;
      newHeight = Math.round((smallerDim * 4) / 3 / 64) * 64;
    } else {
      newWidth = newHeight = Math.min(width, height);
    }
    updateNodeUI("parameters", { width: newWidth, height: newHeight });
  }

  function initDock() {
    ui.node.dockButtons.forEach((button) => {
      const type = button.dataset.nodeType;
      if (["vae_tiling", "cpu_offload"].includes(type)) {
        button.addEventListener("click", () => {
          button.classList.toggle("active");
          state.generationState[type] = button.classList.contains("active");
        });
        if (state.generationState[type]) button.classList.add("active");
      } else {
        button.addEventListener("click", () => {
          if (button.classList.contains("active")) return;

          let x = Math.random() * 300;
          let y = Math.random() * 300 + 300;
          if (type === "input_image") {
            x = 0;
            y = 300; // Positioned higher to ensure visibility
          }

          createNode(type, x, y);
          button.classList.add("active");
          if (type === "lora") {
            updateNodeUI("lora", { loras: ["None", ...state.settings.loras] });
          }
        });
      }
    });

    ui.node.loadModelBtn.addEventListener("click", () => {
      if (state.isModelLoaded) {
        sendMessage("unload_model");
      } else {
        const { model_name, scheduler_name, vae_tiling, cpu_offload } =
          state.generationState;
        if (!model_name || model_name === "Select a model") {
          showNotification("Please select a model first.", "error", 3000);
          return;
        }
        sendMessage("load_model", {
          model_name,
          scheduler_name,
          vae_tiling,
          cpu_offload,
          lora_name: state.generationState.lora_name,
        });
      }
    });

    ui.node.generateBtn.addEventListener("click", () => {
      if (!state.isModelLoaded) {
        showNotification("No model is loaded.", "error", 3000);
        return;
      }
      const payload = { ...state.generationState };
      if (payload.seed === -1) {
        payload.seed = Math.floor(Math.random() * 2 ** 32);
        updateNodeUI("parameters", { seed: payload.seed });
      }
      sendMessage("generate_image", payload);
    });
  }

  async function loadPrompts() {
    try {
      const response = await fetch("/api/prompts");
      state.prompts = await response.json();
      populatePromptBook(state.prompts);
    } catch (e) {
      showNotification("Could not load prompts.", "error", 3000);
    }
  }

  function populatePromptBook(prompts) {
    ui.promptBook.grid.innerHTML = "";
    const hasPrompts = prompts && prompts.length > 0;
    ui.promptBook.placeholder.classList.toggle("hidden", !hasPrompts);
    if (hasPrompts) {
      prompts.forEach((p, index) => {
        const item = document.createElement("div");
        item.className = "prompt-card";
        item.innerHTML = `
          <div class="prompt-card-header">
            <h3 class="prompt-card-title">${p.title}</h3>
            <div class="prompt-card-actions">
              <button class="icon-btn" data-action="edit" data-index="${index}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
              <button class="icon-btn" data-action="delete" data-index="${index}" title="Delete"><span class="material-symbols-outlined">delete</span></button>
            </div>
          </div>
          <p class="prompt-card-content">${p.prompt}</p>
          <div class="prompt-card-footer">
            <button class="btn btn-primary" data-action="use" data-index="${index}"><span class="material-symbols-outlined">add_task</span> Use Prompt</button>
          </div>`;
        ui.promptBook.grid.appendChild(item);
      });
    }
  }

  function openPromptEditor(promptData = null) {
    const isEditing = promptData !== null;
    ui.promptBook.editor.title.textContent = isEditing
      ? "Edit Prompt"
      : "Add New Prompt";
    ui.promptBook.editor.titleInput.value = isEditing ? promptData.title : "";
    ui.promptBook.editor.promptInput.value = isEditing ? promptData.prompt : "";
    ui.promptBook.editor.negativeInput.value = isEditing
      ? promptData.negative_prompt
      : "";
    ui.promptBook.editor._oldTitle = isEditing ? promptData.title : null;

    const saveBtn = `<button id="save-prompt-btn" class="btn btn-primary">Save</button>`;
    const cancelBtn = `<button id="cancel-prompt-btn" class="btn btn-secondary">Cancel</button>`;
    ui.promptBook.editor.buttons.innerHTML = cancelBtn + saveBtn;

    ui.promptBook.editor.overlay.classList.remove("hidden");
    ui.promptBook.editor.titleInput.focus();

    document
      .getElementById("save-prompt-btn")
      .addEventListener("click", savePrompt);
    document
      .getElementById("cancel-prompt-btn")
      .addEventListener("click", () =>
        ui.promptBook.editor.overlay.classList.add("hidden")
      );
  }

  function handlePromptBookClick(e) {
    const button = e.target.closest("button[data-action]");
    if (!button) return;
    const { action, index } = button.dataset;
    const prompt = state.prompts[index];
    if (action === "use") {
      updateNodeUI("prompt", {
        prompt: prompt.prompt,
        negative_prompt: prompt.negative_prompt,
      });
      showNotification(`Loaded prompt: ${prompt.title}`, "success", 2000);
      ui.navLinks[0].click();
    } else if (action === "edit") {
      openPromptEditor(prompt);
    } else if (action === "delete") {
      showDialog(
        "Delete Prompt",
        `Are you sure you want to delete "${prompt.title}"?`,
        [
          { text: "Cancel" },
          {
            text: "Delete",
            class: "btn-danger",
            callback: () => deletePrompt(prompt.title),
          },
        ]
      );
    }
  }

  async function savePrompt() {
    const old_title = ui.promptBook.editor._oldTitle;
    const prompt = {
      new_title: ui.promptBook.editor.titleInput.value.trim(),
      prompt: ui.promptBook.editor.promptInput.value.trim(),
      negative_prompt: ui.promptBook.editor.negativeInput.value.trim(),
    };
    if (!prompt.new_title || !prompt.prompt) {
      showNotification("Title and Prompt are required.", "error");
      return;
    }

    const isEditing = old_title !== null;
    const url = "/api/prompts";
    const method = isEditing ? "PUT" : "POST";
    const body = isEditing ? { old_title, ...prompt } : prompt;

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.success) {
        showNotification(
          `Prompt ${isEditing ? "updated" : "saved"}!`,
          "success"
        );
        ui.promptBook.editor.overlay.classList.add("hidden");
        loadPrompts();
      } else {
        showNotification("A prompt with that title already exists.", "error");
      }
    } catch (e) {
      showNotification("Error saving prompt.", "error");
    }
  }

  async function deletePrompt(title) {
    try {
      const response = await fetch("/api/prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = await response.json();
      if (result.success) {
        showNotification("Prompt deleted.", "success");
        loadPrompts();
      } else {
        showNotification("Error deleting prompt.", "error");
      }
    } catch (e) {
      showNotification("Error deleting prompt.", "error");
    }
  }

  function setupEventListeners() {
    ui.themeToggle.addEventListener("click", toggleTheme);
    ui.restartBtn.addEventListener("click", () =>
      sendMessage("restart_backend")
    );
    ui.clearCacheBtn.addEventListener("click", () =>
      sendMessage("clear_cache")
    );

    ui.navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = `page-${link.dataset.target}`;
        document
          .querySelectorAll(".page-content")
          .forEach((p) => p.classList.add("hidden"));
        document.getElementById(targetId).classList.remove("hidden");
        ui.navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        if (targetId === "page-gallery") {
          ui.gallery.refreshBtn.click();
        }
        if (targetId === "page-prompt-book") loadPrompts();
        if (targetId === "page-settings") {
          sendMessage("get_settings_data");
        }
      });
    });

    ui.gallery.refreshBtn.addEventListener("click", () => {
      fetch("/api/gallery")
        .then((res) => res.json())
        .then((data) => populateGallery(data.images));
    });

    ui.promptBook.refreshBtn.addEventListener("click", loadPrompts);
    ui.promptBook.addBtn.addEventListener("click", () => openPromptEditor());
    ui.promptBook.grid.addEventListener("click", handlePromptBookClick);

    ui.settings.refreshModelsBtn.addEventListener("click", () =>
      sendMessage("get_settings_data")
    );
    ui.settings.refreshLorasBtn.addEventListener("click", () =>
      sendMessage("get_settings_data")
    );

    ui.lightbox.closeBtn.addEventListener("click", closeLightbox);
    ui.lightbox.nextBtn.addEventListener("click", () =>
      showLightboxImage(
        (state.currentLightboxIndex + 1) % state.galleryImages.length
      )
    );
    ui.lightbox.prevBtn.addEventListener("click", () =>
      showLightboxImage(
        (state.currentLightboxIndex - 1 + state.galleryImages.length) %
        state.galleryImages.length
      )
    );
    ui.lightbox.zoomInBtn.addEventListener("click", () => {
      state.zoomLevel = Math.min(5, state.zoomLevel * 1.2);
      updateImageTransform();
    });
    ui.lightbox.zoomOutBtn.addEventListener("click", () => {
      state.zoomLevel = Math.max(0.2, state.zoomLevel / 1.2);
      updateImageTransform();
    });
    ui.lightbox.fitBtn.addEventListener("click", resetZoomAndPan);
    ui.lightbox.deleteBtn.addEventListener("click", () => {
      const filename = state.galleryImages[state.currentLightboxIndex].filename;
      showDialog(
        "Confirm Deletion",
        `Delete <strong>${filename}</strong>? This cannot be undone.`,
        [
          { text: "Cancel" },
          {
            text: "Delete",
            class: "btn-danger",
            callback: () => sendMessage("delete_image", { filename }),
          },
        ]
      );
    });
    ui.lightbox.imageWrapper.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      state.isPanning = true;
      state.panStart = {
        x: e.clientX - state.panCurrent.x,
        y: e.clientY - state.panCurrent.y,
      };
      ui.lightbox.imageWrapper.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", (e) => {
      if (!state.isPanning) return;
      state.panCurrent.x = e.clientX - state.panStart.x;
      state.panCurrent.y = e.clientY - state.panStart.y;
      updateImageTransform();
    });
    document.addEventListener("mouseup", () => {
      state.isPanning = false;
      ui.lightbox.imageWrapper.style.cursor = "grab";
    });
    ui.lightbox.imageWrapper.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.deltaY < 0) ui.lightbox.zoomInBtn.click();
      else ui.lightbox.zoomOutBtn.click();
    });
  }

  async function init() {
    initTheme();
    connectWebSocket();
    setupEventListeners();
    initCanvasInteraction();
    initDock();

    try {
      const response = await fetch("/api/config");
      const config = await response.json();
      state.settings.models = config.models;
      state.settings.loras = config.loras;
      populateGallery(config.gallery_images);
      state.prompts = config.prompts;
      populatePromptBook(config.prompts);

      const nodeSpacing = 40;
      const nodeWidth = 320;
      let currentX = 0;

      createNode("model_sampler", currentX, 150);
      currentX += nodeWidth + nodeSpacing;

      createNode("prompt", currentX, 50);
      currentX += nodeWidth + nodeSpacing;

      createNode("parameters", currentX, 0);
      currentX += nodeWidth + nodeSpacing;

      createNode("image_preview", currentX, 150);

      updateNodeUI("model_sampler", {
        models: config.models,
        schedulers: config.schedulers,
      });

      centerView();
    } catch (error) {
      console.error("Failed to fetch initial config:", error);
      showNotification(
        "Could not load configuration from the server.",
        "error",
        5000
      );
    }
  }

  init();
});