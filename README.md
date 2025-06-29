# HRPC

**Append only API definition and code generation.**

## Features

- Define request/response interfaces with optional streaming.
- Auto-generate rpc code to disk.
- Supports send-only and duplex commands.
- Enforces schema consistency across versions.

## Installation

```bash
npm install hrpc
```

## Usage

### Define Your Schema

Place your Hyperschema and HRPC definitions in the appropriate directories.

```js
const p = require('path')
const HRPCBuilder = require('hrpc')

const SCHEMA_DIR = path.join(__dirname, 'spec', 'hyperschema')
const HRPC_DIR = path.join(__dirname, 'spec', 'hrpc')

// register schema
const schema = Hyperschema.from(SCHEMA_DIR)
const schemaNs = schema.namespace('example')

schemaNs.register({
  name: 'command-request',
  fields: [
    { name: 'foo', type: 'uint' },
  ]
})

schemaNs.register({
  name: 'command-response,
  fields: [
    { name: 'bar', type: 'string' }
  ]
}
Hyperschema.toDisk(schema)

// Load and build interface
const builder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = builder.namespace('example')

// Register commands
ns.register({
  name: 'command',
  request: { name: '@example/command-request', stream: false },
  response: { name: '@example/command-response', stream: false }
})

// Save interface to disk
HRPCBuilder.toDisk(builder)
```

### Use the Generated RPC

```js
const { PassThrough } = require('bare-stream')
const HRPC = require('./spec/hrpc') // generated rpc
const rpc = new HRPC(stream)

rpc.onCommand((data) => {
  return { bar: data.foo + 1 }
})

const res = await rpc.command({ foo: 1 })
console.log(res) // => { bar: 2 }
```

Example for duplex command:

```js
/*
ns.register({
  name: 'command',
  request: {
    name: '@example/command-request',
    stream: true
  },
  response: {
    name: '@example/command-response',
    stream: true
  }
})
*/

rpc.onCommand((stream) => {
  stream.on('data', (data) => {
    console.log('Received:', data)
  })
  stream.write({ response: 'pong' })
})

const duplex = rpc.command()
duplex.write({ request: 'ping' })
duplex.on('data', (data) => {
  console.log('Reply:', data)
})
```

## Send-Only Commands

You can also define commands that only send data without waiting for a reply:

```js
ns.register({
  name: 'command',
  request: { name: '@example/command-request', send: true }
})
```

## Error Handling and Schema Consistency

Redefining an already-registered command with different schemas or stream types will throw an exception:

```js

// First, command is declared as an async call with return value
ns.register({
  name: 'command',
  request: { name: '@example/command-request', stream: false },
  response: { name: '@example/command-response', stream: false }
})

// This throws because the schema has been altered
ns.register({
  name: 'command',
  request: { name: '@example/command-request', stream: true },
  response: { name: '@example/command-response', stream: false }
})
```
