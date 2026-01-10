import { NextRequest } from "next/server";

// Required for streaming responses
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const logStreamUrl = process.env.LOG_STREAM_URL;
  const logStreamToken = process.env.LOG_STREAM_TOKEN;

  if (!logStreamUrl || !logStreamToken) {
    return Response.json(
      {
        error: {
          code: "MISSING_CONFIG",
          message: "LOG_STREAM_URL and LOG_STREAM_TOKEN must be configured",
        },
      },
      { status: 500 }
    );
  }

  // Create AbortController to handle client disconnection
  const abortController = new AbortController();
  
  // Handle client disconnection
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  try {
    // Fetch upstream SSE stream
    const upstreamResponse = await fetch(logStreamUrl, {
      headers: {
        Authorization: `Bearer ${logStreamToken}`,
        Accept: "text/event-stream",
      },
      signal: abortController.signal,
    });

    if (!upstreamResponse.ok) {
      return Response.json(
        {
          error: {
            code: "UPSTREAM_ERROR",
            message: `Upstream log stream returned ${upstreamResponse.status}: ${upstreamResponse.statusText}`,
          },
        },
        { status: 502 }
      );
    }

    // Check if response body is readable
    if (!upstreamResponse.body) {
      return Response.json(
        {
          error: {
            code: "UPSTREAM_ERROR",
            message: "Upstream log stream returned no body",
          },
        },
        { status: 502 }
      );
    }

    // Stream the upstream response directly to the client
    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    // Handle abort (client disconnected)
    if (error instanceof Error && error.name === "AbortError") {
      // Client disconnected, return a response that closes the connection
      return new Response(null, { status: 499 }); // 499 Client Closed Request
    }

    // Other errors
    if (error instanceof Error) {
      return Response.json(
        {
          error: {
            code: "UPSTREAM_ERROR",
            message: `Failed to connect to upstream log stream: ${error.message}`,
          },
        },
        { status: 502 }
      );
    }

    return Response.json(
      {
        error: {
          code: "UNKNOWN",
          message: "An unexpected error occurred while connecting to log stream",
        },
      },
      { status: 500 }
    );
  }
}
