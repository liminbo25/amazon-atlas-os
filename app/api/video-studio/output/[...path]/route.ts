import {
  RouteError,
  logRouteError,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { readVideoOutputFile } from "@/lib/video-studio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OutputRouteContext {
  params: Promise<{
    path: string[];
  }>;
}

export async function GET(_request: Request, context: OutputRouteContext) {
  try {
    const { path } = await context.params;
    const output = await readVideoOutputFile(path ?? []);

    return new Response(new Uint8Array(output.body), {
      headers: {
        "content-type": output.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("video-output", error);
    }

    return toErrorResponse(error, "Video output file lookup failed.");
  }
}
