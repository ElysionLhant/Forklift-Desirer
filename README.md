# Forklift Desirer - 高仿真集装箱装载优化系统

Forklift Desirer 是一个基于 React + Three.js 的 3D 集装箱装载可视化与规划系统。它不仅仅是一个空间堆叠工具，更是一个深度集成**物流实操规范（Real-world Logistics Constraints）**的智能决策系统。

本系统支持 **Local AI (Ollama)**，确保数据隐私的同时提供智能装箱单识别与建议。

##  核心仿真与实操逻辑 (Real-world Feasibility)

为了确保生成的装载方案在码头和仓库具有 100% 的可执行性，我们实施了严格的物理限制：

### 1. 叉车高机动性仿真 (Skilled Forklift Operation)
*   **逻辑**：现实中熟练的叉车工可以通过侧移器（Side Shifter）和斜向进叉来将货物推入狭窄空间。
*   **约束**：算法模拟了标准 1.1米宽叉车的物理碰撞体积，但引入了 **50cm 的侧移能力** (Side Shift) 和极小的离墙间隙 (2cm Wall Buffer)。这意味着系统能在不违反物理法则的前提下，实现极高密度的装载（Squeezing boxes in）。

### 2. 同类货物吸附 (Cargo Group Affinity)
*   **逻辑**：为了便于运输加固（如打三角木）和卸货，同一种类的货物应尽可能靠在一起，而不是分散在集装箱两侧。
*   **约束**：装箱算法包含吸附机制，优先将相同 `Cargo ID` 的货物放置在相邻位置，即使这在数学上不是 Z 轴最小值。这有效地解决了同类货被拆分到左右两边的问题，形成了整齐的货物区块。

### 3. 物理通道与避障 (Access Path & Obstacles)
*   **逻辑**：货物必须能从集装箱门口一直推送到目标位置，路径上不能有障碍物。
*   **约束**：系统实时计算叉车底盘和货叉的扫过路径。如果路径被先前的货物阻挡，该位置将被视为不可达。

### 4. 真实作业时序 (Sequential Operation)
*   **逻辑**：模拟单台叉车的连续作业。
*   **可视化**：3D 动画展示从进箱、举升、侧移、放置到退出的完整过程，包括货叉为了避开下层货物而进行的抬高平推动作。

##  智能 AI 集成 (Local AI Native)

本系统彻底重构了 AI 服务层，优先支持本地化运行，并引入了更精准的数据交互模式：

*   **双模式智能判定 (Dual-Mode Intelligence)**：系统会自动识别用户意图。如果输入包含货物数据，系统将自动切换至**数据提取模式 (Data Extraction Mode)**，进行严格的 JSON 格式化提取；如果用户进行物流咨询，则切换至**专家顾问模式 (Advisor Mode)**。
*   **外部 LLM 协作 (External LLM Support)**：
    *   **复制定义 (Copy Prompt)**：对于没有本地强力模型或无 API 的用户，提供一键复制 "System Prompt" 功能。您可以将此 Prompt 发送给 ChatGPT/Claude 等外部最强模型。
    *   **手动导入 (Manual Import)**：支持将外部模型生成的 JSON 直接粘贴回系统，立刻生成可视化方案。
*   **Local AI (Ollama)**：默认支持连接本地 Ollama 服务（自动检测模型，如 `llama3`, `qwen` 等）。无数据上传风险，零 API 成本。
*   **OpenAI Compatible**：同时支持任何兼容 OpenAI 接口的云端或本地服务（如 LM Studio）。
*   **功能**：AI 用于自然语言处理，包括解析混乱的装箱单文本、转换尺寸单位、提取货物元数据等。

##  技术栈 (Tech Stack)

*   **Frontend**: React, Vite, TypeScript
*   **3D Engine**: Three.js, @react-three/fiber, @react-three/drei
*   **Algorithm**: 带有物理约束的启发式 3D 装箱算法 (Heuristic 3D Bin Packing with Constraints)
*   **State Management**: React Hooks + Context
*   **Styling**: Tailwind CSS

##  快速开始 (Quick Start)

### 环境依赖
*   Node.js (v16+)
*   Ollama (可选，用于本地 AI 功能)

### 安装与运行

1.  **克隆项目**
    ```bash
    git clone <repo_url>
    cd Forklift-Desirer
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **启动开发服务器**
    ```bash
    npm run dev
    ```
    访问 `http://localhost:5173` 即可使用。本系统完全在本地运行 (Localhost Only)，无需外部网络连接。

4.  **启动本地 AI (可选)**
    确保 Ollama 已安装并运行（默认监听 `localhost:11434`）：
    ```bash
    ollama serve
    # 并在设置中把 Model Provider 切换为 Local (Ollama)
    ```

##  使用建议

1.  **添加货物**：手动输入或通过 AI 聊天窗口粘贴装箱单文本。
2.  **3D 交互**：
    *   左键旋转，右键平移，滚轮缩放。
    *   **Edges**：开启了边缘显示，更清晰地分辨堆叠的货物。
3.  **设置与调优**：
    *   点击右上角设置图标配置 AI 模型。
    *   调整集装箱尺寸以适配不同柜型（20GP, 40HQ 等）。
