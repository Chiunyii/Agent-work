// A stand-in for the Anthropic client that replays scripted model turns.
// Used by the tests and by --demo, so the agent and page run without an API key.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fakeClient(turns, { delayMs = 0, repeat = false } = {}) {
  const requests = [];
  const script = [...turns];
  return {
    requests,
    beta: {
      messages: {
        stream(params) {
          requests.push(structuredClone(params));
          if (repeat && script.length === 0) script.push(...turns);
          const turn = script.shift() ?? DEMO_FALLBACK;
          const handlers = {};
          let aborted = false;
          return {
            on(name, fn) { (handlers[name] ??= []).push(fn); return this; },
            abort() { aborted = true; },
            async finalMessage() {
              const fire = (name, ...args) => (handlers[name] ?? []).forEach((fn) => fn(...args));
              for (const block of turn.content) {
                fire('streamEvent', { type: 'content_block_start', content_block: block });
                const text = block.type === 'thinking' ? block.thinking : block.type === 'text' ? block.text : null;
                // Stream text in small pieces so the page shows it arriving.
                for (const piece of text && delayMs ? text.match(/[\s\S]{1,6}/g) : text ? [text] : []) {
                  if (aborted) throw new Error('aborted');
                  fire(block.type, piece);
                  await sleep(delayMs);
                }
                if (!text) await sleep(delayMs * 10);
                fire('contentBlock', block);
              }
              return { role: 'assistant', usage: { input_tokens: 1200, output_tokens: 80 }, ...turn };
            },
          };
        },
      },
    },
  };
}

const DEMO_FALLBACK = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '（這是示範模式，沒有連到真的模型。設定 ANTHROPIC_API_KEY 後拿掉 --demo 就能使用真正的團隊。）' }],
};

const think = (thinking) => ({ type: 'thinking', thinking, signature: '' });
const say = (text) => ({ type: 'text', text });
let n = 0;
const call = (name, input) => ({ type: 'tool_use', id: `demo_${++n}`, name, input });
const turn = (...content) => ({ stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', content });

const PLAN = `# 保溫杯上市宣傳計畫

| 項目 | 負責 | 檔案 |
|---|---|---|
| 新聞稿 | 阿關（公關媒體組） | pr/press-release.md |
| 社群貼文 3 則 | 小雅（社群行銷組） | social/posts.md |

上市日期：【待確認】
主訊息：一杯用很久的保溫杯，減少一次性杯子。
`;
const PRESS = `# 【新聞稿】可長年使用的環保保溫杯，【待確認：上市日期】正式上市

【待確認：品牌名稱】今日宣布推出全新環保保溫杯，主打耐用、好清洗，鼓勵消費者以一只杯子取代一次性飲料杯。

## 產品重點
- 雙層真空結構，保溫保冷【待確認：時數】
- 杯蓋可完全拆洗
- 包裝採用可回收紙材

## 上市資訊
- 上市日期：【待確認】
- 通路：【待確認】

媒體聯絡：【待確認：姓名／電話／Email】
`;
const POSTS = `# 社群貼文（3 則）

## 1. 預告｜Instagram
一杯，可以陪你多久？☕ 我們準備了一只用得很久的杯子，【待確認：上市日期】見。
#環保保溫杯 #減塑生活
建議圖片：杯子放在木桌上的晨光照

## 2. 上市｜Facebook
新杯子正式上市！保溫保冷、杯蓋全拆洗，帶著它出門，少用一個一次性杯子 🌿 購買連結：【待確認】
建議圖片：產品三色並排

## 3. 互動｜Threads
你一天會用掉幾個外帶杯？留言告訴我們，抽 3 位送新杯子 🎁（活動辦法：【待確認】）
`;

// One scripted run per teammate: 矮子 plans and delegates to both in parallel,
// 阿關 writes a press release and checks it (asks for approval), 小雅 writes
// the posts, then 矮子 reviews the files and reports.
export const DEMO_TEAM = {
  aizi: [
    turn(think('新產品上市需要新聞稿和社群貼文。先寫一份分工計畫，再同時交給阿關和小雅。'), call('write_file', { path: 'plan/launch-plan.md', content: PLAN })),
    turn(
      say('計畫寫好了，同時交派給阿關和小雅。'),
      call('delegate', { member: 'aguan', task: '請寫一份環保保溫杯上市的新聞稿，語氣可信、事實優先，存到 pr/press-release.md。上市日期、品牌名稱等未確認資訊請標註【待確認】。' }),
      call('delegate', { member: 'xiaoya', task: '請為環保保溫杯上市寫 3 則社群貼文（預告、上市、互動），分別給 Instagram、Facebook、Threads，附建議圖片，存到 social/posts.md。未確認資訊請標註【待確認】。' }),
    ),
    turn(think('兩邊都回報了。讀一下檔案，確認日期、名稱的寫法一致。'), call('read_file', { path: 'pr/press-release.md' }), call('read_file', { path: 'social/posts.md' })),
    turn(
      think('新聞稿和貼文的主訊息一致，未確認的地方都標好了。整理給使用者。'),
      say('上市宣傳的第一版完成了：\n\n- 阿關（公關媒體組）：新聞稿 → pr/press-release.md\n- 小雅（社群行銷組）：IG／FB／Threads 三則貼文 → social/posts.md\n- 我（專案管理）：分工計畫 → plan/launch-plan.md\n\n兩份內容的主訊息一致。上市日期、品牌名稱、通路和媒體聯絡人都標了【待確認】，請提供後我再請他們更新。'),
    ),
  ],
  aguan: [
    turn(think('寫新聞稿：標題、導言、產品重點、上市資訊、媒體聯絡。不編造數字，未知的標【待確認】。'), call('write_file', { path: 'pr/press-release.md', content: PRESS })),
    turn(say('寫好了，算一下字數確認長度適中。'), call('run_command', { command: 'wc -m pr/press-release.md' })),
    turn(say('新聞稿完成，存在 pr/press-release.md，約 300 字。上市日期、品牌名稱、保溫時數、通路和媒體聯絡人需要確認。')),
  ],
  xiaoya: [
    turn(think('三則貼文：IG 預告、FB 上市、Threads 互動抽獎，各附建議圖片。'), call('write_file', { path: 'social/posts.md', content: POSTS })),
    turn(say('3 則貼文完成，存在 social/posts.md（IG 預告、FB 上市、Threads 互動）。上市日期、購買連結和抽獎辦法需要確認。')),
  ],
};

export function demoClients({ delayMs = 40 } = {}) {
  return Object.fromEntries(Object.entries(DEMO_TEAM).map(([id, turns]) => [id, fakeClient(turns, { delayMs, repeat: true })]));
}
