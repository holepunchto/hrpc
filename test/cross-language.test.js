'use strict'

const test = require('brittle')
const c = require('compact-encoding')
const SwiftHyperschema = require('hyperschema/swift')
const { runSwift } = require('./helpers/swift')
const m = require('bare-rpc/messages')

const isWindows = process.platform === 'win32'

// --- Wire format helpers ---

function encodeRequestFrame(id, command, payloadBuffer) {
  const message = { type: 1, id, command, stream: 0, data: payloadBuffer }
  const header = c.encode(m.header, message)
  return payloadBuffer
    ? Buffer.concat([header, payloadBuffer])
    : Buffer.from(header)
}

function encodeEventFrame(command, payloadBuffer) {
  return encodeRequestFrame(0, command, payloadBuffer)
}

function decodeFrame(buf) {
  const state = c.state(0, buf.length, buf)
  return m.message.decode(state)
}

// --- Payload codecs (matching hyperschema-generated struct encodings) ---

const echoRequestCodec = {
  preencode(state, val) {
    c.uint.preencode(state, val.value)
  },
  encode(state, val) {
    c.uint.encode(state, val.value)
  },
  decode(state) {
    return { value: c.uint.decode(state) }
  }
}

const echoResponseCodec = echoRequestCodec // same shape

const notifyRequestCodec = {
  preencode(state, val) {
    c.uint.preencode(state, val.code)
  },
  encode(state, val) {
    c.uint.encode(state, val.code)
  },
  decode(state) {
    return { code: c.uint.decode(state) }
  }
}

// Shared schema setup (for Swift codegen)
function makeSchema() {
  const schema = SwiftHyperschema.from(null)
  const ns = schema.namespace('test')

  ns.register({
    name: 'echo-request',
    fields: [{ name: 'value', type: 'uint', required: true }]
  })

  ns.register({
    name: 'echo-response',
    fields: [{ name: 'value', type: 'uint', required: true }]
  })

  ns.register({
    name: 'notify-request',
    fields: [{ name: 'code', type: 'uint', required: true }]
  })

  return schema
}

const PIPE_CLASS = `
class Pipe: RPCDelegate {
  var peer: HRPC?
  var captured = Data()
  var captureMode = false
  func rpc(_ rpc: RPC, send data: Data) {
    if captureMode {
      captured.append(data)
    } else {
      peer?.receive(data)
    }
  }
}
`

// --- JS → Swift tests ---

test(
  'cross-language: JS event frame → Swift dispatch',
  { skip: isWindows },
  (t) => {
    const schema = makeSchema()
    const hrpc = {
      handlers: [
        {
          id: 0,
          name: '@test/notify',
          request: { name: '@test/notify-request', stream: false, send: true },
          response: null
        }
      ]
    }

    const payload = Buffer.from(c.encode(notifyRequestCodec, { code: 42 }))
    const frame = encodeEventFrame(0, payload)
    const base64 = frame.toString('base64')

    const main = `
import Foundation
import BareRPC

${PIPE_CLASS}

let pipe = Pipe()
let hrpc = HRPC(delegate: pipe)

hrpc.onNotify { req in
  precondition(req.code == 42, "expected code 42, got \\(req.code)")
  print("OK")
  exit(0)
}

let data = Data(base64Encoded: "${base64}")!
hrpc.receive(data)
RunLoop.main.run()
`

    const result = runSwift(schema, hrpc, main)
    t.ok(result.ok, result.stderr)
    t.ok(result.stdout.includes('OK'), 'JS event frame decoded by Swift')
  }
)

test(
  'cross-language: JS request frame → Swift dispatch + response',
  { skip: isWindows },
  (t) => {
    const schema = makeSchema()
    const hrpc = {
      handlers: [
        {
          id: 0,
          name: '@test/echo',
          request: { name: '@test/echo-request', stream: false },
          response: { name: '@test/echo-response', stream: false }
        }
      ]
    }

    const payload = Buffer.from(c.encode(echoRequestCodec, { value: 7 }))
    const frame = encodeRequestFrame(1, 0, payload)
    const base64 = frame.toString('base64')

    const main = `
import Foundation
import BareRPC

${PIPE_CLASS}

let pipe = Pipe()
pipe.captureMode = true
let hrpc = HRPC(delegate: pipe)

hrpc.onEcho { req in
  precondition(req.value == 7, "expected value 7, got \\(req.value)")
  return EchoResponse(value: req.value * 3)
}

let data = Data(base64Encoded: "${base64}")!
hrpc.receive(data)

Task {
  try await Task.sleep(nanoseconds: 100_000_000)
  print(pipe.captured.base64EncodedString())
  exit(0)
}
RunLoop.main.run()
`

    const result = runSwift(schema, hrpc, main)
    t.ok(result.ok, result.stderr)

    // Decode the Swift response frame in JS
    const responseFrame = Buffer.from(result.stdout.trim(), 'base64')
    const message = decodeFrame(responseFrame)

    t.is(message.type, 2, 'response type')
    t.is(message.id, 1, 'response id matches request id')

    const resp = c.decode(echoResponseCodec, message.data)
    t.is(resp.value, 21, 'Swift response payload: 7 * 3 = 21')
  }
)

// --- Swift → JS tests ---

test(
  'cross-language: Swift event frame → JS decode',
  { skip: isWindows },
  (t) => {
    const schema = makeSchema()
    const hrpc = {
      handlers: [
        {
          id: 0,
          name: '@test/notify',
          request: { name: '@test/notify-request', stream: false, send: true },
          response: null
        }
      ]
    }

    const main = `
import Foundation
import BareRPC

${PIPE_CLASS}

let pipe = Pipe()
pipe.captureMode = true
let hrpc = HRPC(delegate: pipe)

try hrpc.notify(NotifyRequest(code: 77))
print(pipe.captured.base64EncodedString())
exit(0)
`

    const result = runSwift(schema, hrpc, main)
    t.ok(result.ok, result.stderr)

    const frame = Buffer.from(result.stdout.trim(), 'base64')
    const message = decodeFrame(frame)

    t.is(message.type, 1, 'request type (event)')
    t.is(message.id, 0, 'event id is 0')
    t.is(message.command, 0, 'command is 0')

    const payload = c.decode(notifyRequestCodec, message.data)
    t.is(payload.code, 77, 'Swift-encoded payload decoded in JS: code=77')
  }
)

test(
  'cross-language: Swift request frame → JS decode',
  { skip: isWindows },
  (t) => {
    const schema = makeSchema()
    const hrpc = {
      handlers: [
        {
          id: 0,
          name: '@test/echo',
          request: { name: '@test/echo-request', stream: false },
          response: { name: '@test/echo-response', stream: false }
        }
      ]
    }

    const main = `
import Foundation
import BareRPC

${PIPE_CLASS}

let pipe = Pipe()
pipe.captureMode = true
let hrpc = HRPC(delegate: pipe)

Task {
  _ = try? await hrpc.echo(EchoRequest(value: 55))
}

Task {
  try await Task.sleep(nanoseconds: 100_000_000)
  print(pipe.captured.base64EncodedString())
  exit(0)
}
RunLoop.main.run()
`

    const result = runSwift(schema, hrpc, main)
    t.ok(result.ok, result.stderr)

    const frame = Buffer.from(result.stdout.trim(), 'base64')
    const message = decodeFrame(frame)

    t.is(message.type, 1, 'request type')
    t.ok(message.id > 0, 'request id > 0')
    t.is(message.command, 0, 'command is 0')

    const payload = c.decode(echoRequestCodec, message.data)
    t.is(payload.value, 55, 'Swift-encoded request decoded in JS: value=55')
  }
)
