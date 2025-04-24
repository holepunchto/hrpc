const p = require('path')
const Hyperschema = require('hyperschema')
const HyperInterfaceBuilder = require('hyperinterface')
const { PassThrough } = require('bare-stream')

const SCHEMA_DIR = p.join(__dirname, 'spec', 'hyperschema')
const INTERFACE_DIR = p.join(__dirname, 'spec', 'hyperinterface')

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

const hyperInterface = HyperInterfaceBuilder.from(SCHEMA_DIR, INTERFACE_DIR)
const ns = hyperInterface.namespace('example')

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

HyperInterfaceBuilder.toDisk(hyperInterface)

const HyperInterface = require(INTERFACE_DIR)
const stream = new PassThrough()
const iface = new HyperInterface(stream)

iface.onExampleCommandA((data) => {
  console.log('command A request:', data)
  return { baz: 'quo', qux: data.foo + 1 }
})

iface.exampleCommandA({ foo: 80, bar: 'imbar' }).then((response) => console.log('command A response:', response))
