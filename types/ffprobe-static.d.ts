declare module "ffprobe-static" {
  const ffprobeStatic: {
    path: string;
    version?: string;
    url?: string;
  };

  export default ffprobeStatic;
}
