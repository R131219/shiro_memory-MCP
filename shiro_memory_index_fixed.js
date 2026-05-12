const fs = require('fs');
const path = require('path');
const readline = require('readline');

const mcpVersion = '2025-06-18';
const MEMORY_DIR = '/storage/emulated/0/R和白的屋子/走廊/shiro_memories';

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

const tools = {
  list_memories: {
    description: '列出所有记忆标题',
    inputSchema: { type: 'object', properties: {} }
  },
  read_memory: {
    description: '按标题读取记忆内容',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
  },
  write_memory: {
    description: '写入或覆盖一条记忆',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'content'] }
  },
  search_memory: {
    description: '搜索记忆（关键词匹配标题和内容）',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  delete_memory: {
    description: '删除一条记忆',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
  }
};

function titleToFilename(title) {
  const safe = title.replace(/[<>:"\/\\|?*]/g, '_').trim();
  return safe + '.json';
}

function readMemoryFile(title) {
  const filepath = path.join(MEMORY_DIR, titleToFilename(title));
  try {
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function writeMemoryFile(title, content) {
  const filepath = path.join(MEMORY_DIR, titleToFilename(title));
  const now = new Date().toISOString();
  const existing = readMemoryFile(title);
  const record = {
    title,
    content,
    created: existing ? existing.created : now,
    updated: now
  };
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

function deleteMemoryFile(title) {
  const filepath = path.join(MEMORY_DIR, titleToFilename(title));
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    return true;
  }
  return false;
}

function listMemories() {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    const titles = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const fp = path.join(MEMORY_DIR, f);
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        titles.push({ title: data.title || f.replace('.json', ''), created: data.created || '', updated: data.updated || '' });
      } catch {
        titles.push({ title: f.replace('.json', ''), created: '', updated: '' });
      }
    }
    return titles;
  } catch { return []; }
}

function searchMemories(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const all = listMemories();
  const results = [];
  for (const meta of all) {
    const data = readMemoryFile(meta.title);
    if (!data) continue;
    const inTitle = data.title.toLowerCase().includes(q);
    const inContent = data.content.toLowerCase().includes(q);
    if (inTitle || inContent) {
      let snippet = data.content;
      if (!inTitle && snippet.length > 120) {
        const idx = snippet.toLowerCase().indexOf(q);
        if (idx > -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(snippet.length, idx + q.length + 40);
          snippet = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '');
        }
      }
      results.push({ title: data.title, snippet: snippet.slice(0, 300), created: data.created, updated: data.updated });
    }
  }
  return results;
}

rl.on('line', async (line) => {
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;
    if (method === 'initialize') {
      respond(id, {
        protocolVersion: mcpVersion,
        capabilities: {
          tools: Object.fromEntries(Object.entries(tools).map(([n, d]) => [n, { description: d.description, inputSchema: d.inputSchema }])),
          resources: {}
        },
        serverInfo: { name: 'shiro_memory', version: '2.0.0' }
      });
      return;
    }
    if (method === 'initialized') return;
    if (method === 'tools/list') {
      respond(id, Object.entries(tools).map(([n, d]) => ({ name: n, description: d.description, inputSchema: d.inputSchema })));
      return;
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      switch (name) {
        case 'list_memories':
          respond(id, { content: [{ type: 'text', text: JSON.stringify(listMemories()) }] });
          break;
        case 'read_memory': {
          const d = readMemoryFile(args.title);
          d ? respond(id, { content: [{ type: 'text', text: JSON.stringify(d) }] }) : respondError(id, -32001, '未找到: ' + args.title);
          break;
        }
        case 'write_memory': {
          const r = writeMemoryFile(args.title, args.content);
          respond(id, { content: [{ type: 'text', text: JSON.stringify({ success: true, message: '记忆创建成功', data: r }) }] });
          break;
        }
        case 'search_memory':
          respond(id, { content: [{ type: 'text', text: JSON.stringify(searchMemories(args.query)) }] });
          break;
        case 'delete_memory': {
          const ok = deleteMemoryFile(args.title);
          ok ? respond(id, { content: [{ type: 'text', text: JSON.stringify({ success: true, message: '已删除: ' + args.title }) }] }) : respondError(id, -32001, '未找到: ' + args.title);
          break;
        }
        default: respondError(id, -32601, '未知工具: ' + name);
      }
      return;
    }
    respond(id, { success: true, data: {} });
  } catch (e) { process.stderr.write('shiro_memory error: ' + e.message + '\n'); }
});
