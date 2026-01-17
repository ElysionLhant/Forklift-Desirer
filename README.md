# Forklift Desirer - High-Fidelity Container Loading Optimization System

**Forklift Desirer** is a 3D container loading visualization and planning system based on **React + Three.js**. It goes beyond simple spatial stacking to serve as an intelligent decision-support system deeply integrated with **Real-world Logistics Constraints**.

The system supports **Local AI (Ollama)**, ensuring data privacy while providing intelligent packing list recognition and recommendations.

## Core Simulation & Operational Logic (Real-world Feasibility)

To ensure generated loading plans are 100% executable in terminals and warehouses, we enforce strict physical constraints:

### 1. Skilled Forklift Operation Simulation
*   **Logic**: Skilled operators use Side Shifters and diagonal entry to maneuver cargo into tight spaces.
*   **Constraints**: The algorithm simulates a standard 1.1m wide forklift collision volume but introduces **50cm Side Shift capability** and minimal **2cm Wall Buffer**. This allows the system to achieve high-density loading ("Squeezing boxes in") without violating physical laws.
*   **Optimization**: v0.1.0 introduces a **Spatial Grid** collision detection system, enabling instant calculations (O(N) performance) even with 2000+ objects.

### 2. Cargo Group Affinity
*   **Logic**: For easier securing (e.g., triangular chocks) and unloading, same-type cargo should stay grouped rather than scattered.
*   **Constraints**: The packing algorithm includes a "Loose Adhesion" mechanism—strict adhesion at the base, with relaxed mixed stacking at upper levels to balance stability and fill rate.

### 3. Physical Access Path & Obstacles
*   **Logic**: Cargo must be transportable from the container door to its target position without obstruction.
*   **Constraints**: The system calculates the sweep path of the forklift chassis and tines in real-time. If a path is blocked by previously placed cargo, the position is deemed unreachable.

### 4. Sequential Operation & Visualization
*   **Logic**: Simulates the continuous operation of a single forklift.
*   **Visualization**: Full 3D animation showing the process from entry, lifting, side-shifting, placement, to exit, including fork raising maneuvers to clear lower cargo.

## 3D Manual Operation (Manual Mode)

Forklift Desirer provides a powerful manual mode for fine-tuning your loading plan with physics-assisted interactions.

*   **Drag & Drop**: Left-click and drag items to move them within the container.
    *   **Physics Stacking**: Items will automatically "climb" onto other items if dragged over them, using real-time collision detection to prevent interpenetration.
    *   **Global Snapping**: Items snap to the edges of the container and other adjacent items (even across different containers) for precise alignment.
*   **Selection**:
    *   **Single Select**: Click an item to select it.
    *   **Multi-Select**: Hold `Ctrl` (Windows) or `Cmd` (Mac) and click items to add them to selection.
    *   **Box Selection**: Hold `Shift` and drag on the background (or over items) to draw a selection box.
    *   **Deselect**: Click on empty space to clear selection.
*   **Camera Controls**:
    *   **Rotate**: Middle Mouse Button drag / Left Click drag (on empty space).
    *   **Pan**: Right Mouse Button drag.
    *   **Zoom**: Mouse Wheel.

## Native Local AI Integration

The AI service layer is rebuilt to prioritize local execution with precise data interaction:

*   **Dual-Mode Intelligence**: Automatically detects user intent. It switches to **Data Extraction Mode** for cargo lists (strict JSON formatting) and **Advisor Mode** for logistics questions.
*   **External LLM Support**:
    *   **Copy Prompt**: For users without local models, copy the "System Prompt" to use with ChatGPT/Claude.
    *   **Manual Import**: Paste external model JSON output directly into the system for instant visualization.
*   **Local AI (Ollama)**: Supports local Ollama services (e.g., `llama3`, `qwen`). No data upload, zero cost.
*   **OpenAI Compatible**: Supports any OpenAI-compatible cloud or local service (e.g., LM Studio).
*   **Visual Recognition**: Drag and drop packing list images into the chat for automatic text/table extraction (requires multimodal model).

## Tech Stack

*   **Frontend**: React, Vite, TypeScript
*   **3D Engine**: Three.js, @react-three/fiber, @react-three/drei
*   **Desktop Shell**: Electron
*   **Algorithm**: Heuristic 3D Bin Packing with Constraints, Optimized Spatial Grid (O(N))
*   **State Management**: React Hooks + Context
*   **Styling**: Tailwind CSS

## Quick Start

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/your-repo/Forklift-Desirer.git
    cd Forklift-Desirer
    npm install
    ```
2.  **Dev Mode**:
    ```bash
    npm run dev
    # or for Electron
    npm run electron:dev
    ```
3.  **Build**:
    ```bash
    npm run build
    ```

## License

MIT
