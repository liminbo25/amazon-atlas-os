import { StudioHeader } from "@/components/portal/studio-header";
import { VideoWorkbench } from "@/components/video-studio/video-workbench";

export default function VideoStudioPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="视频工坊"
        title="统一视频模块入口，既能做本地视频拆解，也能继续承接多模型视频生成。"
        description="这里默认使用项目内 Next.js API 路由承接视频拆解、脚本生成和任务编排；旧 FastAPI 后端只作为可选 legacy fallback 保留。"
      />
      <VideoWorkbench />
    </div>
  );
}
