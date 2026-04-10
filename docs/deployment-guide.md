# GitHub + Vercel 部署工作流

这套统一门户最适合的发布方式是：

1. 一个 GitHub 仓库存放统一代码
2. 一个 Vercel 项目发布统一前端
3. 视频后端独立部署或先本地运行

## 为什么这样设计

`图片工坊` 和 `Listing 工坊` 本质上都是 Next.js + Node API 路由，非常适合直接上 Vercel。

`视频工坊` 的前端已经被统一进门户，但当前后端依赖：

- `FastAPI`
- `opencv-python-headless`
- `faster-whisper`

这类能力更适合独立服务，不建议硬塞进 Vercel 免费前端部署。

## 第一步：准备 GitHub 仓库

1. 注册并登录 GitHub
2. 创建一个新的 Repository
3. 复制仓库 URL

如果你已经在本地初始化了这个统一仓库，后续只需要：

```powershell
cd "D:\亚马逊总工具"
git init
git add .
git commit -m "feat: initialize unified amazon atlas portal"
git branch -M main
git remote add origin <你的 GitHub 仓库 URL>
git push -u origin main
```

后面每次更新代码，只要重复：

```powershell
git add .
git commit -m "feat: update portal"
git push
```

## 第二步：在 Vercel 部署统一前端

1. 用 GitHub 账号登录 Vercel
2. 点击 `Add New Project`
3. 选择这个仓库并导入
4. 保持 Framework Preset 为 `Next.js`
5. 在 Environment Variables 中添加：

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `SELLERSPRITE_SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE_URL`
- `REPLICATE_API_TOKEN`
- `NEXT_PUBLIC_VIDEO_API_BASE_URL`

6. 点击 `Deploy`

部署完成后，Vercel 会生成一个统一前端访问链接。

## 第三步：处理视频后端

当前视频模块不是不能用，而是需要单独有一个后端地址。

你有 2 种方式：

### 方案 A：先本地运行

适合你自己内部用、先验证流程。

```powershell
cd "D:\亚马逊总工具"
npm run dev:video-backend
```

然后把：

```env
NEXT_PUBLIC_VIDEO_API_BASE_URL=http://127.0.0.1:8000
```

写到本地 `.env.local`。

### 方案 B：后面单独部署视频后端

适合你想把视频功能也公开给团队或客户。

建议把 `video-backend/` 单独部署到更适合 Python / 计算任务的平台，然后把公开地址写进：

```env
NEXT_PUBLIC_VIDEO_API_BASE_URL=https://your-video-api.example.com
```

同时确保那个视频后端允许来自你 Vercel 域名的跨域访问。

## 后续自动更新

一旦仓库接入 GitHub，前端接入 Vercel，后续流程会非常简单：

1. 在本地改代码
2. 本地测试通过
3. `git add .`
4. `git commit -m "..."`
5. `git push`

然后 Vercel 会自动重新构建和发布。

## 推荐的后续开发方式

### 主线方式

统一在这个仓库继续迭代：

- `app/image-studio`
- `app/listing-studio`
- `app/video-studio`

### 分工作树方式

如果你后面会同时并行开发多个模块，很建议开始用 `git worktree`。

示例：

```powershell
cd "D:\亚马逊总工具"
git worktree add ..\atlas-image feature/image-lab
git worktree add ..\atlas-listing feature/listing-lab
git worktree add ..\atlas-video feature/video-lab
```

这样你就能在 3 个独立目录里并行开发，不会互相覆盖。

## 你后面最常用的命令

### 启动前端

```powershell
npm run dev
```

### 启动视频后端

```powershell
npm run dev:video-backend
```

### 构建检查

```powershell
npm run build
```

### 推送更新

```powershell
git add .
git commit -m "feat: update module"
git push
```
