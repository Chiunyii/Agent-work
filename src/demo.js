// A stand-in for the Anthropic client that replays scripted model turns.
// Used by the tests and by --demo, so the agent and page run without an API key.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fakeClient(turns, { delayMs = 0 } = {}) {
  const requests = [];
  const script = [...turns];
  return {
    requests,
    beta: {
      messages: {
        stream(params) {
          requests.push(structuredClone(params));
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
  content: [{ type: 'text', text: '（這是示範模式，沒有連到真的模型。設定 ANTHROPIC_API_KEY 後拿掉 --demo 就能使用真正的 Agent。）' }],
};

// A scripted run: write a small program, run it (asks for approval), report back.
export const DEMO_TURNS = [
  {
    stop_reason: 'tool_use',
    content: [
      { type: 'thinking', thinking: '使用者想要找出 1 到 100 的質數。先看看工作資料夾裡有什麼，再寫一個 Python 程式並執行驗證。', signature: '' },
      { type: 'tool_use', id: 'demo_1', name: 'list_files', input: { path: '.' } },
    ],
  },
  {
    stop_reason: 'tool_use',
    content: [
      { type: 'thinking', thinking: '資料夾大致是空的。寫一個簡單的埃拉托斯特尼篩法。', signature: '' },
      {
        type: 'tool_use', id: 'demo_2', name: 'write_file',
        input: {
          path: 'primes.py',
          content: 'def primes(n):\n    sieve = [True] * (n + 1)\n    sieve[0:2] = [False, False]\n    for i in range(2, int(n ** 0.5) + 1):\n        if sieve[i]:\n            sieve[i * i :: i] = [False] * len(sieve[i * i :: i])\n    return [i for i, p in enumerate(sieve) if p]\n\n\nresult = primes(100)\nprint(len(result), result)\n',
        },
      },
    ],
  },
  {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: '程式寫好了，接下來執行它確認結果。' },
      { type: 'tool_use', id: 'demo_3', name: 'run_command', input: { command: 'python3 primes.py' } },
    ],
  },
  {
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '輸出是 25 個質數，和預期一致。整理結果給使用者。', signature: '' },
      { type: 'text', text: '完成了！我在工作資料夾建立了 `primes.py`，用埃拉托斯特尼篩法找質數，並執行驗證過：\n\n1 到 100 之間共有 25 個質數：2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97。' },
    ],
  },
];
