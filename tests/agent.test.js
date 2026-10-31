import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import { Agent } from '../src/agent.js';
import { runTool, validateInput } from '../src/tools.js';
import { fakeClient } from '../src/demo.js';

const tmp = () => fs.mkdtemp(nodePath.join(os.tmpdir(), 'agent-work-'));

test('runs tools the model calls and feeds results back until it answers', async () => {
  const workspace = await tmp();
  const client = fakeClient([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: 'I should write the file.', signature: 'x' },
        { type: 'tool_use', id: 't1', name: 'write_file', input: { path: 'hi.txt', content: 'hello' } },
      ],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '寫好了 hi.txt' }] },
  ]);
  const agent = new Agent({ workspace, client, webSearch: false });
  const events = [];
  agent.on('event', (e) => events.push(e));

  await agent.run('寫一個檔案');

  assert.equal(await fs.readFile(nodePath.join(workspace, 'hi.txt'), 'utf8'), 'hello');
  const second = client.requests[1].messages;
  assert.equal(second.length, 3);
  assert.equal(second[1].content[0].type, 'thinking', 'thinking blocks are passed back unchanged');
  assert.deepEqual(second[2].content[0], { type: 'tool_result', tool_use_id: 't1', content: 'wrote 5 bytes to hi.txt' });
  assert.equal(events.filter((e) => e.type === 'status').at(-1).status, 'done');
  assert.equal(agent.usage.output_tokens, 160);
});

test('asks before running a command and reports a decline to the model', async () => {
  const workspace = await tmp();
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'run_command', input: { command: 'echo hi > made.txt' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
  ]);
  const agent = new Agent({ workspace, client, webSearch: false });
  agent.on('event', (e) => { if (e.type === 'approval') agent.approve(e.id, false); });

  await agent.run('跑個指令');

  const result = client.requests[1].messages[2].content[0];
  assert.equal(result.is_error, true);
  await assert.rejects(fs.access(nodePath.join(workspace, 'made.txt')));
});

test('runs an approved command inside the workspace', async () => {
  const workspace = await tmp();
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'run_command', input: { command: 'echo hi > made.txt && echo done' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
  ]);
  const agent = new Agent({ workspace, client, webSearch: false });
  agent.on('event', (e) => { if (e.type === 'approval') agent.approve(e.id, true); });

  await agent.run('跑個指令');

  assert.match(client.requests[1].messages[2].content[0].content, /exit code: 0[\s\S]*done/);
  assert.equal(await fs.readFile(nodePath.join(workspace, 'made.txt'), 'utf8'), 'hi\n');
});

test('rejects invalid tool input without running the tool', async () => {
  const workspace = await tmp();
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'r1', name: 'read_file', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
  ]);
  const agent = new Agent({ workspace, client, webSearch: false });
  await agent.run('讀檔');
  const result = client.requests[1].messages[2].content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /missing required field: path/);
});

test('tools refuse paths outside the workspace', async () => {
  const workspace = await tmp();
  await assert.rejects(runTool('read_file', { path: '../../etc/passwd' }, { workspace }), /outside the workspace/);
  await assert.rejects(runTool('write_file', { path: '/tmp/x.txt', content: '' }, { workspace }), /outside the workspace/);
  await fs.symlink(os.tmpdir(), nodePath.join(workspace, 'link'));
  await assert.rejects(runTool('write_file', { path: 'link/escape.txt', content: '' }, { workspace }), /outside the workspace/);
});

test('validateInput checks types and unknown fields', () => {
  assert.equal(validateInput('write_file', { path: 'a', content: 'b' }), null);
  assert.match(validateInput('write_file', { path: 'a', content: 3 }), /must be a string/);
  assert.match(validateInput('list_files', { path: '.', extra: 1 }), /unexpected field/);
});

test('a message after an interrupted turn keeps roles alternating', async () => {
  const workspace = await tmp();
  const agent = new Agent({ workspace, client: fakeClient([]), webSearch: false });
  agent.messages = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'list_files', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'stopped by the user', is_error: true }] },
  ];
  agent.addUserText('繼續');
  assert.equal(agent.messages.length, 3);
  assert.deepEqual(agent.messages[2].content.at(-1), { type: 'text', text: '繼續' });
});

test('the lead delegates to teammates in parallel and gets their reports back', async () => {
  const { Team } = await import('../src/team.js');
  const workspace = await tmp();
  const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
  const clients = {
    aizi: fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'd1', name: 'delegate', input: { member: 'aguan', task: '寫新聞稿到 pr.md' } },
          { type: 'tool_use', id: 'd2', name: 'delegate', input: { member: 'xiaoya', task: '寫貼文到 posts.md' } },
        ],
      },
      say('都完成了'),
    ]),
    aguan: fakeClient([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'w1', name: 'write_file', input: { path: 'pr.md', content: 'press' } }] },
      say('新聞稿在 pr.md'),
    ]),
    xiaoya: fakeClient([say('貼文在 posts.md')]),
  };
  const team = new Team({ workspace, clients, webSearch: false });
  const events = [];
  team.on('event', (e) => events.push(e));

  await team.run('上市宣傳');

  const results = clients.aizi.requests[1].messages[2].content;
  assert.deepEqual(results.map((r) => r.tool_use_id), ['d1', 'd2']);
  assert.match(results[0].content, /阿關 回報：\n新聞稿在 pr.md/);
  assert.match(results[1].content, /小雅 回報：\n貼文在 posts.md/);
  assert.equal(await fs.readFile(nodePath.join(workspace, 'pr.md'), 'utf8'), 'press');
  assert.match(clients.aguan.requests[0].messages[0].content, /^矮子 assigned you this task:/);
  assert.ok(events.some((e) => e.type === 'task' && e.agent === 'xiaoya' && e.from === '矮子'));
  assert.ok(!clients.aguan.requests[0].tools.some((t) => t.name === 'delegate'), 'only the lead can delegate');
  // Both teammates were working at the same time.
  const firstDone = events.findIndex((e) => e.type === 'status' && e.status === 'done');
  const started = new Set(events.slice(0, firstDone).filter((e) => e.type === 'task').map((e) => e.agent));
  assert.deepEqual([...started].sort(), ['aguan', 'xiaoya']);
  assert.equal(team.busy, false);
});

test('delegating to a busy teammate is refused instead of interrupting them', async () => {
  const { Team } = await import('../src/team.js');
  const team = new Team({ workspace: await tmp(), clients: {}, webSearch: false });
  team.members.get('aguan').busy = true;
  const reply = await team.delegate({ name: '矮子' }, { member: 'aguan', task: 'x' });
  assert.equal(reply.ok, false);
  assert.match(reply.text, /阿關 正在忙/);
});
