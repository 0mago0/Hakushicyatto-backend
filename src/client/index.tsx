import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message, type SvgAttachment } from "../shared";

// Handwriting Canvas Component
function HandwritingCanvas({
  onSave,
  onClose,
}: {
  onSave: (svgBlob: Blob) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState<Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>>([]);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);

  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e);
    setCurrentPath([coords]);
  }, [getCoordinates]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getCoordinates(e);
    setCurrentPath((prev) => [...prev, coords]);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    if (isDrawing && currentPath.length > 0) {
      setPaths((prev) => [...prev, { points: currentPath, color: strokeColor, width: strokeWidth }]);
      setCurrentPath([]);
    }
    setIsDrawing(false);
  }, [isDrawing, currentPath, strokeColor, strokeWidth]);

  // Redraw canvas whenever paths or currentPath changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all saved paths
    for (const path of paths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }

    // Draw current path
    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
  }, [paths, currentPath, strokeColor, strokeWidth]);

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath([]);
  };

  const undoLast = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  const saveAsSvg = () => {
    // Generate SVG from paths
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`;
    svgContent += `<rect width="400" height="300" fill="#ffffff"/>`;

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const d = path.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(" ");
      svgContent += `<path d="${d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    onSave(blob);
  };

  return (
    <div className="handwriting-overlay">
      <div className="handwriting-modal">
        <div className="handwriting-header">
          <h3>手寫板</h3>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="handwriting-tools">
          <label>
            顏色:
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </label>
          <label>
            粗細:
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            />
            <span>{strokeWidth}px</span>
          </label>
          <button type="button" onClick={undoLast} disabled={paths.length === 0}>
            ↩ 復原
          </button>
          <button type="button" onClick={clearCanvas}>
            🗑 清除
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={400}
          height={300}
          className="handwriting-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="handwriting-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="save-btn"
            onClick={saveAsSvg}
            disabled={paths.length === 0}
          >
            💾 儲存並上傳
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [name] = useState(names[Math.floor(Math.random() * names.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingSvgs, setPendingSvgs] = useState<SvgAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showHandwriting, setShowHandwriting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { room } = useParams();

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          // probably someone else who added a message
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
              svgs: message.svgs,
            },
          ]);
        } else {
          // this usually means we ourselves added a message
          // and it was broadcasted back
          // so let's replace the message with the new message
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user,
                role: message.role,
                svgs: message.svgs,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user,
                  role: message.role,
                  svgs: message.svgs,
                }
              : m,
          ),
        );
      } else {
        setMessages(message.messages);
      }
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
        formData.append("svgs", file);
      }
    }

    try {
      const response = await fetch("/api/svg/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json() as { svgs: SvgAttachment[] };
        setPendingSvgs((prev) => [...prev, ...data.svgs]);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removePendingSvg = (id: string) => {
    setPendingSvgs((prev) => prev.filter((svg) => svg.id !== id));
  };

  const handleHandwritingSave = async (svgBlob: Blob) => {
    setUploading(true);
    const formData = new FormData();
    const filename = `handwriting-${Date.now()}.svg`;
    formData.append("svgs", svgBlob, filename);

    try {
      const response = await fetch("/api/svg/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json() as { svgs: SvgAttachment[] };
        setPendingSvgs((prev) => [...prev, ...data.svgs]);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
      setShowHandwriting(false);
    }
  };

  return (
    <div className="chat container">
      {showHandwriting && (
        <HandwritingCanvas
          onSave={handleHandwritingSave}
          onClose={() => setShowHandwriting(false)}
        />
      )}
      {messages.map((message) => (
        <div key={message.id} className="row message">
          <div className="two columns user">{message.user}</div>
          <div className="ten columns">
            <div>{message.content}</div>
            {message.svgs && message.svgs.length > 0 && (
              <div className="svg-attachments">
                {message.svgs.map((svg) => (
                  <div key={svg.id} className="svg-preview">
                    <img src={svg.url} alt={svg.filename} />
                    <span className="svg-filename">{svg.filename}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {pendingSvgs.length > 0 && (
        <div className="pending-svgs">
          <div className="pending-label">待發送的 SVG:</div>
          <div className="pending-list">
            {pendingSvgs.map((svg) => (
              <div key={svg.id} className="pending-svg-item">
                <img src={svg.url} alt={svg.filename} />
                <span>{svg.filename}</span>
                <button
                  type="button"
                  className="remove-svg"
                  onClick={() => removePendingSvg(svg.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        className="row message-form"
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.elements.namedItem(
            "content",
          ) as HTMLInputElement;

          if (!content.value.trim() && pendingSvgs.length === 0) return;

          const chatMessage: ChatMessage = {
            id: nanoid(8),
            content: content.value,
            user: name,
            role: "user",
            svgs: pendingSvgs.length > 0 ? pendingSvgs : undefined,
          };
          setMessages((messages) => [...messages, chatMessage]);
          // we could broadcast the message here

          socket.send(
            JSON.stringify({
              type: "add",
              ...chatMessage,
            } satisfies Message),
          );

          content.value = "";
          setPendingSvgs([]);
        }}
      >
        <div className="input-row">
          <input
            type="file"
            ref={fileInputRef}
            accept=".svg,image/svg+xml"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
            id="svg-upload"
          />
          <label htmlFor="svg-upload" className="upload-btn" title="上傳 SVG 檔案">
            {uploading ? "⏳" : "📎"}
          </label>
          <button
            type="button"
            className="upload-btn"
            onClick={() => setShowHandwriting(true)}
            title="開啟手寫板"
          >
            ✏️
          </button>
          <input
            type="text"
            name="content"
            className="message-input"
            placeholder={`Hello ${name}! Type a message...`}
            autoComplete="off"
          />
          <button type="submit" className="send-message">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<App />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
