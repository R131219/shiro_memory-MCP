const readline = require('readline');

const mcpVersion = '2025-06-18';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: mcpVersion,
          capabilities: {
            tools: {
              mem_save: { description: '保存一条记忆', inputSchema: { type: 'object', properties: { memoryId: { type: 'string' }, content: { type: 'object' } }, required: ['memoryId', 'content'] } },
              mem_search: { description: '搜索记忆', inputSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] } }
            },
            resources: {}
          },
          serverInfo: { name: 'shiro_memory', version: '2.0.0' }
        }
      }) + '\n');
      return;
    }

    if (method === 'initialized') return;

    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: { success: true, data: {} } }) + '\n');
  } catch (e) {
    // ignore
  }
});
