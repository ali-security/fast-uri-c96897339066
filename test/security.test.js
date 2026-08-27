'use strict'

const tap = require('tap')
const test = tap.test
const URI = require('../')

test('parse canonicalises IDN / Unicode hosts to their ASCII form', (t) => {
  const cases = [
    {
      input: 'http://127。0。0。1/',
      expectedHost: '127.0.0.1',
      description: 'full-width ideographic stops as octet separators'
    },
    {
      input: 'http://ｅxample.com/',
      expectedHost: 'example.com',
      description: 'fullwidth e as first letter'
    },
    {
      input: 'http://納豆.example.org/',
      expectedHost: 'xn--99zt52a.example.org',
      description: 'CJK label requiring punycode'
    }
  ]

  t.plan(cases.length * 2)

  cases.forEach(({ input, expectedHost, description }) => {
    const parsed = URI.parse(input)
    t.notOk(parsed.error, `parse should not set error: ${description}`)
    t.equal(parsed.host, expectedHost, `host canonicalised to ASCII: ${description}`)
  })
})

test('parse canonicalises IDN hosts for every domainHost scheme', (t) => {
  const cases = [
    { input: 'http://納豆.example.org/', scheme: 'http' },
    { input: 'https://納豆.example.org/', scheme: 'https' },
    { input: 'ws://納豆.example.org/chat', scheme: 'ws' },
    { input: 'wss://納豆.example.org/chat', scheme: 'wss' }
  ]

  t.plan(cases.length * 2)

  cases.forEach(({ input, scheme }) => {
    const parsed = URI.parse(input)
    t.notOk(parsed.error, `${scheme}: parse should not set error`)
    t.equal(parsed.host, 'xn--99zt52a.example.org', `${scheme}: host canonicalised to ASCII`)
  })
})

test('parse canonicalises IDN hosts when the caller opts in with domainHost', (t) => {
  t.plan(4)

  const optedIn = URI.parse('uri://納豆.example.org/en/process', { domainHost: true })
  t.notOk(optedIn.error, 'opted-in parse should not set error')
  t.equal(optedIn.host, 'xn--99zt52a.example.org', 'unregistered scheme honours domainHost')

  const optedOut = URI.parse('uri://納豆.example.org/en/process')
  t.notOk(optedOut.error, 'default parse should not set error')
  t.equal(optedOut.host, '納豆.example.org', 'unregistered scheme keeps the IRI host by default')
})

test('parse canonicalises percent-encoded UTF-8 hosts', (t) => {
  t.plan(2)

  const parsed = URI.parse('http://%E7%B4%8D%E8%B1%86.example.org/')
  t.notOk(parsed.error, 'parse should not set error')
  t.equal(parsed.host, 'xn--99zt52a.example.org', 'percent-encoded UTF-8 host canonicalised to punycode')
})

test('normalize and equal propagate the canonicalised host', (t) => {
  t.plan(4)

  t.equal(URI.normalize('http://納豆.example.org/'), 'http://xn--99zt52a.example.org/', 'normalize serialises the ASCII host')
  t.equal(URI.normalize('http://ｅxample.com/'), 'http://example.com/', 'normalize folds fullwidth characters')
  t.equal(URI.equal('http://ｅxample.com/', 'http://example.com/'), true, 'fullwidth host equals its ASCII form')
  t.equal(URI.equal('http://納豆.example.org/', 'http://xn--99zt52a.example.org/'), true, 'CJK host equals its punycode form')
})

test('parse does not re-canonicalise IP literal hosts', (t) => {
  t.plan(8)

  const ipv4 = URI.parse('http://127.0.0.1/')
  t.notOk(ipv4.error, 'IPv4 host should not error')
  t.equal(ipv4.host, '127.0.0.1', 'IPv4 host is left unchanged')

  const mixed = URI.parse('http://10.10.10.10.example.com/')
  t.notOk(mixed.error, 'mixed IPv4 / reg-name host should not error')
  t.equal(mixed.host, '10.10.10.10.example.com', 'mixed IPv4 / reg-name host is left unchanged')

  const bracketed = URI.parse('http://[2001:dbZ::7]/')
  t.notOk(bracketed.error, 'bracketed host should not error')
  t.equal(bracketed.host, '[2001:dbz::7]', 'bracketed host is left to the IPv6 normalizer')

  t.equal(URI.parse('http://[2001:db8::1]/').host, '2001:db8::1', 'IPv6 host is not re-canonicalised')

  // the WHATWG parser accepts this literal and would re-serialise it as
  // '[0:1:2:3:4:5:6:7]', while normalizeIPv6 keeps the bracketed source form
  t.equal(URI.parse('http://[::1:2:3:4:5:6:7]/').host, '[::1:2:3:4:5:6:7]', 'bracketed IPv6 literal keeps its source form')
})

test('parse marks malformed authority and port inputs as errors', (t) => {
  const malformedCases = [
    {
      input: 'http://[::1]foo',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://[::1]:80abc/path',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://example.com:80abc/path',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://[::1]:65536',
      expectedError: 'URI port is malformed.'
    }
  ]

  t.plan(malformedCases.length)

  malformedCases.forEach(({ input, expectedError }) => {
    t.equal(URI.parse(input).error, expectedError, input)
  })
})

test('normalize does not canonicalize malformed URLs into different valid URLs', (t) => {
  const malformedCases = [
    'http://[::1]foo',
    'http://[::1]:80abc/path',
    'http://example.com:80abc/path',
    'http://[::1]:65536'
  ]

  t.plan(malformedCases.length)

  malformedCases.forEach((input) => {
    t.equal(URI.normalize(input), input, input)
  })
})

test('equal returns false when either side is malformed', (t) => {
  const malformedPairs = [
    ['http://[::1]foo', 'http://[::1]/foo'],
    ['http://[::1]:80abc/path', 'http://[::1]/abc/path'],
    ['http://example.com:80abc/path', 'http://example.com/abc/path'],
    ['http://[::1]:65536', 'http://[::1]:65536/']
  ]

  t.plan(malformedPairs.length)

  malformedPairs.forEach(([left, right]) => {
    t.equal(URI.equal(left, right), false, `${left} != ${right}`)
  })
})

test('normalize preserves encoded authority delimiters in host', (t) => {
  const cases = [
    ['http://trusted.com%40evil.com/', 'http://trusted.com%40evil.com/'],
    ['http://example.com%3A8080/', 'http://example.com%3A8080/'],
    ['http://example.com%2Fevil.com/path', 'http://example.com%2Fevil.com/path'],
    ['http://example.com%23fragment/path', 'http://example.com%23fragment/path'],
    ['http://example.com%3Fq=evil/path', 'http://example.com%3Fq=evil/path'],
    ['http://user%3Apass%40evil.com/', 'http://user%3Apass%40evil.com/'],
    ['http://user@trusted.com%40evil.com/', 'http://user@trusted.com%40evil.com/'],
    ['https://trusted.com%40evil.com/', 'https://trusted.com%40evil.com/'],
    ['ws://trusted.com%40evil.com/chat', 'ws://trusted.com%40evil.com/chat'],
    ['wss://trusted.com%40evil.com/chat', 'wss://trusted.com%40evil.com/chat']
  ]

  t.plan(cases.length)

  cases.forEach(([input, expected]) => {
    t.equal(URI.normalize(input), expected, input)
  })
})

test('parse preserves encoded authority delimiters in host', (t) => {
  const cases = [
    ['http://trusted.com%40evil.com/', 'trusted.com%40evil.com'],
    ['http://example.com%3A8080/', 'example.com%3A8080'],
    ['http://user%3Apass%40evil.com/', 'user%3Apass%40evil.com']
  ]

  t.plan(cases.length)

  cases.forEach(([input, expectedHost]) => {
    t.equal(URI.parse(input).host, expectedHost, input)
  })
})

test('equal returns false when encoded delimiters differ from live delimiters', (t) => {
  const pairs = [
    ['http://trusted.com%40evil.com/', 'http://trusted.com@evil.com/'],
    ['http://example.com%3A8080/', 'http://example.com:8080/']
  ]

  t.plan(pairs.length)

  pairs.forEach(([left, right]) => {
    t.equal(URI.equal(left, right, {}), false, `${left} != ${right}`)
  })
})

test('resolve preserves encoded authority delimiters', (t) => {
  const result = URI.resolve('http://base.com/', '//trusted.com%40evil.com/path')
  const parsed = URI.parse(result)

  t.plan(1)
  t.not(parsed.host, 'evil.com', '//trusted.com%40evil.com/path')
})

test('serialize escapes authority delimiters in host field', (t) => {
  const result = URI.serialize({ scheme: 'http', host: 'trusted.com@evil.com', path: '/' })
  const parsed = URI.parse(result)

  t.plan(1)
  t.not(parsed.host, 'evil.com', 'host: trusted.com@evil.com')
})

test('normalize does not double-decode %2540 into a live @', (t) => {
  const result = URI.normalize('http://trusted.com%2540evil.com/')
  const parsed = URI.parse(result)

  t.plan(1)
  t.not(parsed.host, 'trusted.com@evil.com', 'http://trusted.com%2540evil.com/')
})
