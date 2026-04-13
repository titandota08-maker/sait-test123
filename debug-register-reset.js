const http = require('http');
const request = (path, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  }, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});

(async () => {
  const email = 'testuser@example.com';
  const username = 'testuser';
  console.log('Registering user', email);
  const register = await request('/api/accounts/register', { username, password: '12345678', confirmPassword: '12345678', email });
  console.log('REGISTER', register.status, register.body);
  const reset = await request('/api/accounts/password-reset-request', { email });
  console.log('RESET', reset.status, reset.body);
})();
