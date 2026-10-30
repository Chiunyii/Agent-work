# Agent-work

一個**真正會自己做事的 AI Agent**：你給它一個目標，它會自己規劃步驟、讀寫檔案、執行指令、上網搜尋，直到完成任務。旁邊的網頁會**即時顯示 Agent 正在做什麼**：一個坐在辦公桌前的小人，思考時有思考泡泡，執行工具時螢幕上的程式碼會捲動，需要你核准時會舉手。

介面的設計參考了 [Charonyuu/whatsmyagentdoing](https://github.com/Charonyuu/whatsmyagentdoing)。那個專案是「監看別的 Agent 在做什麼」的儀表板，這裡則把同樣的概念用在我們自己寫的 Agent 上。程式碼是重新撰寫的，沒有複製原專案的程式。

## 快速開始

需要 Node.js 18 以上。

```bash
npm install

# 先不用 API key，看一段示範（寫一個質數程式、請你核准後執行）
npm start -- --demo

# 正式使用
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

瀏覽器會打開 http://127.0.0.1:4546 。輸入任務，例如：

- 寫一個 Python 程式計算 1 到 100 的質數，執行它並告訴我結果
- 搜尋 AI Agent 的最新發展，整理成 notes.md
- 看看工作資料夾裡有什麼，幫我寫一份 README

也可以不開網頁，直接在終端機跑一個任務：

```bash
node bin/cli.js -t "建立一個 hello.py 並執行它"
```

## Agent 能用的工具

| 工具 | 作用 | 需要核准 |
|---|---|---|
| `list_files` | 列出工作資料夾裡的檔案 | 否 |
| `read_file` | 讀取文字檔 | 否 |
| `write_file` | 建立或覆寫檔案 | 否 |
| `run_command` | 在工作資料夾執行 shell 指令（120 秒逾時） | **是** |
| `web_search` | 上網搜尋（Anthropic 伺服器端工具） | 否 |

所有檔案操作都限制在工作資料夾（預設 `./workspace`）裡；`../`、絕對路徑或指向外面的符號連結都會被拒絕。執行指令前網頁會跳出「允許／拒絕」卡片，終端機模式則會問 `[y/N]`。

## 網頁上看得到什麼

| 狀態 | 意思 |
|---|---|
| 💭 思考中 | 模型正在推理（會顯示思考摘要） |
| ⏳ 執行工具 | 正在跑某個工具，例如 `python3 primes.py` |
| ✍️ 撰寫回覆 | 正在寫給你的回答 |
| 🟠 等你核准 | 想執行指令，等你按允許或拒絕 |
| ✅ 完成 | 這一輪結束 |
| ■ 已中斷 / ❗ 發生錯誤 | |

每一步（思考、工具呼叫和結果）都會在右邊的時間軸上出現，可以點開看完整內容。左側顯示 token 用量、快取讀取量與工具呼叫次數。重新整理頁面會重播整段對話。

## 選項

```
-p, --port <n>        網頁埠號（預設 4546）
    --host <addr>     綁定位址（預設 127.0.0.1，只有本機能連）
-w, --workspace <dir> Agent 可以讀寫、執行指令的資料夾（預設 ./workspace）
    --model <id>      模型（預設 claude-opus-5-5）
    --effort <level>  low | medium | high | xhigh | max（預設 high）
    --auto-approve    執行指令前不詢問（小心使用）
    --no-web          關閉網路搜尋工具
    --no-open         不自動開瀏覽器
    --demo            示範模式：不呼叫 API
-t, --task <text>     在終端機直接執行一個任務
```

## 運作原理

這是一個標準的 **ReAct 迴圈**（推理 → 行動 → 觀察 → 再推理）：

```
使用者任務
   │
   ▼
呼叫 Claude（附上工具清單與目前對話）──► 把思考／文字即時串流到網頁
   │
   ├─ 回覆裡有 tool_use？
   │     是 → 驗證參數 →（需要時請你核准）→ 執行工具
   │          → 把 tool_result 加回對話 → 回到上面再呼叫一次
   │     否 → 任務完成，顯示最後的回答
```

- `src/agent.js`：Agent 迴圈。用 `@anthropic-ai/sdk` 串流呼叫 Claude Opus 5.5，開啟 adaptive thinking 並顯示思考摘要；思考區塊原樣傳回，讓推理保持連貫；使用提示快取降低重複輸入的成本；處理 `pause_turn`、`max_tokens`、`refusal` 等停止原因。每則訊息最多 40 步，避免無限迴圈。
- `src/tools.js`：工具定義、參數驗證，以及把路徑限制在工作資料夾內的檢查。
- `src/server.js`：零依賴的 HTTP 伺服器，用 Server-Sent Events 把 Agent 的每個事件推到網頁。
- `public/`：網頁介面（辦公室場景、時間軸、核准卡片），支援深色模式與手機。
- `src/demo.js`：假的模型客戶端，給 `--demo` 和測試使用。

另外啟用了 Anthropic 的伺服器端備援（`fallbacks: "default"`）：如果安全分類器拒絕某個請求，API 會自動改用合適的備援模型重試，網頁上會出現一行提示。不需要的話，可以在 `src/agent.js` 的 `callModel()` 裡刪掉 `betas` 和 `fallbacks` 兩行。

## 測試

```bash
npm test
```

測試使用假的模型客戶端，不需要 API key，涵蓋：工具呼叫迴圈、指令核准與拒絕、參數驗證、拒絕工作資料夾外的路徑（含符號連結）、中斷後繼續對話。

## 安全提醒

Agent 可以在工作資料夾裡執行任意指令。請保持預設的「執行前詢問」，只有在你信任任務內容時才用 `--auto-approve`；也不要把伺服器綁到 `0.0.0.0` 讓其他人連進來。
