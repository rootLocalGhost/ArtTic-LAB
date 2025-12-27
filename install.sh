#!/bin/bash

set -e

ENV_NAME="ArtTic-LAB"
PYTHON_VERSION="3.11"

find_conda() {
    echo "[INFO] Searching for Conda installation..."

    if command -v conda &> /dev/null; then
        echo "[SUCCESS] Conda is already initialized in this shell."
        eval "$(conda shell.bash hook)"
        return 0
    fi

    declare -a conda_paths
    [ -f "$HOME/miniconda3/bin/conda" ]   && conda_paths+=("$HOME/miniconda3")
    [ -f "$HOME/anaconda3/bin/conda" ]    && conda_paths+=("$HOME/anaconda3")
    [ -f "$HOME/miniforge3/bin/conda" ]   && conda_paths+=("$HOME/miniforge3")
    [ -f "/opt/miniconda3/bin/conda" ]    && conda_paths+=("/opt/miniconda3")
    [ -f "/opt/anaconda3/bin/conda" ]     && conda_paths+=("/opt/anaconda3")
    [ -f "/opt/miniforge3/bin/conda" ]    && conda_paths+=("/opt/miniforge3")

    local conda_count=${#conda_paths[@]}

    if [ "$conda_count" -eq 0 ]; then
        return 1
    fi

    local conda_path
    if [ "$conda_count" -eq 1 ]; then
        conda_path="${conda_paths[0]}"
        echo "[SUCCESS] Found single Conda installation at: ${conda_path}"
    else
        echo ""
        echo "[WARNING] Multiple Conda installations detected. Please choose which one to use:"
        for i in "${!conda_paths[@]}"; do
            echo "  $((i+1)). ${conda_paths[$i]}"
        done
        echo ""

        local choice
        while true; do
            read -p "Enter your choice (1-${conda_count}): " choice
            if [[ "$choice" -ge 1 && "$choice" -le "$conda_count" ]]; then
                conda_path="${conda_paths[$((choice-1))]}"
                echo "[INFO] You selected: ${conda_path}"
                break
            else
                echo "[ERROR] Invalid choice. Please try again."
            fi
        done
    fi

    local conda_executable="${conda_path}/bin/conda"
    if [ ! -f "$conda_executable" ]; then
        echo "[ERROR] Could not find 'conda' executable in the selected path: ${conda_path}"
        return 1
    fi
    echo "[INFO] Initializing Conda from: ${conda_path}"
    eval "$($conda_executable shell.bash hook)"
}

create_environment() {
    echo ""
    echo "-------------------------------------------------------"
    echo "[INFO] Creating Conda environment with Python ${PYTHON_VERSION}..."
    echo "-------------------------------------------------------"
    
    echo "[INFO] Removing any previous version of '${ENV_NAME}'..."
    conda env remove --name "${ENV_NAME}" -y &>/dev/null || true
    
    echo "[INFO] Creating new Conda environment..."
    conda create --name "${ENV_NAME}" python=${PYTHON_VERSION} -y
}

handle_hf_login() {
    echo ""
    echo "-------------------------------------------------------"
    echo "[ACTION REQUIRED] Hugging Face Login"
    echo "-------------------------------------------------------"
    echo "Models like SD3 and FLUX require you to be logged into"
    echo "your Hugging Face account to download base files."
    echo ""

    read -p "Would you like to log in now? (y/n): " login_choice
    if [[ "${login_choice,,}" == "y" ]]; then
        echo ""
        echo "[INFO] Please get your Hugging Face User Access Token here:"
        echo "       https://huggingface.co/settings/tokens"
        echo "[INFO] The token needs at least 'read' permissions."
        echo ""
        huggingface-cli login
        echo ""
        echo "[IMPORTANT] Remember to visit the model pages on the"
        echo "Hugging Face website to accept their license agreements:"
        echo "- SD3: https://huggingface.co/stabilityai/stable-diffusion-3-medium-diffusers"
        echo "- FLUX: https://huggingface.co/black-forest-labs/FLUX.1-dev"
        echo ""
    else
        echo ""
        echo "[INFO] Skipping Hugging Face login."
        echo "You can log in later by opening a terminal, running"
        echo "'conda activate ${ENV_NAME}' and then 'huggingface-cli login'."
        echo "Note: SD3 and FLUX models will not work until you do."
    fi
}

clear
echo "======================================================="
echo "            ArtTic-LAB Installer for Linux"
echo "======================================================="
echo ""
echo "This script will find your Conda installation and prepare"
echo "the '${ENV_NAME}' environment."
echo ""

if ! find_conda; then
    echo "[ERROR] Conda installation not found. Please ensure Miniconda, Anaconda, or Miniforge is installed."
    exit 1
fi

echo ""
echo "[INFO] Checking for existing '${ENV_NAME}' environment..."
if conda env list | grep -E "^${ENV_NAME} " &>/dev/null; then
    echo "[WARNING] Environment '${ENV_NAME}' already exists."
    read -p "Do you want to remove and reinstall it? (y/n): " reinstall
    if [[ "${reinstall,,}" != "y" ]]; then
        echo "[INFO] Skipping environment creation. Will update packages."
    else
        create_environment
    fi
else
    create_environment
fi

echo ""
echo "[INFO] Activating environment and installing dependencies..."
echo "This is the longest step. Please be patient."
conda activate "${ENV_NAME}"

echo "[INFO] Upgrading pip..."
python -m pip install --upgrade pip --quiet

echo "[INFO] Installing base dependencies from requirements.txt..."
pip install -r requirements.txt

echo ""
echo "[INFO] Automatically detecting hardware for PyTorch installation..."
DETECT_COMMAND="from torchruntime.device_db import get_gpus; from torchruntime.platform_detection import get_torch_platform; print(get_torch_platform(get_gpus()))"
TORCH_PLATFORM=$(python -c "$DETECT_COMMAND")
if [ $? -ne 0 ]; then
    echo "[ERROR] torchruntime failed to detect hardware. Please check your drivers."
    exit 1
fi
echo "[INFO] Detected platform: ${TORCH_PLATFORM}"
echo "[INFO] Installing hardware-specific dependencies..."

case "$TORCH_PLATFORM" in
    xpu)
        # Note: torchaudio is excluded to avoid ffmpeg requirement on Linux
        pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/xpu
        pip install intel-extension-for-pytorch==2.8.10+xpu --extra-index-url https://pytorch-extension.intel.com/release-whl/stable/xpu/us/
        ;;
    cu*)
        # Note: torchaudio is excluded to avoid ffmpeg requirement on Linux
        pip install torch torchvision
        ;;
    *)
        # Note: torchaudio is excluded to avoid ffmpeg requirement on Linux
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
        pip install intel-extension-for-pytorch --extra-index-url https://pytorch-extension.intel.com/release-whl/stable/cpu/us/
        ;;
esac

echo ""
echo "[INFO] Installing Web UI dependencies..."
if ! command -v npm &> /dev/null; then
    echo "[WARNING] npm (Node.js) is not installed or not in your PATH."
    echo "Skipping automatic installation of UI icon packages."
    echo "The UI will still work but will fetch icons from the web."
else
    (cd web && npm install)
fi

handle_hf_login

echo ""
echo "======================================================="
echo "[SUCCESS] Installation complete!"
echo "You can now run 'start.sh' to launch ArtTic-LAB."
echo "======================================================="
echo ""
exit 0