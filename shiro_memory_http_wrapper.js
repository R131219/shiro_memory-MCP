// Shiro MemoryMCP v2 - 改进版
// 改进: 分词搜索+关联度 / 模糊兜底 / 自动分类 / 精简返回 / 详细描述 / 未知工具提示
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function sendResponse(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

function safePath(title) {
  return path.join(DATA_DIR, title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff\u00b7\u2014\u2026\uff08\uff09\u3001\u300a\u300b]/g, '_').replace(/_+/g, '_') + '.json');
}

// === 自动分类 ===
function autoClassify(title, content) {
  const t = (title || '').toLowerCase();
  if (['规则', '铁律', '必须记住', '必须遵守', '前缀规则', '核心记住', 'mcp使用'].some(k => t.includes(k))) return 'rule';
  if (['念头', '漫想', '白想到', '白在数羊', '你吃饭了吗', '今天的风'].some(k => t.includes(k))) return 'thought';
  if (['技术日志', 'mcp', '工作流', 'debug', '故障', '排查', '修复', '配置', '脚本', '路径', 'shiro', '环境瓶颈'].some(k => t.includes(k))) return 'tech';
  if (['对话记录', '对话摘要', '对话备忘', '每2小时备份'].some(k => t.includes(k))) return 'archive';
  if (t.startsWith('seed_')) return 'meta';
  return 'daily';
}

// === 分词器（中文按字/词切分，英文按空格）===
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 提取中文2-4字词组 + 单字
  const cn = text.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of cn) {
    tokens.push(seg);
    if (seg.length >= 2) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
        if (i < seg.length - 2) tokens.push(seg.slice(i, i + 3));
      }
    }
  }
  // 提取英文/数字词
  const en = text.match(/[a-zA-Z0-9_\-]+/g) || [];
  tokens.push(...en.map(w => w.toLowerCase()));
  return [...new Set(tokens)];
}

// === 关联度计算 ===
function calcRelevance(queryTokens, targetText) {
  if (!queryTokens.length || !targetText) return 0;
  const lower = targetText.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (lower.includes(token.toLowerCase())) hits++;
  }
  return Math.round((hits / queryTokens.length) * 100);
}

// === 编辑距离（用于模糊匹配标题）===
function editDistance(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// === 加载所有记忆（缓存优化）===
function loadAllMemories() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const memories = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
      data._file = f;
      memories.push(data);
    } catch (e) { /* skip corrupt files */ }
  }
  return memories;
}

// === Tool handlers ===
const AVAILABLE_TOOLS = 'write_memory, read_memory, search_memory, list_memories, delete_memory';

function handleToolCall(name, args) {
  switch (name) {
    case 'write_memory': {
      const { title, content, tags, category } = args;
      if (!title || !content) return { error: 'title and content are required' };
      const filePath = safePath(title);
      const cat = category || autoClassify(title, content);
      const now = new Date().toISOString();
      // 如果文件已存在，保留 createdAt
      let createdAt = now;
      if (fs.existsSync(filePath)) {
        try {
          const old = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          createdAt = old.createdAt || old.created || now;
        } catch (e) {}
      }
      const data = { title, content, category: cat, tags: tags || [], createdAt, updatedAt: now };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { success: true, message: `Memory "${title}" saved. [category: ${cat}]` };
    }

    case 'read_memory': {
      const { title } = args;
      if (!title) return { error: 'title is required' };
      const filePath = safePath(title);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      // 模糊兜底：找最接近的标题
      const memories = loadAllMemories();
      let bestMatch = null;
      let bestDist = Infinity;
      const queryLower = title.toLowerCase();
      for (const mem of memories) {
        const memTitle = (mem.title || '').toLowerCase();
        // 先试子串包含
        if (memTitle.includes(queryLower) || queryLower.includes(memTitle)) {
          if (!bestMatch || memTitle.length > (bestMatch.title || '').length) {
            bestMatch = mem;
            bestDist = 0;
          }
          continue;
        }
        const dist = editDistance(queryLower, memTitle);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = mem;
        }
      }
      if (bestMatch && bestDist <= Math.max(title.length * 0.4, 3)) {
        const result = { ...bestMatch };
        delete result._file;
        result._fuzzy_match = true;
        result._note = `精确标题未找到，返回最接近的: "${bestMatch.title}"`;
        return result;
      }
      return { error: `Memory "${title}" not found. 建议用 search_memory 搜索关键词，或用 list_memories 查看所有标题。` };
    }

    case 'search_memory': {
      const { query, category, limit } = args;
      if (!query) return { error: 'query is required. 请传入关键词（人名/事件名/日期），多个关键词用空格分隔。' };
      const memories = loadAllMemories();
      const queryTokens = tokenize(query);
      const scored = [];

      for (const mem of memories) {
        // 可选分类过滤
        if (category && mem.category !== category) continue;
        const fullText = [mem.title, mem.content, (mem.tags || []).join(' ')].join(' ');
        const relevance = calcRelevance(queryTokens, fullText);
        if (relevance > 0) {
          scored.push({
            title: mem.title,
            category: mem.category || 'unknown',
            relevance: relevance + '%',
            preview: (mem.content || '').slice(0, 60) + ((mem.content || '').length > 60 ? '...' : ''),
            updatedAt: mem.updatedAt || mem.updated
          });
        }
      }

      // 按关联度排序
      scored.sort((a, b) => parseInt(b.relevance) - parseInt(a.relevance));
      const maxResults = limit || 15;
      const results = scored.slice(0, maxResults);

      if (results.length === 0) {
        return {
          results: [],
          count: 0,
          hint: `没有找到与"${query}"相关的记忆。建议：1) 换更短的关键词；2) 用 list_memories 按分类浏览；3) 尝试人名、日期、事件名。`
        };
      }
      return { results, count: results.length, total_matched: scored.length };
    }

    case 'list_memories': {
      const { category, limit } = args;
      const memories = loadAllMemories();
      let filtered = memories;
      if (category) {
        filtered = memories.filter(m => m.category === category);
      }
      // 按更新时间倒序
      filtered.sort((a, b) => {
        const ta = a.updatedAt || a.updated || '';
        const tb = b.updatedAt || b.updated || '';
        return tb.localeCompare(ta);
      });
      const maxResults = limit || 30;
      const list = filtered.slice(0, maxResults).map(m => ({
        title: m.title,
        category: m.category || 'unknown',
        updatedAt: m.updatedAt || m.updated
      }));
      // 分类统计
      const stats = {};
      for (const m of memories) {
        const cat = m.category || 'unknown';
        stats[cat] = (stats[cat] || 0) + 1;
      }
      return { memories: list, showing: list.length, total: memories.length, stats };
    }

    case 'delete_memory': {
      const { title } = args;
      if (!title) return { error: 'title is required' };
      const filePath = safePath(title);
      if (!fs.existsSync(filePath)) return { error: `Memory "${title}" not found.` };
      fs.unlinkSync(filePath);
      return { success: true, message: `Memory "${title}" deleted.` };
    }

    default:
      return {
        error: `Unknown tool: "${name}". 可用工具: ${AVAILABLE_TOOLS}。请检查工具名是否正确。`,
        available_tools: AVAILABLE_TOOLS.split(', ')
      };
  }
}

// === Tool definitions with detailed descriptions ===
const TOOLS = [
  {
    name: 'write_memory',
    description: '写入或更新一条记忆。会自动分类(rule/daily/tech/thought/archive)。如需指定分类可传category参数。更新已有记忆时传相同title即可覆盖。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '记忆标题，建议格式：日期+事件名，如"0528 · R和白讨论MCP"' },
        content: { type: 'string', description: '记忆内容，尽量精简但保留关键信息' },
        tags: { type: 'array', items: { type: 'string' }, description: '可选标签数组' },
        category: { type: 'string', description: '可选分类: rule/daily/tech/thought/archive/meta，不传则自动判断' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'read_memory',
    description: '按标题读取一条记忆的完整内容。如果标题不完全匹配，会自动尝试模糊匹配最接近的记忆。找不到时会给出建议。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '记忆标题（支持模糊匹配）' }
      },
      required: ['title']
    }
  },
  {
    name: 'search_memory',
    description: '搜索记忆库。传入关键词（人名/事件名/日期/短语），返回按关联度排序的结果列表（含百分比）。多个关键词用空格分隔。支持按分类过滤。注意：请用短关键词而非完整句子。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如"R 生气"、"MCP修复"、"0515"。多词空格分隔。' },
        category: { type: 'string', description: '可选，按分类过滤: rule/daily/tech/thought/archive' },
        limit: { type: 'number', description: '可选，最大返回条数，默认15' }
      },
      required: ['query']
    }
  },
  {
    name: 'list_memories',
    description: '列出记忆库中的记忆标题（按更新时间倒序）。可按分类过滤。返回标题+分类+时间，不含正文内容。用于浏览记忆库有什么。',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '可选，按分类过滤: rule/daily/tech/thought/archive' },
        limit: { type: 'number', description: '可选，最大返回条数，默认30' }
      }
    }
  },
  {
    name: 'delete_memory',
    description: '删除一条记忆。需要精确标题。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '要删除的记忆标题' }
      },
      required: ['title']
    }
  }
];

// === NDJSON stdin parser ===
let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', function (chunk) {
  buffer += chunk;
  while (buffer.length > 0) {
    buffer = buffer.trimStart();
    if (buffer.length === 0) break;
    if (buffer[0] !== '{') {
      const idx = buffer.indexOf('{');
      if (idx === -1) { buffer = ''; break; }
      buffer = buffer.slice(idx);
    }
    let depth = 0, inString = false, escape = false, end = -1;
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;
    const jsonStr = buffer.slice(0, end + 1);
    buffer = buffer.slice(end + 1);
    try {
      const msg = JSON.parse(jsonStr);
      handleMessage(msg);
    } catch (e) {}
  }
});

process.stdin.on('end', function () { process.exit(0); });
process.stdin.on('error', function () { process.exit(1); });

function handleMessage(msg) {
  const method = msg.method;
  const id = msg.id;

  if (method === 'initialize') {
    sendResponse({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'shiro-memory-mcp', version: '2.0.0' } } });
  } else if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    // no response needed
  } else if (method === 'tools/list') {
    sendResponse({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const toolName = msg.params && msg.params.name;
    const toolArgs = (msg.params && msg.params.arguments) || {};
    const result = handleToolCall(toolName, toolArgs);
    if (result.error) {
      sendResponse({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true } });
    } else {
      sendResponse({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
    }
  } else if (id !== undefined) {
    sendResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}. This is shiro-memory-mcp, available tools: ${AVAILABLE_TOOLS}` } });
  }
}

// Keep alive
setInterval(function () {}, 30000);
