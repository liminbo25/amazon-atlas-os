import { StudioHeader } from "@/components/portal/studio-header";
import { VideoWorkbench } from "@/components/video-studio/video-workbench";

export default function VideoStudioPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="视频工坊"
        title="统一视频模块入口，既能做本地视频拆解，也能继续承接多模型视频生成。"
        description="这里不再复刻旧 Vite 界面，而是围绕你现有的 FastAPI 契约做了一个更适合统一门户的前端。这样后续你继续拓展 Runway、Kling、Veo 等供应商时，维护路径会更清晰。"
      />
      <VideoWorkbench />
    </div>
  );
}
