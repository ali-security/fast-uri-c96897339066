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

  // a bracketed literal that is not a valid IP-literal is reported as
  // malformed rather than IDN-canonicalised: the host itself is handed back
  // unrewritten (only lowercased) so nothing resolves to a different address
  const bracketed = URI.parse('http://[2001:dbZ::7]/')
  t.equal(bracketed.error, 'URI host is malformed.', 'malformed bracketed host errors')
  t.equal(bracketed.host, '[2001:dbz::7]', 'bracketed host is left to the IPv6 normalizer')

  t.equal(URI.parse('http://[2001:db8::1]/').host, '2001:db8::1', 'IPv6 host is not re-canonicalised')

  // this literal is a valid IPv6 address ("::" standing in for a single zero
  // hextet), so it normalizes to the same canonical form the WHATWG parser
  // produces instead of being kept in its bracketed source form
  t.equal(URI.parse('http://[::1:2:3:4:5:6:7]/').host, '0:1:2:3:4:5:6:7', 'bracketed IPv6 literal is canonicalised')
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

test('parse rejects a literal backslash in the authority as malformed (RFC 3986)', (t) => {
  // Regression for the host-confusion bypass: a literal "\" is invalid RFC 3986
  // syntax and must be flagged malformed, not silently rewritten. Otherwise "\"
  // acts as a host delimiter here while Node's native URL parses a different
  // host, defeating a host-based SSRF/redirect/origin allowlist.
  const cases = [
    'http://evil.com\\@allowed.com',
    'https://169.254.169.254\\@trusted.example.com',
    'http://127.0.0.1\\@public.example.com',
    'https://attacker.com\\@api.internal',
    'http://a\\@b',
    'ws://evil.com\\@allowed.com/chat',
    'wss://evil.com\\@allowed.com/chat',
    'http://evil.com\\%40allowed.com',
    '//evil.com\\@allowed.com'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    t.equal(
      URI.parse(input).error,
      'URI authority must not contain a literal backslash.',
      input
    )
  })
})

test('parse does not report an allowlisted host that diverges from the native URL parser', (t) => {
  // Advisory PoC (GHSA-v2hh-gcrm-f6hx): fast-uri reported host "allowed.com"
  // (userinfo "evil.com\") while Node's WHATWG URL resolves host "evil.com", so a
  // host allowlist passed the check and the subsequent fetch() reached the
  // attacker host. Flagging the input malformed closes that divergence.
  const input = 'http://evil.com\\@allowed.com'
  const parsed = URI.parse(input)

  t.plan(3)
  t.ok(parsed.error, 'literal-backslash authority is malformed')
  t.equal(new URL(input).hostname, 'evil.com', 'native URL resolves the attacker host')
  t.equal(URI.equal(input, 'http://allowed.com/'), false, 'a malformed URI never compares equal to an allowlisted one')
})

test('normalize does not canonicalize a literal-backslash URI into a different valid URL', (t) => {
  const cases = [
    'http://evil.com\\@allowed.com',
    'https://attacker.com\\@api.internal'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    t.equal(URI.normalize(input), input, input)
  })
})

test('parse leaves percent-encoded %5C untouched as encoded data (not rejected)', (t) => {
  // Only the literal "\" byte is rejected; %5C stays valid encoded data and
  // does not diverge from the native URL parser, so it must not be flagged.
  const input = 'http://evil.com%5C@allowed.com'
  const parsed = URI.parse(input)

  t.plan(2)
  t.notOk(parsed.error, '%5C is valid encoded data, not malformed')
  t.equal(parsed.host, new URL(input).hostname, '%5C host matches native URL (no divergence)')
})

test('parse does not reject a literal backslash in the query or fragment', (t) => {
  // The rejection is scoped to the authority/path (the host-confusion surface);
  // a backslash after "?"/"#" is normalized as encoded data as before.
  const parsed = URI.parse('http://host.example.com/?x=\\y#z\\w')

  t.plan(2)
  t.notOk(parsed.error, 'backslash in query/fragment does not mark the URI malformed')
  t.equal(parsed.host, 'host.example.com', 'host parsed normally')
})

test('parse rejects a malformed authority introducer (\\\\, /\\, \\/) in place of //', (t) => {
  // Regression: "\\", "/\\", "\\/" after the scheme colon are not valid authority
  // introducers. Node's URL treats "\\" as interchangeable with "/" on special
  // schemes, so "http:\\\\evil.com/path" would be parsed as host "evil.com" by
  // Node, but fast-uri must reject it as malformed to prevent SSRF/redirect bypass.
  const cases = [
    'http:\\\\evil.com/path',
    'http:/\\evil.com/path',
    'http:\\/evil.com/path',
    'ws:\\\\evil.com/chat',
    'wss:\\\\evil.com/chat',
    'ftp:\\\\evil.com/',
    '\\\\evil.com/path'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    t.equal(
      URI.parse(input).error,
      'URI authority must not contain a literal backslash.',
      input
    )
  })
})

test('normalize does not canonicalize a malformed-authority-introducer URI', (t) => {
  const cases = [
    'http:\\\\evil.com/path',
    'http:/\\evil.com/path'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    t.equal(URI.normalize(input), input, input)
  })
})

test('equal returns false for malformed-authority-introducer URIs', (t) => {
  const pairs = [
    ['http:\\\\evil.com/path', 'http://evil.com/path'],
    ['http:/\\evil.com/path', 'http://evil.com/path']
  ]

  t.plan(pairs.length)

  pairs.forEach(([left, right]) => {
    t.equal(URI.equal(left, right), false, `${left} != ${right}`)
  })
})

test('resolve throws on malformed authority introducer', (t) => {
  // resolve() returns a plain string with no error field, so the only safe
  // behavior is to throw when either component has a malformed authority.
  const pairs = [
    ['https://allowed.com/', '\\\\evil.com/path'],
    ['\\\\evil.com/path', 'https://allowed.com/'],
    ['https://allowed.com/', 'http:/\\evil.com/path'],
    ['https://allowed.com/', 'http:\\/evil.com/path']
  ]

  t.plan(pairs.length)

  pairs.forEach(([base, rel]) => {
    t.throws(
      () => URI.resolve(base, rel),
      /URI authority must not contain a literal backslash/,
      `${base} + ${rel}`
    )
  })
})

test('parse rejects a whitespace-split authority introducer (TAB, LF, CR)', (t) => {
  // The WHATWG URL parser removes TAB (U+0009), LF (U+000A) and CR (U+000D) from
  // the input before parsing, so a stripped character wedged into the introducer
  // ("/<TAB>\\", "/<TAB>/", or a leading "<TAB>//") reaches an authority in Node
  // while fast-uri would otherwise fold it into the path. These must be rejected
  // like the adjacent "\\", "/\\", "\\/" forms.
  const cases = [
    { input: '/\t\\evil.com/path', expectedError: 'URI authority must not contain a literal backslash.' },
    { input: '/\t/evil.com/path', expectedError: 'URI authority introducer must not contain whitespace.' },
    { input: '/\n\\evil.com/path', expectedError: 'URI authority must not contain a literal backslash.' },
    { input: '/\r\\evil.com/path', expectedError: 'URI authority must not contain a literal backslash.' },
    { input: '\t//evil.com/path', expectedError: 'URI authority introducer must not contain whitespace.' },
    { input: '\t/\\evil.com/path', expectedError: 'URI authority must not contain a literal backslash.' },
    { input: 'https:/\t/evil.com/path', expectedError: 'URI authority introducer must not contain whitespace.' }
  ]

  t.plan(cases.length)

  cases.forEach(({ input, expectedError }) => {
    t.equal(URI.parse(input).error, expectedError, JSON.stringify(input))
  })
})

test('resolve throws on a whitespace-split authority introducer', (t) => {
  const pairs = [
    ['https://allowed.com/', '/\t\\evil.com/path'],
    ['https://allowed.com/', '/\t/evil.com/path'],
    ['https://allowed.com/', '/\n\\evil.com/path'],
    ['/\t/evil.com/path', 'https://allowed.com/']
  ]

  t.plan(pairs.length)

  pairs.forEach(([base, rel]) => {
    t.throws(
      () => URI.resolve(base, rel),
      /URI authority (must not contain a literal backslash|introducer must not contain whitespace)/,
      `${JSON.stringify(base)} + ${JSON.stringify(rel)}`
    )
  })
})

test('parse rejects a malformed authority introducer followed by a colon', (t) => {
  // A colon later in the reference must not buy the introducer an exemption: a
  // backslash is not a legal scheme character, so "\\evil.com:80/path" is still
  // a "\\"-for-"//" introducer, and Node resolves it against a base to the
  // authority "evil.com:80". Same for a userinfo colon ("\\user:pass@evil.com/")
  // and for a backslash reached only after the TAB/LF/CR Node strips.
  const cases = [
    '\\\\evil.com:80/path',
    '\\\\user:pass@evil.com/',
    '/\\evil.com:80/path',
    '\\/evil.com:80/path',
    '\t\\\\evil.com:80/path'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    t.equal(
      URI.parse(input).error,
      'URI authority must not contain a literal backslash.',
      JSON.stringify(input)
    )
  })
})

test('resolve throws on a malformed authority introducer followed by a colon', (t) => {
  const pairs = [
    ['https://allowed.com/', '\\\\evil.com:80/path'],
    ['https://allowed.com/', '\\\\user:pass@evil.com/'],
    ['\\\\evil.com:80/path', 'https://allowed.com/']
  ]

  t.plan(pairs.length)

  pairs.forEach(([base, rel]) => {
    t.throws(
      () => URI.resolve(base, rel),
      /URI authority must not contain a literal backslash/,
      `${JSON.stringify(base)} + ${JSON.stringify(rel)}`
    )
  })
})

test('parse does not reject valid authority introducer patterns', (t) => {
  // No false positives: "//" introducer and scheme-less "//" must be valid.
  const cases = [
    'http://good.com/',
    'https://good.com/',
    'ws://good.com/chat',
    'wss://good.com/chat',
    'ftp://good.com/',
    '//good.com/path',
    '/absolute/path',
    'relative/path',
    // a colon in the authority or the path is not an introducer concern
    '//user:pass@good.com:80/path',
    'mailto:user@example.com',
    'foo:bar/baz'
  ]

  t.plan(cases.length)

  cases.forEach((input) => {
    const parsed = URI.parse(input)
    t.notOk(parsed.error, input)
  })
})
