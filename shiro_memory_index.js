const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', async (line) => {
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: req.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'shiro_memory', version: '2.0.0' }
        }
      }) + '\n');
    } else if (req.method === 'initialized') return;
    else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\n');
  } catch (e) {}
});
