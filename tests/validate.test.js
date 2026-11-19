import test from 'node:test';
import assert from 'node:assert/strict';

import { schemas, validate } from '../src/middlewares/validate.middleware.js';

// Small express-free harness: the middleware only needs req/res/next.
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

test('register accepts a valid body and normalises the email', () => {
  const { nextCalled, req, statusCode } = run(validate(schemas.register), {
    body: { username: 'ada_92', email: '  Ada@Example.COM ', password: 'correct-horse' },
    params: {},
    query: {},
  });
  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
  assert.equal(req.body.email, 'ada@example.com');
});

test('register rejects invalid usernames, emails and short passwords', () => {
  const cases = [
    [{ username: 'ab', email: 'a@b.co', password: 'longenough' }, 'ab'],
    [{ username: 'has space', email: 'a@b.co', password: 'longenough' }, 'space'],
    [{ username: 'validname', email: 'not-an-email', password: 'longenough' }, 'email'],
    [{ username: 'validname', email: 'a@b.co', password: 'short' }, 'password'],
  ];
  for (const [body] of cases) {
    const { statusCode, body: payload, nextCalled } = run(validate(schemas.register), {
      body,
      params: {},
      query: {},
    });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 400);
    assert.equal(payload.error, 'Validation failed.');
    assert.ok(payload.details.length >= 1);
    assert.ok(payload.details.every((d) => typeof d.field === 'string'));
  }
});

test('register rejects unknown fields instead of silently dropping them', () => {
  const { statusCode } = run(validate(schemas.register), {
    body: { username: 'validname', email: 'a@b.co', password: 'longenough', role: 'ADMIN' },
    params: {},
    query: {},
  });
  assert.equal(statusCode, 400);
});

test('submitProject requires https and a real description', () => {
  const base = {
    title: 'My project',
    description: 'A useful description of the project.',
    externalUrl: 'https://example.com/app',
  };

  const ok = run(validate(schemas.submitProject), { body: base, params: {}, query: {} });
  assert.equal(ok.nextCalled, true);

  const http = run(validate(schemas.submitProject), {
    body: { ...base, externalUrl: 'http://example.com/app' },
    params: {},
    query: {},
  });
  assert.equal(http.statusCode, 400);

  const short = run(validate(schemas.submitProject), {
    body: { ...base, description: 'too short' },
    params: {},
    query: {},
  });
  assert.equal(short.statusCode, 400);
});

test('id params must be UUIDs', () => {
  const bad = run(validate(schemas.idParam), { body: {}, params: { id: '42' }, query: {} });
  assert.equal(bad.statusCode, 400);

  const good = run(validate(schemas.idParam), {
    body: {},
    params: { id: '3f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b' },
    query: {},
  });
  assert.equal(good.nextCalled, true);
});

test('pagination coerces numbers and caps the page size', () => {
  const { req, nextCalled } = run(validate(schemas.pagination), {
    body: {},
    params: {},
    query: { page: '2', limit: '20' },
  });
  assert.equal(nextCalled, true);
  assert.equal(req.query.page, 2);
  assert.equal(req.query.limit, 20);

  const tooLarge = run(validate(schemas.pagination), {
    body: {},
    params: {},
    query: { limit: '500' },
  });
  assert.equal(tooLarge.statusCode, 400);
});
