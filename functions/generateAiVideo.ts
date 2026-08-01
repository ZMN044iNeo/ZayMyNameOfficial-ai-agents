/**
 * AI Video Generator — Mountsea AI Backend Function
 * 
 * Generates AI videos using Sora 2, Veo 3, Kling AI, Runway, and Hailuo
 * through the Mountsea AI unified API (https://api.mountsea.ai)
 * 
 * Requires: MOUNTSEA_API_KEY environment variable
 * Get your key at: https://offoff.ai/
 * 
 * Usage:
 *   POST /generateVideo
 *   Body: { prompt, model, duration, resolution, imageUrl }
 *   
 *   GET /getVideoStatus?taskId=xxx
 *   
 *   GET /getVideo?taskId=xxx  (polls until complete, returns video URL)
 */

const BASE_URL = "https://api.mountsea.ai";

async function handleRequest(req, res) {
  const method = req.method;
  const path = new URL(req.url, "http://localhost").pathname;
  
  // Route: Generate video
  if (method === "POST" && path === "/generateVideo") {
    return await generateVideo(req, res);
  }
  
  // Route: Get task status
  if (method === "GET" && path === "/getVideoStatus") {
    return await getVideoStatus(req, res);
  }
  
  // Route: Poll until complete (convenience)
  if (method === "GET" && path === "/getVideo") {
    return await pollForVideo(req, res);
  }
  
  return res.status(404).json({ error: "Not found. Use /generateVideo, /getVideoStatus, or /getVideo" });
}

async function generateVideo(req, res) {
  try {
    const body = await parseBody(req);
    const { prompt, model = "sora-2", duration = 5, resolution = "1080p", imageUrl } = body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }
    
    const apiKey = process.env.MOUNTSEA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "MOUNTSEA_API_KEY not set. Get your key at https://offoff.ai/" });
    }
    
    // Determine endpoint based on model
    const isSora = model.startsWith("sora");
    const endpoint = isSora ? "/sora/generate" : "/veo/generate";
    
    const payload = {
      prompt,
      duration,
      resolution,
    };
    
    if (!isSora) {
      payload.model = model; // veo-3, veo-3-fast, veo-3.1
    }
    
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ 
        error: `Mountsea API error: ${response.status}`,
        details: errText 
      });
    }
    
    const data = await response.json();
    
    return res.json({
      success: true,
      taskId: data.taskId,
      model,
      status: "submitted",
      message: `Video generation submitted. Poll /getVideo?taskId=${data.taskId} for results.`,
      docs: "https://docs.mountsea.ai/api-reference/sora/introduction"
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getVideoStatus(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const taskId = url.searchParams.get("taskId");
    
    if (!taskId) {
      return res.status(400).json({ error: "Missing required param: taskId" });
    }
    
    const apiKey = process.env.MOUNTSEA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "MOUNTSEA_API_KEY not set" });
    }
    
    const response = await fetch(`${BASE_URL}/sora/task?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `API error: ${response.status}` });
    }
    
    const data = await response.json();
    
    return res.json({
      taskId,
      status: data.status,
      videoUrl: data.videoUrl || null,
      error: data.error || null,
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function pollForVideo(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const taskId = url.searchParams.get("taskId");
    const maxAttempts = parseInt(url.searchParams.get("maxAttempts") || "30", 10);
    
    if (!taskId) {
      return res.status(400).json({ error: "Missing required param: taskId" });
    }
    
    const apiKey = process.env.MOUNTSEA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "MOUNTSEA_API_KEY not set" });
    }
    
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(`${BASE_URL}/sora/task?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      
      if (!response.ok) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      
      const data = await response.json();
      const status = data.status;
      
      if (status === "completed" && data.videoUrl) {
        return res.json({
          success: true,
          taskId,
          status: "completed",
          videoUrl: data.videoUrl,
          attempts: i + 1,
        });
      }
      
      if (status === "failed") {
        return res.status(500).json({
          success: false,
          taskId,
          status: "failed",
          error: data.error || "Unknown error",
          attempts: i + 1,
        });
      }
      
      // Wait 10 seconds before next poll
      await new Promise(r => setTimeout(r, 10000));
    }
    
    return res.status(504).json({
      success: false,
      taskId,
      status: "timeout",
      message: `Video did not complete after ${maxAttempts} attempts (~${maxAttempts * 10}s)`,
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default handleRequest;
