const request = require('supertest');
const app = require('../server.js');

describe('Create Call Endpoint', () => {
    let server;

  beforeAll((done) => {
    server = app.listen(0, done); // Dynamic port
  });

  afterAll((done) => {
    server.close(done);
  });
  it('should create a call for a Technician', async () => {
    const res = await request(app)
      .post('/api/create-call')
      .send({ userId: 'user1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('callId');
  });

  it('should return 403 for non-Technician', async () => {
    const res = await request(app)
      .post('/api/create-call')
      .send({ userId: 'user2' }); // Expert
    expect(res.statusCode).toBe(403);
  });
});