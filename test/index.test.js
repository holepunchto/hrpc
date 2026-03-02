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
  await fs.promises.copyFile(
    p.resolve(dir, '..', 'lib', 'stream.js'),
    runtimeLibPath
  )
})

test('basic rpc', async (t) => {
  t.plan(31)
  t.teardown(async () => {
    //await fs.promises.rm(p.join(__dirname, 'spec'), { recursive: true })
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

  ns.register({
    name: 'command-i',
    request: {
      name: 'string',
      stream: false
    },
    response: {
      name: 'uint',
      stream: false
    }
  })

  ns.register({
    name: 'command-j',
    request: {
      name: 'fixed32',
      stream: true
    },
    response: {
      name: 'bool',
      stream: false
    }
  })

  ns.register({
    name: 'command-k',
    request: {
      name: 'bool',
      stream: false
    },
    response: {
      name: 'int',
      stream: true
    }
  })

  ns.register({
    name: 'command-l',
    request: {
      name: 'fixed32',
      stream: true
    },
    response: {
      name: 'bool',
      stream: true
    }
  })

  HRPCBuilder.toDisk(hrpc)

  const HRPC = require(HRPC_DIR)
  const stream = new PassThrough()
  const rpc = new HRPC(stream)

  // request stream false - response stream false
  rpc.example.onCommandA((data) => {
    t.is(data.bar, 'imbar', 'command-a request string is correct')
    return { baz: 'quo', qux: data.foo + 1 }
  })
  const a = await rpc.example.commandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'command-a response string is correct')
  t.is(a.qux, 81, 'command-a response uint is correct')

  // request stream true - response stream false
  rpc.example.onCommandB((stream) => {
    stream.on('data', (data) => {
      t.is(data.fred, 'imfred', 'command-b request string is correct')
    })
    return { tt: 22, cat: 'meow' }
  })
  const streamB = rpc.example.commandB()
  streamB.write({ ffvii: 90, fred: 'imfred' })
  const b = await streamB.reply()
  t.is(b.tt, 22, 'command b response uint is correct')
  t.is(b.cat, 'meow', 'command b response uint is correct')

  // request stream false - response stream true
  rpc.example.onCommandC((stream) => {
    t.is(stream.data.cof, 99, 'request stream data is correct')
    t.is(stream.data.ham, 'tobe', 'request stream data is correct')
    stream.write({ klau: 'light', ger: 1500 })
  })
  const streamC = rpc.example.commandC({ cof: 99, ham: 'tobe' })
  streamC.on('data', (data) => {
    t.is(data.klau, 'light')
    t.is(data.ger, 1500)
  })

  // request stream true - response stream true

  rpc.example.onCommandD((stream) => {
    stream.on('data', (data) => {
      t.is(data.pol, 1, 'request stream data is correct')
      t.is(data.oth, 'par', 'request stream data is correct')
    })
    stream.write({ iag: 'ev', ofe: 22 })
  })
  const streamD = rpc.example.commandD()
  streamD.on('data', (data) => {
    t.is(data.iag, 'ev', 'response stream data is correct')
    t.is(data.ofe, 22, 'response stream data is correct')
  })
  streamD.write({ pol: 1, oth: 'par' })

  // send: true

  rpc.example.onCommandE((data) => {
    t.is(data.mac, 1, 'request send data is correct')
    t.is(data.earl, 2, 'request send data is correct')
  })

  rpc.example.commandE({ mac: 1, earl: 2 })

  // send: true, no args

  rpc.example.onCommandF((data) => {
    t.is(data, null)
  })

  rpc.example.commandF()

  // request stream false - response stream false, no args

  rpc.example.onCommandG((data) => {
    t.is(data, null)
    return { far: 99, boo: 'loo' }
  })
  const g = await rpc.example.commandG({ foo: 80, bar: 'imbar' })
  t.is(g.boo, 'loo', 'command-g response string is correct')
  t.is(g.far, 99, 'command-g response uint is correct')

  // request stream false - response stream true, no args

  rpc.example.onCommandH((stream) => {
    t.is(stream.data, null)
    stream.write({ lee: 'paw', perry: 777 })
  })
  const streamH = rpc.example.commandH()
  streamH.on('data', (data) => {
    t.is(data.lee, 'paw')
    t.is(data.perry, 777)
  })

  // primitive, request stream false, response stream false

  rpc.example.onCommandI((request) => {
    t.is(request, 'ping')
    return 33
  })
  const i = await rpc.example.commandI('ping')
  t.is(i, 33)

  // primitive, request stream true, response stream false

  rpc.example.onCommandJ((stream) => {
    stream.on('data', (data) => {
      t.ok(
        data.equals(Buffer.alloc(32)),
        'command-J request buffer primitive is correct'
      )
    })
    return false
  })
  const streamJ = rpc.example.commandJ()
  streamJ.write(Buffer.alloc(32))
  const j = await streamJ.reply()
  t.is(j, false, 'command j response boolean is correct')

  // primitive, request stream false, response stream true

  rpc.example.onCommandK((stream) => {
    t.is(stream.data, true, 'request stream primitive data is correct')
    stream.write(451)
  })
  const streamK = rpc.example.commandK(true)
  streamK.on('data', (data) => {
    t.is(data, 451)
  })

  // primitive, request stream true - response stream true

  rpc.example.onCommandL((stream) => {
    stream.on('data', (data) => {
      t.ok(data.equals(Buffer.alloc(32)))
    })
    stream.write(false)
  })
  const streamL = rpc.example.commandL()
  streamL.on('data', (data) => {
    t.is(data, false)
  })
  streamL.write(Buffer.alloc(32))
})

const HRPC_FLAT_DIR = p.join(__dirname, 'spec', 'hrpc-flat')

test('flat: true backwards compatibility', async (t) => {
  t.plan(5)

  registerSchema()

  const hrpc = HRPCBuilder.from(SCHEMA_DIR, HRPC_FLAT_DIR)
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

  HRPCBuilder.toDisk(hrpc, { flat: true })

  const HRPC = require(HRPC_FLAT_DIR)
  const stream = new PassThrough()
  const rpc = new HRPC(stream)

  t.is(rpc.example, undefined, 'no namespace sub-object in flat mode')

  rpc.onCommandA((data) => {
    t.is(data.bar, 'imbar', 'flat handler receives request')
    return { baz: 'quo', qux: data.foo + 1 }
  })
  const a = await rpc.commandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'flat response string is correct')
  t.is(a.qux, 81, 'flat response uint is correct')
  t.is(typeof rpc.onCommandA, 'function', 'flat onCommandA exists')
})

const HRPC_MULTI_NS_DIR = p.join(__dirname, 'spec', 'hrpc-multi-ns')

test('multiple namespaces with different protocols', async (t) => {
  t.plan(13)

  registerSchema()

  const hrpc = HRPCBuilder.from(SCHEMA_DIR, HRPC_MULTI_NS_DIR)
  const ns1 = hrpc.namespace('example')
  const ns2 = hrpc.namespace('other')

  // example: request/response
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

  // example: response stream
  ns1.register({
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

  // other: request stream (same local name "command-a", different protocol)
  ns2.register({
    name: 'command-a',
    request: {
      name: '@example/command-b-request',
      stream: true
    },
    response: {
      name: '@example/command-b-response',
      stream: false
    }
  })

  // other: send event
  ns2.register({
    name: 'command-b',
    request: {
      name: '@example/command-e-request',
      send: true
    }
  })

  HRPCBuilder.toDisk(hrpc)

  const HRPC = require(HRPC_MULTI_NS_DIR)
  const stream = new PassThrough()
  const rpc = new HRPC(stream)

  // example: request/response
  rpc.example.onCommandA((data) => {
    t.is(data.bar, 'imbar', 'example request/response handler works')
    return { baz: 'quo', qux: data.foo + 1 }
  })
  const a = await rpc.example.commandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'example response string correct')
  t.is(a.qux, 81, 'example response uint correct')

  // example: response stream
  rpc.example.onCommandC((responseStream) => {
    t.is(responseStream.data.cof, 99, 'example response stream request data correct')
    responseStream.write({ klau: 'light', ger: 1500 })
  })
  const streamC = rpc.example.commandC({ cof: 99, ham: 'tobe' })
  streamC.on('data', (data) => {
    t.is(data.klau, 'light', 'example response stream data correct')
    t.is(data.ger, 1500, 'example response stream uint correct')
  })

  // other: request stream (same local name "command-a" but different protocol)
  rpc.other.onCommandA((requestStream) => {
    requestStream.on('data', (data) => {
      t.is(data.fred, 'imfred', 'other request stream data correct')
    })
    return { cat: 'meow', tt: 22 }
  })
  const streamA = rpc.other.commandA()
  streamA.write({ ffvii: 90, fred: 'imfred' })
  const b = await streamA.reply()
  t.is(b.cat, 'meow', 'other request stream response string correct')
  t.is(b.tt, 22, 'other request stream response uint correct')

  // other: send event
  rpc.other.onCommandB((data) => {
    t.is(data.mac, 1, 'other send event mac correct')
    t.is(data.earl, 2, 'other send event earl correct')
  })
  rpc.other.commandB({ mac: 1, earl: 2 })

  // verify namespace isolation
  t.is(typeof rpc.example.commandC, 'function', 'commandC only on example')
  t.is(rpc.other.commandC, undefined, 'commandC not on other')
})

const HRPC_CAMEL_DIR = p.join(__dirname, 'spec', 'hrpc-camel')

test('camelCase namespace names', async (t) => {
  t.plan(3)

  registerSchema()

  const hrpc = HRPCBuilder.from(SCHEMA_DIR, HRPC_CAMEL_DIR)
  const ns = hrpc.namespace('my-namespace')

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

  const HRPC = require(HRPC_CAMEL_DIR)
  const stream = new PassThrough()
  const rpc = new HRPC(stream)

  t.is(typeof rpc.myNamespace, 'object', 'camelCased namespace exists')

  rpc.myNamespace.onCommandA((data) => {
    t.is(data.bar, 'imbar', 'camelCase namespace handler works')
    return { baz: 'quo', qux: data.foo + 1 }
  })

  const a = await rpc.myNamespace.commandA({ foo: 80, bar: 'imbar' })
  t.is(a.baz, 'quo', 'camelCase namespace response is correct')
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
