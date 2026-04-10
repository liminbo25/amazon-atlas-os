import { StudioHeader } from "@/components/portal/studio-header";
import { VideoWorkbench } from "@/components/video-studio/video-workbench";

export default function VideoStudioPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="视频"
        title="视频工具"
      />
      <VideoWorkbench />
    </div>
  );
}
