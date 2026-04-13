const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/accounts/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', data);
  });
});
req.on('error', error => console.error('ERR', error));
req.write(JSON.stringify({ username: 'Valera_OwnerSite1111', password: '12345678' }));
req.end();
