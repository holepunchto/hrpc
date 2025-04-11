const p = require('path')
const fs = require('fs/promises')
const test = require('brittle')
const Hyperschema = require('hyperschema')
const { PassThrough } = require('bare-stream')

const SCHEMA_DIR = './spec/hyperschema'
const INTERFACE_DIR = './spec/hyperinterface'

test('basic interface', async (t) => {
  t.plan(4)
  const dir = __dirname
  const runtimePath = p.join(dir, 'node_modules', 'hyperinterface', 'runtime.cjs')
  await fs.mkdir(p.dirname(runtimePath), { recursive: true })
  await fs.copyFile(p.resolve(dir, '../runtime.cjs'), runtimePath)

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

  ns1.register({
    name: 'command-b-request',
    fields: [
      { name: 'ffvii', type: 'uint' },
      { name: 'fred', type: 'string' }
    ]
  })

  ns1.register({
    name: 'command-b-response',
    fields: [
      { name: 'cat', type: 'string' },
      { name: 'tt', type: 'uint' }
    ]
  })

  Hyperschema.toDisk(schema)

  const HyperInterface = require('../builder.cjs')
  const hyperInterface = HyperInterface.from(SCHEMA_DIR, INTERFACE_DIR)

  const ns2 = hyperInterface.namespace('example')

  ns2.register({
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

  ns2.register({
    name: 'command-b',
    request: {
      name: '@example/command-b-request',
      stream: false
    },
    response: {
      name: '@example/command-b-response',
      stream: false
    }
  })


  HyperInterface.toDisk(hyperInterface)

  const API = require(INTERFACE_DIR)
  const api = new API(new PassThrough())

  api.onExampleCommandA((data) => {
    t.is(data.foo, 80)
    t.is(data.bar, '!!')
    return { baz: 'quo', qux: 99 }
  })

  const response = await api.exampleCommandA({ foo: 80, bar: '!!' })
  t.is(response.baz, 'quo')
  t.is(response.qux, 99)
})
