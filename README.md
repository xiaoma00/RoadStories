# RoadStories

AI 智能伴游应用 - 让你的自驾之旅充满故事与惊喜

RoadStories 是一款基于人工智能的智能旅游伴侣应用，通过输入目的地，AI 会为你规划一条充满故事的自驾路线，为每个景点生成专业的音频讲解、精美图片和互动地图，让你的旅程不再单调。

## ✨ 主要功能

### 🚗 智能路线规划
- 输入任意地点，AI 自动生成 3-5 个精选景点
- 支持中文和英文地点搜索
- 智能自动补全地点建议

### 🎧 沉浸式音频体验
- 为每个景点生成专业的中文音频讲解
- 支持播放/暂停/上一站/下一站控制
- 高质量 TTS 语音合成

### 🖼️ AI 生成视觉内容
- 为每个景点自动生成精美概念艺术图片
- 旅行主题的艺术风格渲染

### 🗺️ 互动地图导航
- 集成 Leaflet 地图显示所有景点
- 点击地图标记切换景点
- 深色主题地图界面

### 🔍 深度探索功能
- **扩展路线**：自动搜索周边更多景点，扩大探索范围
- **深度挖掘**：获取景点的历史背景、神秘传说等深度内容
- **GPS 模式**：自动播放下一站讲解

### 💰 实用信息
- 显示景点门票信息（免费/收费/预约等）
- 收费景点特别标注提醒

## 🛠️ 技术栈

- **前端框架**: React 18+
- **UI 组件**: Lucide React 图标
- **地图**: Leaflet (动态加载)
- **AI 服务**: Google Gemini API
  - 文本生成 (gemini-2.5-flash-preview-09-2025)
  - 语音合成 (gemini-2.5-flash-preview-tts)
  - 图像生成 (imagen-4.0-generate-001)
- **样式**: Tailwind CSS (假设使用)

## 📋 环境要求

- Node.js 16+
- npm 或 yarn
- Google AI API Key (需要启用 Gemini API 和 Imagen API)

## 🚀 安装与运行

1. **克隆项目**
   ```bash
   git clone https://github.com/xiaoma00/RoadStories.git
   cd RoadStories
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```
   
   应用将在 http://localhost:5173 启动

4. **构建生产版本**
   ```bash
   npm run build
   ```

5. **预览生产版本**
   ```bash
   npm run preview
   ```

## 📖 使用指南

1. **开始旅程**
   - 在搜索框输入目的地（如："杭州西湖"、"Tokyo Tower"）
   - 点击"出发"或按回车开始

2. **浏览景点**
   - 使用播放控制按钮收听讲解
   - 查看 AI 生成的景点图片
   - 切换到地图视图查看位置

3. **扩展探索**
   - 点击"探索周边更多景点"添加新站点
   - 使用"深度挖掘"了解更多历史故事

4. **地图导航**
   - 在地图模式下点击景点标记切换
   - 支持 GPS 模式自动播放

## 🔑 API 配置

应用已预配置 Google AI API Key，可以直接使用。如需自定义 API Key：

1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey) 获取 API Key
2. 在应用中点击设置按钮 (⚙️) 输入你的自定义 API Key

### 所需服务：
- **Gemini API**: 用于生成旅游路线和文本内容
- **Gemini TTS API**: 用于语音合成
- **Imagen API**: 用于生成景点图片

请确保你的 API Key 已启用这些服务，并有足够的配额。

## 🎨 界面特色

- **深色主题**: 护眼的深色界面设计
- **响应式布局**: 支持桌面和移动设备
- **流畅动画**: 现代化的过渡效果
- **直观操作**: 简洁的用户界面

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- Google Gemini AI - 强大的 AI 能力支持
- Leaflet - 开源地图库
- Lucide React - 精美的图标库
