// Cross-language conformance: hrpc's half of hrpc-test's wire vectors.
//
// The framing families (envelope, error, boundary, negative, sequence) belong to
// bare-rpc and are covered by hrpc-test's own suite. What is hrpc's to keep
// stable is the dispatch family: command ids assigned by registration order, and
// the request/response types each id maps to.
const p = require('path')
const fs = require('fs')
const test = require('brittle')
const c = require('compact-encoding')
const m = require('bare-rpc/messages')

const HRPC = require('../builder.cjs')

const REQUEST = 1
const RESPONSE = 2

const DISPATCH_DIR = p.join(
  p.dirname(require.resolve('hrpc-test/package')),
  'fixtures',
  'dispatch'
)
const SCHEMA_DIR = p.join(DISPATCH_DIR, 'schema')

const frozen = readJSON(p.join(DISPATCH_DIR, 'hrpc', 'hrpc.json'))

// Registering from the frozen spec rather than a hand-copy: the ids are what is
// under test, so the inputs have to come from the fixture itself
function rebuild() {
  const hrpc = HRPC.from(SCHEMA_DIR, null)
  const ns = hrpc.namespace('greeter')

  for (const handler of frozen.schema) {
    ns.register({
      name: handler.name.split('/')[1],
      request: handler.request,
      response: handler.response
    })
  }

  return hrpc
}

test('builder reproduces the frozen dispatch spec', (t) => {
  t.alike(JSON.parse(JSON.stringify(rebuild().toJSON())), frozen)
})

test('dispatch frames carry the ids and payloads hrpc-test froze', (t) => {
  const handlers = rebuild().toJSON().schema
  const codecs = require(p.join(SCHEMA_DIR, 'index.js'))

  const frames = readJSON(p.join(DISPATCH_DIR, 'frames.json'))
  const messages = readJSON(p.join(DISPATCH_DIR, 'messages.json'))

  t.is(frames.length, messages.length, 'one frame per message')

  // Responses carry no command, so a client correlates them to the request id
  const commandsById = new Map()

  for (let i = 0; i < frames.length; i++) {
    const note = messages[i].note
    const frame = decodeFrame(frames[i])

    let handler
    if (frame.type === REQUEST) {
      handler = handlers.find((h) => h.id === frame.command)
      t.ok(handler, note + ': command ' + frame.command + ' is registered')
      commandsById.set(frame.id, frame.command)
    } else {
      t.is(frame.type, RESPONSE, note + ': is a response')
      handler = handlers.find((h) => h.id === commandsById.get(frame.id))
      t.ok(handler, note + ': responds to a request seen earlier')
    }

    if (!handler) continue

    const side = frame.type === REQUEST ? handler.request : handler.response
    const enc = codecs.getEncoding(side.name)
    const data = Buffer.from(messages[i].descriptor.data, 'hex')

    t.alike(frame.data, data, note + ': payload bytes')
    t.alike(
      c.encode(enc, c.decode(enc, data)),
      data,
      note + ': payload round-trips as ' + side.name
    )
  }
})

function decodeFrame(hex) {
  const buf = Buffer.from(hex, 'hex')
  return m.message.decode(c.state(0, buf.length, buf))
}

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(filename))
}
