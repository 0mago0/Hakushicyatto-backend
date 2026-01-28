import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT, timestamp INTEGER, svgs TEXT)`,
    );

    // load the messages from the database
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM messages`)
      .toArray() as Array<{
      id: string;
      user: string;
      role: "user" | "assistant";
      content: string;
      timestamp?: number;
      svgs: string | null;
    }>;

    this.messages = rows.map((row) => ({
      id: row.id,
      user: row.user,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      svgs: row.svgs ? JSON.parse(row.svgs) : undefined,
    }));
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    const svgsJson = message.svgs ? JSON.stringify(message.svgs) : null;

    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    // Use parameterized query to avoid SQL injection and syntax issues
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, timestamp, svgs) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET content = ?, timestamp = ?, svgs = ?`,
      message.id,
      message.user,
      message.role,
      message.content,
      message.timestamp || null,
      svgsJson,
      message.content,
      message.timestamp || null,
      svgsJson,
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage({
        id: parsed.id,
        content: parsed.content,
        user: parsed.user,
        role: parsed.role,
        timestamp: parsed.timestamp,
        svgs: parsed.svgs,
      });
    }
  }
}

async function handleSvgUpload(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("svgs") as File[];
    const room = formData.get("room") as string || "default";
    const user = formData.get("user") as string || "anonymous";
    const messageId = formData.get("messageId") as string || crypto.randomUUID();

    // Sanitize room and user names for safe folder paths
    const safeRoom = room.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeMessageId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "No files uploaded" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const uploadedSvgs: Array<{ id: string; url: string; filename: string }> = [];

    for (const file of files) {
      // Validate file type
      if (file.type !== "image/svg+xml" && !file.name.endsWith(".svg")) {
        continue; // Skip non-SVG files
      }

      const fileId = crypto.randomUUID();
      const key = `svgs/${safeRoom}/${safeUser}/${safeMessageId}/${file.name}`;

      // Read and normalize SVG
      const svgContent = await file.text();
      const normalizedSvg = normalizeSvg(svgContent);

      // Upload to R2
      await env.SVG_BUCKET.put(key, normalizedSvg, {
        httpMetadata: {
          contentType: "image/svg+xml",
        },
      });

      uploadedSvgs.push({
        id: fileId,
        url: `/api/svg/${key}`,
        filename: file.name,
      });
    }

    return new Response(JSON.stringify({ svgs: uploadedSvgs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ error: "Upload failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function normalizeSvg(svgContent: string): string {
  // Parse SVG to find viewBox or width/height
  const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
  let x = 0, y = 0, width = 100, height = 100;

  if (viewBoxMatch) {
    const [vx, vy, vw, vh] = viewBoxMatch[1].split(/\s+/).map(Number);
    x = vx;
    y = vy;
    width = vw;
    height = vh;
  } else {
    // Try to extract width/height attributes
    const widthMatch = svgContent.match(/width=["']([^"']+)["']/);
    const heightMatch = svgContent.match(/height=["']([^"']+)["']/);
    if (widthMatch) width = parseFloat(widthMatch[1]);
    if (heightMatch) height = parseFloat(heightMatch[1]);
  }

  // Normalize to consistent size (300x300 viewBox)
  const targetSize = 300;
  const scale = targetSize / Math.max(width, height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  // Center the content
  const offsetX = (targetSize - scaledWidth) / 2 - x * scale;
  const offsetY = (targetSize - scaledHeight) / 2 - y * scale;

  // Add transform to normalize
  let normalized = svgContent.replace(
    /<svg[^>]*>/,
    `<svg viewBox="0 0 ${targetSize} ${targetSize}" xmlns="http://www.w3.org/2000/svg">`
  );

  // If there's no g element wrapping the content, add one with transform
  if (!normalized.includes("<g")) {
    normalized = normalized.replace(
      /(<svg[^>]*>)/,
      `$1<g transform="translate(${offsetX},${offsetY}) scale(${scale})">`
    );
    normalized = normalized.replace("</svg>", "</g></svg>");
  } else {
    // Update existing g element with transform
    normalized = normalized.replace(
      /<g([^>]*)>/,
      `<g$1 transform="translate(${offsetX},${offsetY}) scale(${scale})">`
    );
  }

  return normalized;
}

async function handleSvgGet(key: string, env: Env): Promise<Response> {
  const object = await env.SVG_BUCKET.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle SVG upload API
    if (url.pathname === "/api/svg/upload") {
      return handleSvgUpload(request, env);
    }

    // Handle SVG retrieval
    if (url.pathname.startsWith("/api/svg/svgs/")) {
      // Decode URL path for non-ASCII filenames (e.g., Chinese characters)
      const key = decodeURIComponent(url.pathname.replace("/api/svg/", ""));
      return handleSvgGet(key, env);
    }

    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
