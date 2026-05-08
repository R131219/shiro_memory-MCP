import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const { fileURLToPath } = await import('url'); const MEMORY_DIR = resolve(fileURLToPath(import.meta.url), '..', 'shiro_memories');
if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

function memoryPath(title) {
  const sanitized = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 100);
  return join(MEMORY_DIR, sanitized + '.json');
}

const server = new Server(
  { name: 'shiro_memory', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'read_memory',
    description: '按标题读取记忆内容',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: '记忆标题' } },
      required: ['title']
    }
  },
  {
    name: 'write_memory',
    description: '写入或覆盖一条记忆',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '记忆标题' },
        content: { type: 'string', description: '记忆内容' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'search_memory',
    description: '搜索记忆（关键词匹配标题和内容）',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query']
    }
  },
  {
    name: 'delete_memory',
    description: '删除一条记忆',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: '要删除的记忆标题' } },
      required: ['title']
    }
  },
  {
    name: 'list_memories',
    description: '列出所有记忆标题',
    inputSchema: { type: 'object', properties: {} }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'read_memory': {
        const p = memoryPath(args.title);
        if (!existsSync(p)) throw new Error(`没有找到记忆: ${args.title}`);
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        return { content: [{ type: 'text', text: data.content }] };
      }
      case 'write_memory': {
        const p = memoryPath(args.title);
        writeFileSync(p, JSON.stringify({ title: args.title, content: args.content, updatedAt: new Date().toISOString() }, null, 2));
        return { content: [{ type: 'text', text: `记忆已保存: ${args.title}` }] };
      }
      case 'search_memory': {
        const q = args.query.toLowerCase();
        const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
        const results = [];
        for (const f of files) {
          const data = JSON.parse(readFileSync(join(MEMORY_DIR, f), 'utf-8'));
          if (data.title.toLowerCase().includes(q) || data.content.toLowerCase().includes(q)) {
            results.push({ title: data.title, snippet: data.content.slice(0, 100) });
          }
        }
        const text = results.length ? results.map(r => `- ${r.title}: ${r.snippet}...`).join('\n') : '没有找到匹配的记忆';
        return { content: [{ type: 'text', text }] };
      }
      case 'delete_memory': {
        const p = memoryPath(args.title);
        if (!existsSync(p)) throw new Error(`没有找到记忆: ${args.title}`);
        unlinkSync(p);
        return { content: [{ type: 'text', text: `记忆已删除: ${args.title}` }] };
      }
      case 'list_memories': {
        const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
        const titles = files.map(f => JSON.parse(readFileSync(join(MEMORY_DIR, f), 'utf-8')).title);
        const text = titles.length ? titles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '暂无记忆';
        return { content: [{ type: 'text', text }] };
      }
      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `错误: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
