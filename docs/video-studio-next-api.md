# 视频工坊 Next.js API 迁移说明

视频工坊现在默认使用项目内 Next.js API 路由，不再要求单独启动 `video-backend` FastAPI 服务。

## 默认调用链

- 前端页面：`app/video-studio`
- 组件：`components/video-studio/video-workbench.tsx`
- 归一化类型和前端解析：`lib/video-studio.ts`
- 服务层：`lib/video-studio-service.ts`
- API 路由：`app/api/video-studio/*`

路由清单：

- `GET /api/video-studio/models`：返回视频模型能力配置。
- `POST /api/video-studio/generation/tasks`：创建视频生成任务，占位保存参数和素材。
- `GET /api/video-studio/generation/tasks/:taskId`：读取任务状态。
- `POST /api/video-studio/upload-video`：上传视频、抽取关键帧、可选转写、可选视觉分析。
- `POST /api/video-studio/generate-copy`：基于 manifest 和表单生成视频脚本方案。
- `GET /api/video-studio/output/:path*`：读取当前运行环境保存的关键帧/任务素材。

## 环境变量

必填项取决于要使用的能力：

- `ANTHROPIC_API_KEY`：视频关键帧分析和脚本生成可使用；也可通过 `AI_PROVIDER=openai` 和 `OPENAI_API_KEY` 使用 OpenAI 兼容模型。
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`：Anthropic 或兼容网关配置。
- `AI_PROVIDER`：推荐设为 `openai`，让视频关键帧分析和脚本生成默认走 OpenAI-compatible 网关。
- `OPENAI_API_KEY`：视频关键帧分析、脚本生成，以及未单独配置时的音频转写都可使用。
- `OPENAI_BASE_URL`：OpenAI 兼容网关地址，默认 `https://api.openai.com`。如果线上要调用本机网关，必须先换成一个公网 HTTPS 桥接地址，不能直接写 `127.0.0.1`。
- `OPENAI_MODEL`：OpenAI 兼容文本/视觉模型，推荐 `gpt-5.4`。
- `OPENAI_TRANSCRIBE_API_KEY`：可选，单独给音频转写使用；只有未单独指定转写 base URL 时才会回退到 `OPENAI_API_KEY`。
- `OPENAI_TRANSCRIBE_BASE_URL`：可选，单独给音频转写使用；一旦单独设置，建议同时设置 `OPENAI_TRANSCRIBE_API_KEY`。
- `OPENAI_TRANSCRIBE_MODEL`：转写模型，默认 `whisper-1`。
- `VIDEO_OUTPUT_ROOT`：视频上传、关键帧和任务文件保存目录；本地默认 `.video-output`，Vercel 默认写入临时目录。
- `VIDEO_MAX_UPLOAD_MB`：单个视频上传大小上限，默认 `80`。

可选 legacy fallback：

- `NEXT_PUBLIC_VIDEO_API_BASE_URL`：如果设置，前端会优先走旧 FastAPI 服务；留空时使用项目内 `/api/video-studio/...`。

## 当前边界

- 抽帧已迁移到 Node 侧 `ffmpeg-static` / `ffprobe-static`。
- 转写已改为可选 OpenAI 音频转写；优先读取 `OPENAI_TRANSCRIBE_*`，只有未单独指定转写 base URL 时才会回退到 `OPENAI_*`。如果转写凭证仍缺失，则不会阻塞上传分析，用户可以手动补字幕。
- Runway / Kling / Veo 等真实供应商生成还未接入，当前生成任务会保存参数和素材，并返回明确的占位状态。
- Vercel serverless 文件系统不是长期存储；需要持久化任务和关键帧时，应接入对象存储或数据库。
