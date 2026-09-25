# Test conventions

- Contract test names use present-tense English verbs and describe an observable result. `describe` names identify the public API and one contract dimension.
- Keep one behavioral scenario per test. Split cases that need independent clients, causes, or terminal outcomes.
- Separate fixture setup, protocol actions, observations/assertions, and cleanup into meaningful paragraphs with a blank line between them.
- Use domain-specific scenario factories for repeated construction, while keeping protocol messages and assertions visible in the test body.
- Express asynchronous waits through named assertion helpers. Keep raw `vi.waitFor` inside those helpers when the condition has domain meaning.
- Use controlled sockets, deferred promises, and explicit acknowledgements instead of real network or wall-clock timing.
- Complete `dispose`, unsubscribe, and close handshakes explicitly in the test that created them.
