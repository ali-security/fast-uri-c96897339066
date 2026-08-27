'use strict'

const tap = require('tap')
const test = tap.test
const URI = require('../')

const MALFORMED_SCHEME_ERROR = 'URI scheme is malformed.'

// U+212A KELVIN SIGN and U+017F LATIN SMALL LETTER LONG S both case-fold to an
// ASCII letter, so a scheme built from them is only rejected when the RFC 3986
// grammar is checked before any case folding (and without the /i flag, which
// turns on Unicode simple case folding). Built from code points so the source
// file stays ASCII and the intent can not be lost to an encoding round trip.
const KELVIN_SIGN = String.fromCharCode(0x212A)
const LONG_S = String.fromCharCode(0x017F)
const E_ACUTE = String.fromCharCode(0x00E9)

const malformedSchemes = [
  '%2f%2fevil.example:/pwn',
  '%u002f%u002fevil.example:/pwn',
  '%0d%0aSet-Cookie:%20sid=attacker:/p',
  'foo%3Abar:value',
  'foo%2Fbar:value',
  '1http://example.com/',
  'foo_bar:value',
  E_ACUTE + 'xample:value',
  KELVIN_SIGN + 'ttp://example.com/',
  LONG_S + 'cheme:value'
]

test('parse validates the decoded scheme against RFC 3986', (t) => {
  const validSchemes = [
    ['a:value', 'a'],
    ['HTTP://example.com/', 'http'],
    ['a1+.-:value', 'a1+.-'],
    ['%4Aavascript:alert(1)', 'javascript'],
    ['foo%2Bbar:value', 'foo+bar'],
    ['%u006Aavascript:1', 'javascript'],
    ['ht%74ps://example.com/', 'https']
  ]

  for (const [uri, scheme] of validSchemes) {
    const parsed = URI.parse(uri)
    t.equal(parsed.error, undefined, uri)
    t.equal(parsed.scheme, scheme, uri + ' scheme')
  }

  for (const uri of malformedSchemes) {
    const parsed = URI.parse(uri)
    t.equal(parsed.error, MALFORMED_SCHEME_ERROR, JSON.stringify(uri))
  }
  t.end()
})

test('decoded schemes select their scheme handlers', (t) => {
  t.equal(
    URI.normalize('ht%74ps://example.com:443'),
    'https://example.com/',
    'HTTP normalization runs after decoding the scheme'
  )

  // an encoded scheme must not skip the scheme specific parsing its decoded
  // form implies: the ws handler moves the path into resourceName
  const ws = URI.parse('w%73://example.com/chat')
  t.equal(ws.scheme, 'ws', 'scheme is decoded')
  t.equal(ws.resourceName, '/chat', 'ws parsing runs after decoding the scheme')
  t.equal(ws.secure, false, 'ws handler populated the secure flag')
  t.end()
})

test('normalize preserves schemes that decode to invalid identifiers', (t) => {
  for (const uri of malformedSchemes) {
    t.equal(URI.normalize(uri), uri, JSON.stringify(uri))
  }
  t.end()
})

test('scheme normalization cannot introduce authority or control delimiters', (t) => {
  // Advisory PoC (GHSA-jqff-g426-hqxp): "%2f%2fevil.example:/pwn" parses with no
  // host, but decoding the scheme turned it into "//evil.example:/pwn", which
  // reparses with the attacker's host - defeating a redirect or host allowlist
  // check performed on the normalized value. A "%0d%0a" scheme reached the
  // output as a raw CR LF, allowing header injection.
  const authority = '%2f%2fevil.example:/pwn'
  const crlf = '%0d%0aSet-Cookie:%20sid=attacker:/p'

  t.equal(URI.parse(authority).host, undefined, 'original input has no authority')
  t.equal(URI.normalize(authority), authority, 'normalization does not create an authority')
  t.equal(URI.parse(URI.normalize(authority)).host, undefined, 'the normalized value still has no host')
  t.not(URI.parse(URI.normalize(authority)).host, 'evil.example', 'the normalized value never resolves to the attacker host')
  t.equal(URI.normalize(crlf), crlf, 'normalization does not emit raw CRLF')
  t.equal(URI.normalize(crlf).includes('\r\n'), false, 'normalized output contains no raw CRLF')
  t.end()
})

test('equal returns false for malformed decoded schemes', (t) => {
  for (const uri of malformedSchemes) {
    t.equal(URI.equal(uri, uri, {}), false, JSON.stringify(uri))
  }
  t.end()
})

test('resolve rejects malformed decoded schemes in either input', (t) => {
  t.throws(
    () => URI.resolve('%2f%2fevil.example:/base', 'child'),
    /URI scheme is malformed\./,
    'malformed base'
  )
  t.throws(
    () => URI.resolve('https://allowed.example/app/', '%2f%2fevil.example:/pwn'),
    /URI scheme is malformed\./,
    'malformed relative reference'
  )
  t.end()
})

test('serialize validates decoded component schemes', (t) => {
  t.equal(
    URI.serialize({ scheme: 'foo%2Bbar', path: 'value' }),
    'foo+bar:value',
    'valid decoded scheme is serialized'
  )
  t.throws(
    () => URI.serialize({ scheme: '//evil.example', path: '/pwn' }),
    /URI scheme is malformed\./,
    'raw invalid scheme'
  )
  t.throws(
    () => URI.serialize({ scheme: '%2f%2fevil.example', path: '/pwn' }),
    /URI scheme is malformed\./,
    'encoded invalid scheme'
  )
  t.equal(
    URI.equal(
      { scheme: '%2f%2fevil.example', path: '/pwn' },
      { scheme: '%2f%2fevil.example', path: '/pwn' },
      {}
    ),
    false,
    'equality fails closed for malformed component objects'
  )
  t.end()
})
