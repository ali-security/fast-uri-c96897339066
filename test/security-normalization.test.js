'use strict'

const tap = require('tap')
const test = tap.test
const URI = require('../')

test('parse preserves reserved path escapes as data', (t) => {
  const components = URI.parse('http://example.com/a%2Fb/public/%2e%2e/admin')

  t.equal(components.path, '/a%2Fb/public/%2E%2E/admin')
  t.end()
})

test('normalize preserves percent-encoded path separators and dot segments', (t) => {
  t.equal(
    URI.normalize('http://example.com/public/%2e%2e/admin'),
    'http://example.com/public/%2E%2E/admin'
  )

  t.equal(
    URI.normalize('http://example.com/a%2Fb'),
    'http://example.com/a%2Fb'
  )

  t.end()
})

test('resolve does not decode reserved path escapes into live path syntax', (t) => {
  t.equal(
    URI.resolve('http://example.com/public/', '%2e%2e/admin'),
    'http://example.com/public/%2E%2E/admin'
  )

  t.equal(
    URI.resolve('http://example.com/a/b', 'c%2Fd'),
    'http://example.com/a/c%2Fd'
  )

  t.end()
})

test('equal does not treat reserved path escapes as live path syntax', (t) => {
  t.equal(
    URI.equal('http://example.com/public/%2e%2e/admin', 'http://example.com/admin', {}),
    false
  )

  t.equal(
    URI.equal('http://example.com/a%2Fb', 'http://example.com/a/b', {}),
    false
  )

  t.end()
})
