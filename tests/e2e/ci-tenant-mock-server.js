const http = require('http');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3001');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    res.end(JSON.stringify({ data: { active: true, identity: { realm: 'tenant', tenant_id: 'tenant-mock' } } }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/tenant/passengers') {
    res.end(JSON.stringify({ data: [] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/tenant/addresses') {
    res.end(JSON.stringify({ data: [] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/tenant/cost-centers') {
    res.end(JSON.stringify({ data: [] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/tenant/bookings/page-model/new') {
    res.end(JSON.stringify({ data: { emptyState: null, actions: { submit: { enabled: true } }, prefill: {} } }));
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(3001, '127.0.0.1', () => console.log('Mock on 3001'));
