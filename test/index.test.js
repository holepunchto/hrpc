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

test('basic interface', async (t) => {
  t.plan(14)
  t.teardown(() => {
    fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
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
      stream: true
    },
    response: {
      name: '@example/command-b-response',
      stream: false
    }
  })

  ns.register({
    name: 'command-c',
    request: {
      name: '@example/command-c-request',
      stream: false
    },
    response: {
      name: '@example/command-c-response',
      stream: true
    }
  })

  ns.register({
    name: 'command-d',
    request: {
      name: '@example/command-d-request',
      stream: true
    },
    response: {
      name: '@example/command-d-response',
      stream: true
    }
  })

  HyperInterface.toDisk(hyperInterface)

  const Interface = require(INTERFACE_DIR)
  const stream = new PassThrough()
  const iface = new Interface(stream)

  // request stream false - response stream false

  iface.onExampleCommandA((data) => {
    t.is(data.bar, 'imbar', 'command-a request string is correct')
    return { baz: 'quo', qux: data.foo + 1 }
  })
  const a = await iface.exampleCommandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'command-a response string is correct')
  t.is(a.qux, 81, 'command-a response uint is correct')

  // request stream true - response stream false

  iface.onExampleCommandB((stream) => {
    stream.on('data', (data) => {
      t.is(data.fred, 'imfred', 'command-b request string is correct')
    })
    return { tt: 22, cat: 'meow' }
  })
  const streamB = await iface.exampleCommandB()
  streamB.write({ ffvii: 90, fred: 'imfred' })
  const b = await streamB.reply()
  t.is(b.tt, 22, 'command b response uint is correct')
  t.is(b.cat, 'meow', 'command b response uint is correct')

  // request stream false - response stream true

  iface.onExampleCommandC((stream) => {
    t.is(stream.data.cof, 99, 'request stream data is correct')
    t.is(stream.data.ham, 'tobe', 'request stream data is correct')
    stream.write({ klau: 'light', ger: 1500 })
  })
  const streamC = await iface.exampleCommandC({ cof: 99, ham: 'tobe' })
  streamC.on('data', (data) => {
    t.is(data.klau, 'light')
    t.is(data.ger, 1500)
  })

  // request stream true - response stream true

  iface.onExampleCommandD((stream) => {
    stream.on('data', (data) => {
      t.is(data.pol, 1, 'request stream data is correct')
      t.is(data.oth, 'par', 'request stream data is correct')
    })
    stream.write({ iag: 'ev', ofe: 22 })
  })
  const streamD = await iface.exampleCommandD()
  streamD.on('data', (data) => {
    t.is(data.iag, 'ev', 'response stream data is correct')
    t.is(data.ofe, 22, 'response stream data is correct')
  })
  streamD.write({ pol: 1, oth: 'par' })
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
