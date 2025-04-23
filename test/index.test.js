const p = require('path')
const fs = require('fs')
const test = require('brittle')
const { PassThrough } = require('bare-stream')
const { registerSchema } = require('./helper.js')
const HyperInterface = require('../builder.cjs')

const SCHEMA_DIR = p.join(__dirname, 'spec', 'hyperschema')
const INTERFACE_DIR = p.join(__dirname, 'spec', 'hyperinterface')

test.hook('copy runtime', async () => {
  const dir = __dirname
  const runtimePath = p.join(dir, 'node_modules', 'hyperinterface', 'runtime.cjs')
  await fs.promises.mkdir(p.dirname(runtimePath), { recursive: true })
  await fs.promises.copyFile(p.resolve(dir, '../runtime.cjs'), runtimePath)
})

test.solo('basic interface', async (t) => {
  t.plan(8)
  t.teardown(() => {
    // fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
  })

  registerSchema()

  const hyperInterface = HyperInterface.from(SCHEMA_DIR, INTERFACE_DIR)
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

  ns.register({
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

  const Interface = require(INTERFACE_DIR)
  const stream = new PassThrough()
  const iface = new Interface(stream)

  iface.onExampleCommandA((data) => {
    t.is(data.bar, 'imbar', 'command-a request string is correct')
    return { baz: 'quo', qux: data.foo + 1 }
  })

  iface.onExampleCommandB((data) => {
    t.is(data.fred, 'imfred', 'command-b request string is correct')
    return { tt: data.ffvii + 1, cat: 'meow' }
  })

  const a = await iface.exampleCommandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'command-a response string is correct')
  t.is(a.qux, 81, 'command-a response uint is correct')

  const b = await iface.exampleCommandB({ ffvii: 90, fred: 'imfred' })
  t.is(b.tt, 91, 'command b response uint is correct')
  t.is(b.cat, 'meow', 'command b response uint is correct')

  t.exception(async () => {
    await iface.exampleCommandA({ foo: 'this-should-be-a-uint', bar: 'value' })
  }, 'wrong encoding should reject')

  t.exception(async () => {
    await iface.exampleCommandB({ ffvii: 'this-should-be-a-uint', fred: 'value' })
  }, 'wrong encoding should reject')
})

test('register interface twice', async (t) => {
  t.plan(4)
  t.teardown(() => {
    fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
  })

  registerSchema()

  const hyperInterfaceA = HyperInterface.from(SCHEMA_DIR, INTERFACE_DIR)
  const ns1 = hyperInterfaceA.namespace('example')

  ns1.register({
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

  HyperInterface.toDisk(hyperInterfaceA)

  const hyperInterfaceB = HyperInterface.from(SCHEMA_DIR, INTERFACE_DIR)
  const ns2 = hyperInterfaceB.namespace('example')

  t.exception(() => {
    ns2.register({
      name: 'command-a',
      request: {
        name: '@example/command-b-request',
        stream: false
      },
      response: {
        name: '@example/command-a-response',
        stream: false
      }
    })
  }, 'cannot alter request type')

  t.exception(() => {
    ns2.register({
      name: 'command-a',
      request: {
        name: '@example/command-a-request',
        stream: true
      },
      response: {
        name: '@example/command-a-response',
        stream: false
      }
    })
  }, 'cannot alter request stream')

  t.exception(() => {
    ns2.register({
      name: 'command-a',
      request: {
        name: '@example/command-a-request',
        stream: false
      },
      response: {
        name: '@example/command-b-response',
        stream: false
      }
    })
  }, 'cannot alter response type')

  t.exception(() => {
    ns2.register({
      name: 'command-a',
      request: {
        name: '@example/command-a-request',
        stream: false
      },
      response: {
        name: '@example/command-a-response',
        stream: true
      }
    })
  }, 'cannot alter response stream')
})
