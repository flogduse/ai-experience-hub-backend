import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { authenticate, optionalAuth } from '../src/middlewares/auth.middleware.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

function run(middleware, req) {
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, body, nextCalled, req };
}

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

test('authenticate rejects a missing token with 401', () => {
  const { statusCode, nextCalled } = run(authenticate, { header: () => undefined });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
});

test('authenticate rejects a token signed with the wrong secret', () => {
  const bad = jwt.sign({ id: 'u1' }, 'some-other-secret');
  const { statusCode } = run(authenticate, {
    header: () => `Bearer ${bad}`,
  });
  assert.equal(statusCode, 401);
});

test('authenticate attaches decoded user and calls next for a valid token', () => {
  const token = tokenFor({ id: 'u1', username: 'ada', role: 'USER' });
  const req = { header: () => `Bearer ${token}` };
  const { nextCalled, statusCode } = run(authenticate, req);
  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
  assert.equal(req.user.id, 'u1');
  assert.equal(req.user.role, 'USER');
});

test('optionalAuth never blocks, even with an invalid token', () => {
  const noToken = run(optionalAuth, { header: () => undefined });
  assert.equal(noToken.nextCalled, true);
  assert.equal(noToken.req.user, undefined);

  const badToken = run(optionalAuth, { header: () => 'Bearer nonsense' });
  assert.equal(badToken.nextCalled, true);
  assert.equal(badToken.req.user, undefined);
});

test('optionalAuth populates the user for a valid token', () => {
  const token = tokenFor({ id: 'u2', username: 'bob', role: 'MODERATOR' });
  const req = { header: () => `Bearer ${token}` };
  const { nextCalled } = run(optionalAuth, req);
  assert.equal(nextCalled, true);
  assert.equal(req.user.username, 'bob');
  assert.equal(req.user.role, 'MODERATOR');
});
