const p = require('path')
const fs = require('fs')
const test = require('brittle')
const { PassThrough } = require('bare-stream')
const { registerSchema } = require('./helper.js')
const HRPCBuilder = require('../builder.cjs')

const SCHEMA_DIR = p.join(__dirname, 'spec', 'hyperschema')
const HRPC_DIR = p.join(__dirname, 'spec', 'hrpc')

test.hook('copy runtime', async () => {
  const dir = __dirname
  const runtimePath = p.join(dir, 'node_modules', 'hrpc', 'runtime.cjs')
  const runtimePathEsm = p.join(dir, 'node_modules', 'hrpc', 'runtime.mjs')
  const runtimeLibPath = p.join(dir, 'node_modules', 'hrpc', 'lib', 'stream.js')
  await fs.promises.mkdir(p.dirname(runtimePath), { recursive: true })
  await fs.promises.mkdir(p.dirname(runtimeLibPath), { recursive: true })
  await fs.promises.copyFile(p.resolve(dir, '../runtime.cjs'), runtimePath)
  await fs.promises.copyFile(p.resolve(dir, '../runtime.mjs'), runtimePathEsm)
  await fs.promises.copyFile(p.resolve(dir, '..', 'lib', 'stream.js'), runtimeLibPath)
})

test('basic rpc', async (t) => {
  t.plan(23)
  t.teardown(async () => {
    await fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
  })

  registerSchema()

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

  ns.register({
    name: 'command-e',
    request: {
      name: '@example/command-e-request',
      send: true
    }
  })

  ns.register({
    name: 'command-f',
    request: {
      name: '@example/command-f-request',
      send: true
    }
  })

  ns.register({
    name: 'command-g',
    request: {
      name: '@example/command-g-request',
      stream: false
    },
    response: {
      name: '@example/command-g-response',
      stream: false
    }
  })

  ns.register({
    name: 'command-h',
    request: {
      name: '@example/command-h-request',
      stream: false
    },
    response: {
      name: '@example/command-h-response',
      stream: true
    }
  })

  HRPCBuilder.toDisk(hrpc)

  const HRPC = require(HRPC_DIR)
  const stream = new PassThrough()
  const rpc = new HRPC(stream)

  // request stream false - response stream false

  rpc.onCommandA((data) => {
    t.is(data.bar, 'imbar', 'command-a request string is correct')
    return { baz: 'quo', qux: data.foo + 1 }
  })
  const a = await rpc.commandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'command-a response string is correct')
  t.is(a.qux, 81, 'command-a response uint is correct')

  // request stream true - response stream false

  rpc.onCommandB((stream) => {
    stream.on('data', (data) => {
      t.is(data.fred, 'imfred', 'command-b request string is correct')
    })
    return { tt: 22, cat: 'meow' }
  })
  const streamB = rpc.commandB()
  streamB.write({ ffvii: 90, fred: 'imfred' })
  const b = await streamB.reply()
  t.is(b.tt, 22, 'command b response uint is correct')
  t.is(b.cat, 'meow', 'command b response uint is correct')

  // request stream false - response stream true

  rpc.onCommandC((stream) => {
    t.is(stream.data.cof, 99, 'request stream data is correct')
    t.is(stream.data.ham, 'tobe', 'request stream data is correct')
    stream.write({ klau: 'light', ger: 1500 })
  })
  const streamC = rpc.commandC({ cof: 99, ham: 'tobe' })
  streamC.on('data', (data) => {
    t.is(data.klau, 'light')
    t.is(data.ger, 1500)
  })

  // request stream true - response stream true

  rpc.onCommandD((stream) => {
    stream.on('data', (data) => {
      t.is(data.pol, 1, 'request stream data is correct')
      t.is(data.oth, 'par', 'request stream data is correct')
    })
    stream.write({ iag: 'ev', ofe: 22 })
  })
  const streamD = rpc.commandD()
  streamD.on('data', (data) => {
    t.is(data.iag, 'ev', 'response stream data is correct')
    t.is(data.ofe, 22, 'response stream data is correct')
  })
  streamD.write({ pol: 1, oth: 'par' })

  // send: true

  rpc.onCommandE((data) => {
    t.is(data.mac, 1, 'request send data is correct')
    t.is(data.earl, 2, 'request send data is correct')
  })

  rpc.commandE({ mac: 1, earl: 2 })

  // send: true, no args

  rpc.onCommandF((data) => {
    t.is(data, null)
  })

  rpc.commandF()

  // request stream false - response stream false, no args

  rpc.onCommandG((data) => {
    t.is(data, null)
    return { far: 99, boo: 'loo' }
  })
  const g = await rpc.commandG({ foo: 80, bar: 'imbar' })
  t.is(g.boo, 'loo', 'command-g response string is correct')
  t.is(g.far, 99, 'command-g response uint is correct')

  // request stream false - response stream true, no args

  rpc.onCommandH((stream) => {
    t.is(stream.data, null)
    stream.write({ lee: 'paw', perry: 777 })
  })
  const streamH = rpc.commandH()
  streamH.on('data', (data) => {
    t.is(data.lee, 'paw')
    t.is(data.perry, 777)
  })
})

test('register rpc twice', async (t) => {
  t.plan(4)
  t.teardown(async () => {
    await fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
  })

  registerSchema()

  const hrpcA = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
  const ns1 = hrpcA.namespace('example')

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

  HRPCBuilder.toDisk(hrpcA)

  const hrpcB = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
  const ns2 = hrpcB.namespace('example')

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
