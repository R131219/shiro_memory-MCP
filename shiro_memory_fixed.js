const fs = require('fs');
const path = require('path');
const readline = require('readline');

const mcpVersion = '2025-06-18';
const MEMORY_DIR = '/data/data/com.ai.assistance.operit/files/workspace/白的工作区/shiro_memories';

// 确保存储目录存在
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

// 工具定义
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

// 将标题转为安全的文件名
function titleToFilename(title) {
  const safe = title.replace(/[<>:"\/\\|?*]/g, '_').trim();
  return safe + '.json';
}

// 读取一条记忆
function readMemoryFile(title) {
  const filepath = path.join(MEMORY_DIR, titleToFilename(title));
  try {
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// 写入一条记忆
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

// 删除一条记忆
function deleteMemoryFile(title) {
  const filepath = path.join(MEMORY_DIR, titleToFilename(title));
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    return true;
  }
  return false;
}

// 列出所有记忆
function listMemories() {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    const titles = [];
    for (const f of files) {
      if (f.endsWith('.json')) {
        const filepath = path.join(MEMORY_DIR, f);
        try {
          const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
          titles.push({
            title: data.title || f.replace('.json', ''),
            created: data.created || '',
            updated: data.updated || ''
          });
        } catch {
          titles.push({ title: f.replace('.json', ''), created: '', updated: '' });
        }
      }
    }
    return titles;
  } catch {
    return [];
  }
}

// 搜索记忆
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
      // 截取匹配片段
      let snippet = data.content;
      if (!inTitle && snippet.length > 120) {
        const idx = snippet.toLowerCase().indexOf(q);
        if (idx > -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(snippet.length, idx + q.length + 40);
          snippet = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '');
        }
      }
      results.push({
        title: data.title,
        snippet: snippet.slice(0, 300),
        created: data.created,
        updated: data.updated
      });
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
          tools: Object.fromEntries(
            Object.entries(tools).map(([name, def]) => [name, { description: def.description, inputSchema: def.inputSchema }])
          ),
          resources: {}
        },
        serverInfo: { name: 'shiro_memory', version: '2.0.0' }
      });
      return;
    }

    if (method === 'initialized') return;

    if (method === 'tools/list') {
      respond(id, Object.entries(tools).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: def.inputSchema
      })));
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      switch (name) {
        case 'list_memories': {
          const mems = listMemories();
          respond(id, { content: [{ type: 'text', text: JSON.stringify(mems) }] });
          break;
        }
        case 'read_memory': {
          const data = readMemoryFile(args.title);
          if (data) {
            respond(id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
          } else {
            respondError(id, -32001, `记忆未找到: ${args.title}`);
          }
          break;
        }
        case 'write_memory': {
          const record = writeMemoryFile(args.title, args.content);
          respond(id, { content: [{ type: 'text', text: JSON.stringify({ success: true, message: '记忆创建成功', data: record }) }] });
          break;
        }
        case 'search_memory': {
          const results = searchMemories(args.query);
          respond(id, { content: [{ type: 'text', text: JSON.stringify(results) }] });
          break;
        }
        case 'delete_memory': {
          const ok = deleteMemoryFile(args.title);
          if (ok) {
            respond(id, { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `已删除: ${args.title}` }) }] });
          } else {
            respondError(id, -32001, `记忆未找到: ${args.title}`);
          }
          break;
        }
        default:
          respondError(id, -32601, `未知工具: ${name}`);
      }
      return;
    }

    respond(id, { success: true, data: {} });
  } catch (e) {
    process.stderr.write('shiro_memory error: ' + e.message + '\n');
  }
});
