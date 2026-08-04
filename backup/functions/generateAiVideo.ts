Deno.serve(async (req) => {
  const BASE_URL = "https://api.mountsea.ai";
  const apiKey = process.env.MOUNTSEA_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "MOUNTSEA_API_KEY not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const { prompt, model, duration, resolution, aspectRatio, generateAudio, imageUrl, taskId } = body;

    // If taskId is provided, poll for result
    if (taskId) {
      const pollResponse = await fetch(`${BASE_URL}/hub/v1/tasks/${taskId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });

      if (!pollResponse.ok) {
        const errText = await pollResponse.text();
        return new Response(JSON.stringify({ error: `Polling error: ${pollResponse.status}`, details: errText }), {
          status: pollResponse.status,
          headers: { "Content-Type": "application/json" }
        });
      }

      const pollData = await pollResponse.json();
      return new Response(JSON.stringify({
        taskId: taskId,
        status: pollData.status,
        ready: pollData.status === "completed",
        videoUrl: pollData.data?.output?.url || pollData.data?.url || null,
        data: pollData.data || null,
        error: pollData.error_message || null
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Otherwise, submit a new video generation task
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing required field: prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Available models: veo-3.1, veo-3.1-fast, veo-3.1-lite, kling-v3-pro, kling-v3-standard, wan-2.7, seedance-2.0
    const selectedModel = model || "veo-3.1-fast";

    const input = {
      prompt,
      duration: duration || "8s",
      resolution: resolution || "720p",
      aspect_ratio: aspectRatio || "16:9",
      generate_audio: generateAudio !== undefined ? generateAudio : true
    };

    // If imageUrl provided, use image-to-video model
    if (imageUrl) {
      input.image_url = imageUrl;
    }

    const payload = {
      model: selectedModel,
      input
    };

    const response = await fetch(`${BASE_URL}/hub/v1/video`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Mountsea Hub API error: ${response.status}`, details: errText }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      success: true,
      taskId: data.task_id,
      model: selectedModel,
      status: "submitted",
      message: `Video generation submitted. Call this function again with taskId="${data.task_id}" to poll for results.`,
      models: {
        "veo-3.1": "Google Veo 3.1 — highest quality, native audio, up to 4K",
        "veo-3.1-fast": "Google Veo 3.1 Fast — quick drafts (default)",
        "veo-3.1-lite": "Google Veo 3.1 Lite — lightweight",
        "kling-v3-pro": "Kling v3 Pro — 3-15s, native audio, multi-shot",
        "kling-v3-standard": "Kling v3 Standard",
        "wan-2.7": "WAN 2.7 — high quality, 1080p default",
        "seedance-2.0": "Seedance 2.0 — cinematic, native audio, physics"
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});