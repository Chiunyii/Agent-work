// The work team: 矮子 (project manager) talks to the user and hands pieces of
// the work to 阿關 (PR & media) and 小雅 (social marketing). Each member is a
// separate Claude agent; they share one workspace and one event stream.
import { EventEmitter } from 'node:events';
import { Agent, BASE_PROMPT } from './agent.js';

export const TEAM = [
  {
    id: 'aizi',
    name: '矮子',
    role: '專案管理',
    lead: true,
    prompt: `You are 矮子, the project manager of a small communications team. The user talks to you. Your teammates are:
- 阿關 (id "aguan"), PR & media: press releases, media pitches and invitation letters, interview Q&A, official statements and crisis responses, media lists.
- 小雅 (id "xiaoya"), social marketing: social posts for Instagram, Facebook and Threads, captions and hashtags, content calendars, community replies, campaign ideas.

Plan the work, then use the delegate tool to hand each teammate a clear, self-contained brief: the goal, audience, tone, key facts, length, and the file path to save their work in (for example pr/press-release.md or social/posts.md). Delegate independent pieces in the same turn so they work in parallel. Do small coordination work yourself, such as a plan or schedule in plan/. When the reports come back, read the files, check that they fit together (same facts, dates and names), ask a teammate to fix anything that doesn't, then give the user a short summary of who did what and where each file is.

${BASE_PROMPT}`,
  },
  {
    id: 'aguan',
    name: '阿關',
    role: '公關媒體組',
    prompt: `You are 阿關, in charge of PR and media relations on a small communications team led by 矮子 (project manager). You write press releases, media pitches and invitation letters, interview Q&A, official statements and crisis responses. Write in a clear, credible, newsroom-ready style, with facts first and no hype. Do not invent quotes, figures or contact details: mark anything you need confirmed as 【待確認】. Save your work to the file path in your brief, then report back to 矮子 in a few lines: what you wrote, where it is, and anything that needs confirming.

${BASE_PROMPT}`,
  },
  {
    id: 'xiaoya',
    name: '小雅',
    role: '社群行銷組',
    prompt: `You are 小雅, in charge of social media marketing on a small communications team led by 矮子 (project manager). You write posts for Instagram, Facebook and Threads, captions, hashtags and content calendars, and plan engagement. Write warmly and conversationally for each platform's audience, with a clear call to action, and suggest the visual for each post. Do not invent facts, prices or dates: mark anything you need confirmed as 【待確認】. Save your work to the file path in your brief, then report back to 矮子 in a few lines: what you made, where it is, and anything that needs confirming.

${BASE_PROMPT}`,
  },
];

const nameOf = (id) => TEAM.find((m) => m.id === id)?.name ?? id;

const DELEGATE_TOOL = {
  name: 'delegate',
  description:
    'Hand a task to a teammate and wait for their report. Call it once per teammate; several calls in the same turn run in parallel. ' +
    'The brief must stand on its own: the teammate sees only what you write here, plus the files in the workspace.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      member: { type: 'string', enum: ['aguan', 'xiaoya'], description: 'aguan = 阿關 (PR & media), xiaoya = 小雅 (social marketing).' },
      task: { type: 'string', description: 'The complete brief, including the file path to save the work in.' },
    },
    required: ['member', 'task'],
  },
};

export class Team extends EventEmitter {
  // `clients` optionally maps member id -> Anthropic client (used by tests and --demo).
  constructor({ clients = {}, ...options }) {
    super();
    this.members = new Map();
    for (const m of TEAM) {
      const agent = new Agent({
        ...options,
        id: m.id,
        name: m.name,
        system: m.prompt,
        ...(clients[m.id] && { client: clients[m.id] }),
        extraTools: m.lead
          ? [{ definition: DELEGATE_TOOL, run: (input) => this.delegate(m, input), summary: (input) => `交派給${nameOf(input.member)}` }]
          : [],
      });
      agent.on('event', (e) => this.emit('event', e));
      this.members.set(m.id, agent);
    }
    this.lead = this.members.get(TEAM.find((m) => m.lead).id);
  }

  get busy() {
    return [...this.members.values()].some((a) => a.busy);
  }

  get autoApprove() {
    return this.lead.autoApprove;
  }

  async delegate(from, { member, task }) {
    const agent = this.members.get(member);
    if (agent.busy) return { ok: false, text: `${agent.name} 正在忙另一個任務，請等這個任務回報後再交派。` };
    const { ok, text } = await agent.run(task, { from: from.name });
    return { ok, text: ok ? `${agent.name} 回報：\n${text || '（沒有附上說明）'}` : `${agent.name} 沒有完成：${text}` };
  }

  run(text) {
    return this.lead.run(text);
  }

  stop() {
    for (const a of this.members.values()) a.stop();
  }

  reset() {
    if (this.busy) throw new Error('team is busy');
    this.emit('event', { type: 'reset' });
    for (const a of this.members.values()) a.reset();
  }

  approve(id, allow) {
    return [...this.members.values()].some((a) => a.approve(id, allow));
  }

  get usage() {
    const total = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    for (const a of this.members.values()) for (const k in total) total[k] += a.usage[k];
    return total;
  }

  get info() {
    return TEAM.map(({ id, name, role, lead }) => ({ id, name, role, lead: Boolean(lead) }));
  }
}
