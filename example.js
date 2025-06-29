const p = require('path')
const Hyperschema = require('hyperschema')
const HRPCBuilder = require('hrpc')
const { PassThrough } = require('bare-stream')

const SCHEMA_DIR = p.join(__dirname, 'spec', 'hyperschema')
const HRPC_DIR = p.join(__dirname, 'spec', 'hrpc')

const schema = Hyperschema.from(SCHEMA_DIR)
const ns1 = schema.namespace('example')

ns1.register({
  name: 'command-a-request',
  fields: [
    { name: 'foo', type: 'uint' },
    { name: 'bar', type: 'string' }
  ]
})

ns1.register({
  name: 'command-a-response',
  fields: [
    { name: 'baz', type: 'string' },
    { name: 'qux', type: 'uint' }
  ]
})

Hyperschema.toDisk(schema)

const hrpc = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = hrpc.namespace('example')

ns.register({
  name: 'command-a',
  request: {
    name: '@example/command-a-request',
    stream: false
  },
  response: {
    name: '@example/command-a-response',
    stream: false
  }
})

HRPCBuilder.toDisk(hrpc)

const HRPC = require(HRPC_DIR)
const stream = new PassThrough()
const rpc = new HRPC(stream)

rpc.onCommandA((data) => {
  console.log('command A request:', data)
  return { baz: 'quo', qux: data.foo + 1 }
})

rpc.commandA({ foo: 80, bar: 'imbar' }).then((response) => console.log('command A response:', response))
