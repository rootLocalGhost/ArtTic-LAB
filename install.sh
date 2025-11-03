#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
ENV_NAME="ArtTic-LAB"
PYTHON_VERSION="3.11"

# --- Colors for better output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Subroutines / Functions ---

find_conda() {
    # This robustly finds Conda by checking common paths and initializing the shell.
    # It will prompt the user if multiple installations are found.
    echo -e "[INFO] Searching for Conda installation..."

    # 1. Best case: Conda is already available in the shell
    if command -v conda &> /dev/null; then
        echo -e "${GREEN}[SUCCESS] Conda is already initialized in this shell.${NC}"
        # Initialize for the current script session
        eval "$(conda shell.bash hook)"
        return 0
    fi

    # 2. Search for Conda installations and store their paths
    declare -a conda_paths
    # Common user paths
    [ -f "$HOME/miniconda3/bin/conda" ]   && conda_paths+=("$HOME/miniconda3")
    [ -f "$HOME/anaconda3/bin/conda" ]    && conda_paths+=("$HOME/anaconda3")
    [ -f "$HOME/miniforge3/bin/conda" ]   && conda_paths+=("$HOME/miniforge3")
    # Common system paths
    [ -f "/opt/miniconda3/bin/conda" ]    && conda_paths+=("/opt/miniconda3")
    [ -f "/opt/anaconda3/bin/conda" ]     && conda_paths+=("/opt/anaconda3")
    [ -f "/opt/miniforge3/bin/conda" ]    && conda_paths+=("/opt/miniforge3")

    local conda_count=${#conda_paths[@]}

    # 3. Process the findings
    if [ "$conda_count" -eq 0 ]; then
        return 1 # Failure
    fi

    local conda_path
    if [ "$conda_count" -eq 1 ]; then
        # Exactly one installation found, use it automatically
        conda_path="${conda_paths[0]}"
        echo -e "${GREEN}[SUCCESS] Found single Conda installation at: ${conda_path}${NC}"
    else
        # Multiple installations found, prompt user to choose
        echo -e "\n${YELLOW}[WARNING] Multiple Conda installations detected. Please choose which one to use:${NC}"
        for i in "${!conda_paths[@]}"; do
            echo "  $((i+1)). ${conda_paths[$i]}"
        done
        echo ""

        local choice
        while true; do
            read -p "Enter your choice (1-${conda_count}): " choice
            if [[ "$choice" -ge 1 && "$choice" -le "$conda_count" ]]; then
                conda_path="${conda_paths[$((choice-1))]}"
                echo -e "[INFO] You selected: ${conda_path}"
                break
            else
                echo -e "${RED}Invalid choice. Please try again.${NC}"
            fi
        done
    fi

    # 4. Initialize the chosen Conda environment
    local conda_executable="${conda_path}/bin/conda"
    if [ ! -f "$conda_executable" ]; then
        echo -e "${RED}[ERROR] Could not find 'conda' executable in the selected path: ${conda_path}${NC}"
        return 1
    fi
    echo -e "[INFO] Initializing Conda from: ${conda_path}"
    # The 'eval' command correctly sets up Conda for the rest of the script
    eval "$($conda_executable shell.bash hook)"
}

create_environment() {
    echo -e "\n-------------------------------------------------------"
    echo -e "[INFO] Creating Conda environment with Python ${PYTHON_VERSION}..."
    echo -e "-------------------------------------------------------"
    
    echo -e "[INFO] Removing any previous version of '${ENV_NAME}'..."
    # Suppress output, we don't care if it fails (doesn't exist)
    conda env remove --name "${ENV_NAME}" -y &>/dev/null || true
    
    echo -e "[INFO] Creating new Conda environment..."
    conda create --name "${ENV_NAME}" python=${PYTHON_VERSION} -y
}

handle_hf_login() {
    echo -e "\n-------------------------------------------------------"
    echo -e "${YELLOW}[ACTION REQUIRED] Hugging Face Login${NC}"
    echo -e "-------------------------------------------------------"
    echo "Models like SD3 and FLUX require you to be logged into"
    echo "your Hugging Face account to download base files."
    echo ""

    read -p "Would you like to log in now? (y/n): " login_choice
    if [[ "${login_choice,,}" == "y" ]]; then
        echo ""
        echo -e "[INFO] Please get your Hugging Face User Access Token here:"
        echo -e "       https://huggingface.co/settings/tokens"
        echo -e "[INFO] The token needs at least 'read' permissions."
        echo ""
        huggingface-cli login
        echo ""
        echo -e "${YELLOW}[IMPORTANT] Remember to visit the model pages on the"
        echo -e "Hugging Face website to accept their license agreements:${NC}"
        echo -e "- SD3: https://huggingface.co/stabilityai/stable-diffusion-3-medium-diffusers"
        echo -e "- FLUX: https://huggingface.co/black-forest-labs/FLUX.1-dev"
        echo ""
    else
        echo ""
        echo -e "[INFO] Skipping Hugging Face login."
        echo -e "You can log in later by opening a terminal, running"
        echo -e "'conda activate ${ENV_NAME}' and then 'huggingface-cli login'."
        echo -e "${YELLOW}Note: SD3 and FLUX models will not work until you do.${NC}"
    fi
}

# --- Main Script ---
clear
echo "======================================================="
echo "            ArtTic-LAB Installer for Linux"
echo "======================================================="
echo ""
echo "This script will find your Conda installation and prepare"
echo "the '${ENV_NAME}' environment."
echo ""

# 1. Find and initialize Conda
if ! find_conda; then
    echo -e "${RED}[ERROR] Conda installation not found. Please ensure Miniconda, Anaconda, or Miniforge is installed.${NC}"
    exit 1
fi

# 2. Handle environment creation
echo ""
echo -e "[INFO] Checking for existing '${ENV_NAME}' environment..."
if conda env list | grep -E "^${ENV_NAME} " &>/dev/null; then
    echo -e "${YELLOW}[WARNING] Environment '${ENV_NAME}' already exists.${NC}"
    read -p "Do you want to remove and reinstall it? (y/n): " reinstall
    if [[ "${reinstall,,}" != "y" ]]; then
        echo -e "[INFO] Skipping environment creation. Will update packages."
    else
        create_environment
    fi
else
    create_environment
fi

# 3. Activate environment and install packages
echo ""
echo -e "[INFO] Activating environment and installing/updating dependencies..."
echo "This is the longest step. Please be patient."
conda activate "${ENV_NAME}"

echo -e "[INFO] Upgrading pip..."
python -m pip install --upgrade pip --quiet

echo ""
echo "Please select your hardware for PyTorch installation:"
echo "  1. NVIDIA (CUDA)"
echo "  2. Intel GPU (XPU) - Experimental on Linux"
echo "  3. CPU only"
echo ""
read -p "Enter your choice (1, 2, or 3): " hardware_choice

case "$hardware_choice" in
    1)
        # For Linux, it's often better to specify the CUDA version via conda or find-links
        # This generic command works for recent CUDA toolkits.
        pip install torch torchvision torchaudio
        ;;
    2)
        pip install torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/xpu
        pip install intel-extension-for-pytorch==2.8.10+xpu --extra-index-url https://pytorch-extension.intel.com/release-whl/stable/xpu/us/
        ;;
    3)
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
        pip install intel-extension-for-pytorch --extra-index-url https://pytorch-extension.intel.com/release-whl/stable/cpu/us/
        ;;
    *)
        echo -e "${RED}[ERROR] Invalid choice. Aborting.${NC}"
        exit 1
        ;;
esac

echo -e "[INFO] Installing other dependencies from requirements.txt..."
pip install -r requirements.txt

# 4. Install Web UI dependencies
echo ""
echo -e "[INFO] Installing Web UI dependencies..."
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}[WARNING] npm (Node.js) is not installed or not in your PATH.${NC}"
    echo -e "Skipping automatic installation of UI icon packages."
    echo -e "The UI will still work but will fetch icons from the web."
else
    (cd web && npm install)
fi

# 5. Handle Hugging Face Login
handle_hf_login

echo ""
echo "======================================================="
echo -e "${GREEN}[SUCCESS] Installation complete!${NC}"
echo "You can now run 'start.sh' to launch ArtTic-LAB."
echo "======================================================="
echo ""
exit 0