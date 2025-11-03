#!/bin/bash
# ArtTic-LAB Launcher for Linux/macOS

# --- Configuration ---
ENV_NAME="ArtTic-LAB"

# --- Colors ---
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Subroutine to find Conda installation ---
find_conda() {
    if command -v conda &> /dev/null; then
        CONDA_BASE_PATH=$(conda info --base)
        return 0
    fi
    local common_paths=(
        "$HOME/miniconda3" "$HOME/anaconda3" "$HOME/miniforge3"
        "/opt/miniconda3" "/opt/anaconda3" "/opt/miniforge3"
    )
    for path in "${common_paths[@]}"; do
        if [ -f "$path/bin/conda" ]; then
            CONDA_BASE_PATH="$path"
            return 0
        fi
    done
    return 1
}

# --- Main Script ---
echo -e "${CYAN}[INFO] Preparing to launch ArtTic-LAB...${NC}"

# 1. Find and Initialize Conda
if ! find_conda; then
    echo -e "${RED}[ERROR] Conda installation not found.${NC}" >&2
    echo "Please ensure Miniconda, Anaconda, or Miniforge is installed and run install.sh." >&2
    exit 1
fi
echo -e "${CYAN}[INFO] Conda found at: ${YELLOW}${CONDA_BASE_PATH}${NC}"

source "${CONDA_BASE_PATH}/etc/profile.d/conda.sh"
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to initialize the Conda command environment.${NC}" >&2
    echo "Your Conda installation might be corrupted." >&2
    exit 1
fi

# 2. Verify and Activate Environment
echo -e "${CYAN}[INFO] Checking for '${ENV_NAME}' environment...${NC}"
if ! conda env list | grep -q "^${ENV_NAME} "; then
    echo -e "${RED}[ERROR] The '${ENV_NAME}' environment was not found.${NC}" >&2
    echo "Please run './install.sh' first to set it up." >&2
    exit 1
fi

echo -e "${CYAN}[INFO] Activating environment...${NC}"
conda activate "${ENV_NAME}"
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to activate the '${ENV_NAME}' environment.${NC}" >&2
    echo "Please try running './install.sh' again." >&2
    exit 1
fi

# 3. Launch the Application
echo -e "${GREEN}[SUCCESS] Environment activated. Launching application...${NC}"
echo
echo "======================================================="
echo "             Launching ArtTic-LAB"
echo "======================================================="
echo

python app.py "$@"

echo
echo "======================================================="
echo "ArtTic-LAB has closed."
echo "======================================================="
echo

exit 0