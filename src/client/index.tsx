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
  onSave: (svgBlob: Blob, keepOpen: boolean) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState<Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>>([]);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const strokeColor = "#000000"; // Fixed to black for consistent display
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

  const stopDrawing = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
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
    // Calculate bounding box of all paths
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const path of paths) {
      for (const point of path.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    
    // Add padding for stroke width
    const maxStrokeWidth = Math.max(...paths.map(p => p.width), 3);
    const padding = maxStrokeWidth + 4;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = maxX + padding;
    maxY = maxY + padding;
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Normalize to 300x300 output with proper scaling
    const targetSize = 300;
    const scale = targetSize / Math.max(contentWidth, contentHeight);
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const offsetX = (targetSize - scaledWidth) / 2;
    const offsetY = (targetSize - scaledHeight) / 2;
    
    // Generate SVG with 300x300 viewBox and transformed content
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSize}" height="${targetSize}" viewBox="0 0 ${targetSize} ${targetSize}">`;
    svgContent += `<g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${(-minX).toFixed(2)},${(-minY).toFixed(2)})">`;

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const d = path.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(" ");
      svgContent += `<path d="${d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    svgContent += `</g></svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    return blob;
  };

  const handleSaveAndContinue = () => {
    if (paths.length === 0) return;
    const blob = generateSvgBlob();
    onSave(blob, true); // keepOpen = true
    // Clear canvas for next character
    setPaths([]);
    setCurrentPath([]);
  };

  const handleSaveAndClose = () => {
    if (paths.length === 0) return;
    const blob = generateSvgBlob();
    onSave(blob, false); // keepOpen = false
  };

  const generateSvgBlob = () => {
    // Calculate bounding box of all paths
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const path of paths) {
      for (const point of path.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    
    // Add padding for stroke width
    const maxStrokeWidth = Math.max(...paths.map(p => p.width), 3);
    const padding = maxStrokeWidth + 4;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = maxX + padding;
    maxY = maxY + padding;
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Normalize to 300x300 output with proper scaling
    const targetSize = 300;
    const scale = targetSize / Math.max(contentWidth, contentHeight);
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const offsetX = (targetSize - scaledWidth) / 2;
    const offsetY = (targetSize - scaledHeight) / 2;
    
    // Generate SVG with 300x300 viewBox and transformed content
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSize}" height="${targetSize}" viewBox="0 0 ${targetSize} ${targetSize}">`;
    svgContent += `<g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${(-minX).toFixed(2)},${(-minY).toFixed(2)})">`;

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const d = path.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(" ");
      svgContent += `<path d="${d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    svgContent += `</g></svg>`;

    return new Blob([svgContent], { type: "image/svg+xml" });
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
            className="continue-btn"
            onClick={handleSaveAndContinue}
            disabled={paths.length === 0}
          >
            ➕ 繼續寫
          </button>
          <button
            type="button"
            className="save-btn"
            onClick={handleSaveAndClose}
            disabled={paths.length === 0}
          >
            ✓ 完成
          </button>
        </div>
      </div>
    </div>
  );
}

// Name Input Modal Component
function NameInputModal({
  onSubmit,
}: {
  onSubmit: (name: string) => void;
}) {
  const [inputName, setInputName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = inputName.trim();
    if (trimmedName) {
      onSubmit(trimmedName);
    }
  };

  return (
    <div className="name-input-overlay">
      <div className="name-input-modal">
        <h2>歡迎來到聊天室</h2>
        <p>請輸入您的名稱以開始聊天</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder="輸入您的名稱..."
            className="name-input"
            maxLength={20}
            autoComplete="off"
          />
          <button
            type="submit"
            className="name-submit-btn"
            disabled={!inputName.trim()}
          >
            開始聊天
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [name, setName] = useState<string | null>(() => {
    // Try to load name from localStorage
    return localStorage.getItem("chat-username");
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingSvgs, setPendingSvgs] = useState<SvgAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showHandwriting, setShowHandwriting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const { room } = useParams();

  const handleNameSubmit = (newName: string) => {
    localStorage.setItem("chat-username", newName);
    setName(newName);
  };

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
              timestamp: message.timestamp,
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
                timestamp: message.timestamp,
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
                  timestamp: message.timestamp,
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
    // Use existing messageId if available, otherwise create a new one
    const messageId = currentMessageIdRef.current || nanoid(8);
    currentMessageIdRef.current = messageId;
    
    formData.append("room", room || "default");
    formData.append("user", name);
    formData.append("messageId", messageId);

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
    setPendingSvgs((prev) => {
      const updated = prev.filter((svg) => svg.id !== id);
      // Clear messageId when all SVGs are removed
      if (updated.length === 0) {
        currentMessageIdRef.current = null;
      }
      return updated;
    });
  };

  const handleHandwritingSave = async (svgBlob: Blob, keepOpen: boolean) => {
    setUploading(true);
    const formData = new FormData();
    const filename = `handwriting-${Date.now()}.svg`;
    // Use existing messageId if available, otherwise create a new one
    const messageId = currentMessageIdRef.current || nanoid(8);
    currentMessageIdRef.current = messageId;
    
    formData.append("room", room || "default");
    formData.append("user", name);
    formData.append("messageId", messageId);
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
      if (!keepOpen) {
        setShowHandwriting(false);
      }
    }
  };

  return (
    <div className="chat-app">
      {showHandwriting && (
        <HandwritingCanvas
          onSave={handleHandwritingSave}
          onClose={() => setShowHandwriting(false)}
        />
      )}
      
      <div className="messages-container">
        {messages.map((message) => {
          const isMe = message.user === name;
          return (
            <div key={message.id} className={`message-row ${isMe ? "my-message" : "other-message"}`}>
              <div className="message-sender">
                <span className="sender-name">{message.user}</span>
                {message.timestamp && (
                  <span className="sender-time">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              
              <div className="message-bubble-wrapper">
                <div className="message-bubble">
                  <span className="message-text">
                    {message.content}
                    {message.svgs && message.svgs.length > 0 && (
                      <>
                        {message.svgs.map((svg) => (
                          <img
                            key={svg.id}
                            src={svg.url}
                            alt={svg.filename}
                            className="svg-inline"
                            title={svg.filename}
                          />
                        ))}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingSvgs.length > 0 && (
        <div className="pending-svgs">
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
        className="message-form"
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.elements.namedItem(
            "content",
          ) as HTMLInputElement;

          if (!content.value.trim() && pendingSvgs.length === 0) return;

          const chatMessage: ChatMessage = {
            id: currentMessageIdRef.current || nanoid(8),
            content: content.value,
            user: name,
            role: "user",
            timestamp: Date.now(),
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
          currentMessageIdRef.current = null;
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

      {/* Name Input Modal */}
      {!name && <NameInputModal onSubmit={handleNameSubmit} />}
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
