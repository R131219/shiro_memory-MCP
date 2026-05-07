// == shiro_memory_index.js ==
// MCP 服务端入口 — 加载 shiro_memory.js 并启动 JSON-RPC 协议
require('./shiro_memory.js');

const M = { name: 'shiro_memory', version: '2.0.0', entry: 'shiro_memory.js' };
if (typeof module !== 'undefined' && module.exports) { module.exports = M; }
if (typeof window !== 'undefined') { window.ShiroMemory = M; }
