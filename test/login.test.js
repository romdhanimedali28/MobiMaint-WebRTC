const request = require('supertest');
const app = require('../server.js'); // Adjust path if needed

describe('Login Endpoint', () => {
  it('should return success for valid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'user1', password: 'P' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('userId', 'user1');
    expect(res.body).toHaveProperty('role', 'Technician');
    expect(res.body).toHaveProperty('message', 'Login successful');
  });

  it('should return 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'user1', password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid username or password');
  });
});