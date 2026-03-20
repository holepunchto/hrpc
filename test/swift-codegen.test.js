'use strict'

const test = require('brittle')
const fs = require('fs')
const path = require('path')
const os = require('os')
const SwiftHyperschema = require('hyperschema/swift')
const generateSwift = require('../lib/swift-codegen')
const { runSwift } = require('./helpers/swift')

const isWindows = process.platform === 'win32'

// Shared schema setup: register types needed by the RPC handlers.
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

// Shared Pipe class that wires two HRPC instances back-to-back
const PIPE_CLASS = `
class Pipe: RPCDelegate {
  var peer: HRPC?
  func rpc(_ rpc: RPC, send data: Data) {
    peer?.receive(data)
  }
}
`

test('swift: request/response roundtrip', { skip: isWindows }, (t) => {
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

let pipeA = Pipe()
let pipeB = Pipe()
let client = HRPC(delegate: pipeA)
let server = HRPC(delegate: pipeB)
pipeA.peer = server
pipeB.peer = client

server.onEcho { req in
  precondition(req.value == 21, "server got wrong value: \\(req.value)")
  return EchoResponse(value: req.value * 2)
}

Task {
  let resp = try await client.echo(EchoRequest(value: 21))
  precondition(resp.value == 42, "expected 42, got \\(resp.value)")
  print("OK")
  exit(0)
}
RunLoop.main.run()
`

  const result = runSwift(schema, hrpc, main)
  t.ok(result.ok, result.stderr)
  t.ok(result.stdout.includes('OK'), 'roundtrip printed OK')
})

test('swift: send-only event', { skip: isWindows }, (t) => {
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

let pipeA = Pipe()
let pipeB = Pipe()
let client = HRPC(delegate: pipeA)
let server = HRPC(delegate: pipeB)
pipeA.peer = server
pipeB.peer = client

server.onNotify { req in
  precondition(req.code == 99, "server got wrong code: \\(req.code)")
  print("OK")
  exit(0)
}

try client.notify(NotifyRequest(code: 99))
RunLoop.main.run()
`

  const result = runSwift(schema, hrpc, main)
  t.ok(result.ok, result.stderr)
  t.ok(result.stdout.includes('OK'), 'send-only printed OK')
})

test('swift: multiple handlers dispatch correctly', { skip: isWindows }, (t) => {
  const schema = makeSchema()
  const hrpc = {
    handlers: [
      {
        id: 0,
        name: '@test/echo',
        request: { name: '@test/echo-request', stream: false },
        response: { name: '@test/echo-response', stream: false }
      },
      {
        id: 1,
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

let pipeA = Pipe()
let pipeB = Pipe()
let client = HRPC(delegate: pipeA)
let server = HRPC(delegate: pipeB)
pipeA.peer = server
pipeB.peer = client

var notifyReceived = false

server.onEcho { req in
  return EchoResponse(value: req.value + 1)
}

server.onNotify { req in
  notifyReceived = true
}

Task {
  let resp = try await client.echo(EchoRequest(value: 10))
  precondition(resp.value == 11, "echo: expected 11, got \\(resp.value)")

  try client.notify(NotifyRequest(code: 1))
  try await Task.sleep(nanoseconds: 100_000_000)
  precondition(notifyReceived, "notify handler was not called")

  print("OK")
  exit(0)
}
RunLoop.main.run()
`

  const result = runSwift(schema, hrpc, main)
  t.ok(result.ok, result.stderr)
  t.ok(result.stdout.includes('OK'), 'multiple handlers printed OK')
})

test('swift: handler.id is used, not array index', { skip: isWindows }, (t) => {
  const schema = makeSchema()
  const hrpc = {
    handlers: [
      {
        id: 10,
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

let pipeA = Pipe()
let pipeB = Pipe()
let client = HRPC(delegate: pipeA)
let server = HRPC(delegate: pipeB)
pipeA.peer = server
pipeB.peer = client

server.onEcho { req in
  return EchoResponse(value: req.value)
}

Task {
  let resp = try await client.echo(EchoRequest(value: 77))
  precondition(resp.value == 77, "expected 77, got \\(resp.value)")
  print("OK")
  exit(0)
}
RunLoop.main.run()
`

  const result = runSwift(schema, hrpc, main)
  t.ok(result.ok, result.stderr)
  t.ok(result.stdout.includes('OK'), 'non-zero handler.id printed OK')
})

test('swift: zero handlers compiles', { skip: isWindows }, (t) => {
  const schema = makeSchema()
  const hrpc = { handlers: [] }

  const main = `
import Foundation
import BareRPC

${PIPE_CLASS}

let pipeA = Pipe()
let client = HRPC(delegate: pipeA)
print("OK")
exit(0)
`

  const result = runSwift(schema, hrpc, main)
  t.ok(result.ok, result.stderr)
  t.ok(result.stdout.includes('OK'), 'zero handlers printed OK')
})

// --- JS-level tests (no Swift compilation needed) ---

test('throws for streaming request at codegen time', (t) => {
  const hrpc = {
    handlers: [
      {
        id: 0,
        name: '@test/stream',
        request: { name: '@test/stream-request', stream: true },
        response: { name: '@test/stream-response', stream: false }
      }
    ]
  }
  t.exception(
    () => generateSwift(hrpc),
    /streaming/i,
    'throws for streaming request'
  )
})

test('throws for streaming response at codegen time', (t) => {
  const hrpc = {
    handlers: [
      {
        id: 0,
        name: '@test/stream',
        request: { name: '@test/stream-request', stream: false },
        response: { name: '@test/stream-response', stream: true }
      }
    ]
  }
  t.exception(
    () => generateSwift(hrpc),
    /streaming/i,
    'throws for streaming response'
  )
})

test('toDisk writes hrpc.json, HRPC.swift, and Package.swift', (t) => {
  const SwiftHRPC = require('../swift.cjs')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-swift-test-'))
  const outDir = path.join(tmpDir, 'hrpc')

  const hrpcJson = {
    version: 1,
    schema: [
      {
        id: 0,
        name: '@test/hello',
        request: { name: '@test/hello-request', stream: false },
        response: { name: '@test/hello-response', stream: false },
        version: 1
      }
    ]
  }

  const fakeHrpc = {
    toJSON: () => hrpcJson,
    handlers: hrpcJson.schema
  }

  SwiftHRPC._writeToDisk(fakeHrpc, outDir, {
    schemaPackagePath: '../schema',
    schemaPackageName: 'Schema',
    schemaPackageId: 'schema'
  })

  t.ok(fs.existsSync(path.join(outDir, 'hrpc.json')), 'hrpc.json exists')
  t.ok(
    fs.existsSync(path.join(outDir, 'Sources', 'HRPC.swift')),
    'HRPC.swift exists'
  )
  t.ok(
    fs.existsSync(path.join(outDir, 'Package.swift')),
    'Package.swift exists'
  )

  const swift = fs.readFileSync(
    path.join(outDir, 'Sources', 'HRPC.swift'),
    'utf-8'
  )
  t.ok(swift.includes('public class HRPC'), 'HRPC.swift has class definition')
  t.ok(swift.includes('case 0:'), 'HRPC.swift has dispatch for command 0')

  const pkg = fs.readFileSync(path.join(outDir, 'Package.swift'), 'utf-8')
  t.ok(pkg.includes('name: "HRPC"'), 'Package.swift has HRPC target')
  t.ok(
    pkg.includes('bare-rpc-swift'),
    'Package.swift references bare-rpc-swift'
  )
  t.ok(pkg.includes('../schema'), 'Package.swift uses schemaPackagePath')

  const json = JSON.parse(
    fs.readFileSync(path.join(outDir, 'hrpc.json'), 'utf-8')
  )
  t.is(json.version, 1, 'hrpc.json has version')
  t.ok(Array.isArray(json.schema), 'hrpc.json has schema array')

  fs.rmSync(tmpDir, { recursive: true })
})
