# Changelog

## [0.3.0](https://github.com/1dot5/zenn-syndicate/compare/zenn-syndicate-v0.2.0...zenn-syndicate-v0.3.0) (2026-08-30)


### ⚠ BREAKING CHANGES

* `notice` is no longer a config field, and `canonicalUrl` is no longer a recognized front matter key. Both are silently ignored now rather than doing anything.

### Features

* drop the notice/canonicalUrl feature ([6f260dd](https://github.com/1dot5/zenn-syndicate/commit/6f260ddfce99eca0d65a51418e82170f5b8aa217))


### Bug Fixes

* drop the unused sharp optional dependency ([578c46a](https://github.com/1dot5/zenn-syndicate/commit/578c46ad1f3cb8ed753e02679e3e9f5f9f04f9eb))

## [0.2.0](https://github.com/1dot5/zenn-syndicate/compare/zenn-syndicate-v0.1.0...zenn-syndicate-v0.2.0) (2026-08-30)


### Features

* initial implementation of zenn-syndicate ([29b812c](https://github.com/1dot5/zenn-syndicate/commit/29b812c35cbf8931c0dbf282ca2d3ba96ab31491))


### Bug Fixes

* ignore CHANGELOG.md in prettier format:check ([445013d](https://github.com/1dot5/zenn-syndicate/commit/445013d379feca7847ac380c25512507e21da2da))
* install the packed tarball in CI smoke test, bump sharp ([0f9686a](https://github.com/1dot5/zenn-syndicate/commit/0f9686a80f5f26b3814c6401dacd86c79fad2ef4))
