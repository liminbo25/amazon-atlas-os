# Amazon Atlas OS

统一的亚马逊运营门户，当前整合了 3 个模块：

- `图片工坊`：服装图 + 模特图批量试穿，支持超分增强
- `Listing 工坊`：竞品分析、VOC 洞察、文案生成、导出
- `视频工坊`：本地视频拆解、脚本改写、视频生成任务编排

## 目录结构

- `app/`：统一的 Next.js 前端与 Node API 路由
- `components/`：跨模块 UI 与模块组件
- `lib/`：状态、工具函数、视频模块数据归一化
- `video-backend/`：保留的 FastAPI 视频后端，方便继续独立部署

## 本地启动

### 1. 安装前端依赖

```powershell
cd "D:\亚马逊总工具"
npm install
```

### 2. 配置前端环境变量

复制 `.env.example` 为 `.env.local`，按需填入：

- `GEMINI_API_KEY`
- `REPLICATE_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `SELLERSPRITE_SECRET_KEY`
- `NEXT_PUBLIC_VIDEO_API_BASE_URL`

### 3. 启动统一前端

```powershell
cd "D:\亚马逊总工具"
npm run dev
```

### 4. 启动视频后端

```powershell
cd "D:\亚马逊总工具"
npm run dev:video-backend
```

默认情况下，视频模块会读取 `NEXT_PUBLIC_VIDEO_API_BASE_URL` 指向的视频后端地址。

## 部署

详细部署流程见：

- `docs/deployment-guide.md`

## 重要说明

- 图片模块和 Listing 模块适合直接随 Next.js 项目一起部署到 Vercel。
- 视频模块前端已整合进统一门户，但现有视频分析后端依赖 Python、OpenCV、Whisper，不适合直接塞进 Vercel 的免费前端部署链路。
- 最稳的做法是：前端走 `GitHub + Vercel`，视频后端单独部署或先本地运行。
