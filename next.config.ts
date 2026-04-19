import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
