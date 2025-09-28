const request = require('supertest');
const app = require('../server.js');

describe('Experts Endpoint', () => {
  it('should return a list of experts', async () => {
    const res = await request(app).get('/api/experts');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('totalExperts');
    expect(res.body.experts).toBeInstanceOf(Array);
    expect(res.body.experts.length).toBeGreaterThan(0); // At least one expert in hardcoded data
    expect(res.body.experts[0]).toHaveProperty('status', expect.any(String));
  });
});