# Hakushicyatto Backend (Durable Chat)

基於 Cloudflare Durable Objects 和 PartyKit 的實時聊天應用程式後端模版。

## 專案簡介

這是一個實時聊天應用程式，利用 Cloudflare 的邊緣計算能力構建。它使用 Durable Objects 來管理聊天室狀態和 WebSocket 連接，確保低延遲的即時通訊體驗。前端使用 React 構建，並通過 Cloudflare Workers 進行託管。

## 技術棧

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **State Management**: [Durable Objects](https://developers.cloudflare.com/durable-objects/) & [SQLite](https://developers.cloudflare.com/durable-objects/api/sql-storage/)
- **Real-time**: [PartyKit](https://partykit.io/) (`partyserver`, `partysocket`)
- **Frontend**: React, React Router
- **Storage**: Cloudflare R2 (用於 SVG 上傳)
- **Language**: TypeScript
- **Bundler**: esbuild

## 功能特性

- 🚀 **即時通訊**: 基於 WebSocket 的多用戶實時聊天。
- 🏠 **房間機制**: 每個聊天室由一個獨立的 Durable Object 實例管理。
- 💾 **數據持久化**: 聊天記錄存儲在 Durable Objects 的 SQLite 中。
- 📂 **文件存儲**: 支持上傳 SVG 文件至 Cloudflare R2。
- ⚡ **高性能**: 全球分發的 Cloudflare 邊緣網絡。

## 前置要求

- [Node.js](https://nodejs.org/) (建議 v18 或更高版本)
- [npm](https://www.npmjs.com/)
- [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)

## 安裝與設置

1. **克隆專案**

   ```bash
   git clone <repository-url>
   cd hakushicyatto-backend
   ```

2. **安裝依賴**

   ```bash
   npm install
   ```

3. **配置 Cloudflare R2**

   本專案使用 R2 存儲桶來存放上傳的文件。你需要先創建一個名為 `chat-svg-uploads` 的 R2 Bucket，或在 `wrangler.json` 中修改 `bucket_name`。

   ```bash
   npx wrangler r2 bucket create chat-svg-uploads
   ```

## 開發指南

啟動本地開發服務器。這將同時編譯前端 React 代碼並啟動 Workers 模擬器。

```bash
npm run dev
```

服務啟動後，通常可以在 `http://localhost:8787` 訪問應用。

## 部署

將應用部署到 Cloudflare Workers：

```bash
npm run deploy
```

> **注意**: 首次部署可能需要登錄 Wrangler：`npx wrangler login`。

## 專案結構

- **`src/client/`**: 前端 React 原始碼。
- **`src/server/`**: 後端 Workers 和 Durable Objects 邏輯。
  - `index.ts`: Worker 入口點。
  - `worker-configuration.d.ts`: 環境變量和綁定類型定義。
- **`public/`**: 靜態資源目錄（編譯後的 React 代碼會輸出到這裡）。
- **`wrangler.json`**: Cloudflare Workers 配置文件。

## 可用腳本

- `npm run dev`: 啟動本地開發環境。
- `npm run deploy`: 部署到 Cloudflare。
- `npm run check`: 類型檢查並運行部署預演 (dry-run)。
- `npm run cf-typegen`: 根據 `wrangler.json` 生成 Worker 類型定義。

## 實作細節

### 1. 後端架構 (Cloudflare Durable Objects)

核心邏輯位於 `src/server/index.ts` 中的 `Chat` 類，繼承自 `partyserver` 的 `Server`。

- **WebSocket 管理**: 每個聊天室對應一個 Durable Object 實例。所有連接到同一房間的用戶都會連接到同一個實例，實現實時廣播。
- **狀態同步 (Hibernate)**: 啟用 `hibernate: true`，允許 Durable Object 在沒有活躍連接時休眠以節省成本，喚醒時狀態依然保留。

### 2. 數據存儲策略

本專案採用混合存儲策略：

- **Metadata & 文字訊息**: 存儲於 Durable Object 內建的 **SQLite** 資料庫。
  - 表結構: `messages (id, user, role, content, timestamp, svgs)`
  - 優勢: 強一致性，快速讀取聊天記錄。
- **媒體文件 (SVG)**: 存儲於 **Cloudflare R2** 對象存儲。
  - 當用戶上傳手繪 SVG 時，後端會將其存入 `SVG_BUCKET`，並在 SQLite 中僅存儲對應的 ID 或路徑。

### 3. 通訊流程

1.  **連接建立 (`onConnect`)**:
    - 用戶連接 WebSocket。
    - 伺服器從 SQLite 讀取歷史訊息並發送 `type: "all"` 事件給客戶端。
2.  **訊息處理 (`onMessage`)**:
    - 接收客戶端發送的訊息 (`type: "add" | "update"`).
    - **廣播**: 立即轉發給房間內其他所有連接的客戶端。
    - **持久化**: 使用 `INSERT ... ON CONFLICT DO UPDATE` 將訊息寫入 SQLite。
    - **文件處理**: 若包含 SVG 數據，後端處理其關聯邏輯。

### 4. API 端點說明

 #### SVG 上傳 / 下載

 除了 WebSocket 通訊外，後端還暴露了標準的 HTTP API 用於處理文件：

 - **`POST /api/svg/upload`**:
   - **Content-Type**: `multipart/form-data`
   - **Form Fields**:
     - `svgs`: SVG 文件檔案 (required)
     - `room`: 房間 ID (optional, default: "default")
     - `user`: 用戶名稱 (optional, default: "anonymous")
     - `messageId`: 訊息 ID (optional, generated if missing)
   - **處理**: 文件會被標準化 (300*300 ViewBox) 並根據 `svgs/<room>/<user>/<messageId>/<filename>` 路徑存入 R2 Bucket。
   - **Response**: JSON `{ svgs: [{ id, url, filename }] }`。

 - **`GET /api/svg/svgs/:key`**:
   - 透過 R2 Bucket 讀取並返回 SVG 文件內容。
   - 設置了 `Cache-Control` 以優化前端性能。
   - **Client Tip**: 由於 R2 寫入後可能有些微延遲，建議客戶端在上傳成功後，使用 HEAD 請求輪詢直到文件可訪問後再渲染。

 #### WebSocket 協議細節

 訊息格式定義於 `src/shared.ts`，採用 JSON 格式：

 - **Server -> Client**:
   - `type: "all"`: 連接成功時發送，包含 `messages: ChatMessage[]` 陣列。
   - `type: "add"` / `type: "update"`: 當有新訊息或訊息更新時廣播。

 - **Client -> Server**:
   - `type`: `"add"` 或 `"update"`
   - `id`: 訊息唯一識別碼 (string)
   - `content`: 訊息內容 (string)
   - `user`: 用戶名稱 (string)
   - `role`: `"user"` 或 `"assistant"`
   - `timestamp`: Unix 時間戳 (optional, number)
   - `svgs`: SVG 附件陣列 (optional, `[{ id, url, filename }]`)

### 5. 前端整合

- 使用 `partysocket` 庫簡化 WebSocket 連接管理。
- 實現了手繪板功能 (`HandwritingCanvas`)，生成的圖像以 Blob 形式上傳處理。

### 6. PartyKit 技術細節

本專案利用 [PartyKit](https://partykit.io/) 來簡化 WebSocket 和 Durable Objects 的開發體驗。

#### Backend (`src/server/index.ts`)

- **`Chat` Class**: 繼承自 `Server<Env>`，這是一個封裝了 Cloudflare Durable Object 的類別。
- **`onConnect`**: 處理新的 WebSocket 連接。這裡我們不僅僅是建立連接，還會立即發送當前房間的完整狀態 (`type: "all"`)，確保新加入的用戶能看到歷史訊息。
- **`onMessage`**: 處理接收到的訊息。
  - **Broadcast**: 使用 `this.broadcast(message)` 將訊息轉發給房間內的所有其他連接。
  - **Storage**: 同步將訊息寫入 SQLite，確保狀態持久化。

#### Frontend (`src/client/index.tsx`)

- **`usePartySocket` Hook**: 這是 PartyKit 提供的 React Hook，用於管理 WebSocket 連接。
  ```typescript
  const socket = usePartySocket({
    party: "chat", // 對應後端的 binding name
    room,          // 當前房間 ID (來自 URL)
    onMessage: (evt) => { ... } // 處理接收到的事件
  });
  ```
- **狀態同步**: 前端在接收到 `type: "add"` 訊息時，會檢查本地是否已存在該訊息 ID。
  - 如果不存在（來自其他用戶），則新增至列表。
  - 如果已存在（來自自己的樂觀更新），則更新內容以確保一致性。

### 7. 前端使用純 WebSocket 連接 (不使用 PartyKit Client)

如果您希望後端保持不變（繼續使用 `partyserver`），但在前端不想依賴 `partysocket` 庫，您可以直接使用標準的瀏覽器 `WebSocket` API 進行連接。

由於後端使用了 `routePartykitRequest`，WebSocket 的標準路由格式為 `/parties/:partyName/:roomId`。

#### 實作範例

```typescript
useEffect(() => {
  // 1. 建構 URL
  // PartyName 對應後端定義的 Durable Object 綁定名稱 (此專案為 "chat")
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const partyName = "chat";
  const wsUrl = `${protocol}//${host}/parties/${partyName}/${room}`;

  // 2. 建立原生 WebSocket 連接
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to PartyKit backend via native WebSocket');
  };

  ws.onmessage = (event) => {
    // 解析 PartyKit 後端發送的 JSON 格式訊息
    try {
      const message = JSON.parse(event.data);
      console.log('Received:', message);
      
      // 根據 message.type 處理邏輯 ("all", "add", "update")
      if (message.type === 'all') {
        // 初始化訊息列表...
      }
    } catch (e) {
      console.error('Parse error', e);
    }
  };

  ws.onclose = (event) => {
    console.log('Disconnected', event.code, event.reason);
    // 注意：原生 WebSocket 不會自動重連，需自行實作重連邏輯
  };

  // 3. 發送訊息
  // ws.send(JSON.stringify({ type: "add", ... }));

  return () => ws.close();
}, [room]);
```

**差異與注意事項**:
- **URL 結構**: 必須遵循 `partyserver` 的路由規則 (`/parties/chat/<id>`)。
- **重連機制**: `partysocket` 內建了自動重連與指數退避算法，原生 API 需自行實作。
- **消息緩存**: `partysocket` 會在斷線時緩存未發送的訊息，原生 API 需自行處理隊列。

## 授權

MIT
