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
