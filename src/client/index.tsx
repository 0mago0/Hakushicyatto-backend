import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message, type SvgAttachment } from "../shared";

function App() {
  const [name] = useState(names[Math.floor(Math.random() * names.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingSvgs, setPendingSvgs] = useState<SvgAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
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

  return (
    <div className="chat container">
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
          <label htmlFor="svg-upload" className="upload-btn">
            {uploading ? "⏳" : "📎"}
          </label>
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
