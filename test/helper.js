const p = require('path')
const Hyperschema = require('hyperschema')

const SCHEMA_DIR = p.join(__dirname, 'spec', 'hyperschema')

function registerSchema () {
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
}

module.exports = { registerSchema }
