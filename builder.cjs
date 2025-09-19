/*
  Based in hyperdispatch implementation: https://github.com/holepunchto/hyperdispatch/blob/main/builder.cjs
*/

const p = require('path')
const fs = require('fs')
const Hyperschema = require('hyperschema')
const generateCode = require('./lib/codegen')

const CODE_FILE_NAME = 'index.js'
const MESSAGES_FILE_NAME = 'messages.js'
const HRPC_JSON_FILE_NAME = 'hrpc.json'

class HRPCNamespace {
  constructor(hrpc, name) {
    this.hrpc = hrpc
    this.name = name
  }

  register(description) {
    const fqn = '@' + this.name + '/' + description.name
    this.hrpc.register(fqn, description)
  }
}

module.exports = class HRPC {
  constructor(
    schema,
    hrpcJson,
    { offset, hrpcDir = null, schemaDir = null } = {}
  ) {
    this.schema = schema
    this.version = hrpcJson ? hrpcJson.version : 0
    this.offset = hrpcJson ? hrpcJson.offset : offset || 0
    this.hrpcDir = hrpcDir
    this.schemaDir = schemaDir

    this.namespaces = new Map()

    this.handlersByName = new Map()
    this.handlersById = new Map()
    this.handlers = []

    this.currentOffset = this.offset || 0

    this.changed = false
    this.initializing = true
    if (hrpcJson) {
      for (let i = 0; i < hrpcJson.schema.length; i++) {
        const description = hrpcJson.schema[i]
        this.register(description.name, description)
      }
    }
    this.initializing = false
  }

  namespace(name) {
    return new HRPCNamespace(this, name)
  }

  register(fqn, description) {
    const existingByName = this.handlersByName.get(fqn)
    const existingById = Number.isInteger(description.id)
      ? this.handlersById.get(description.id)
      : null
    if (existingByName && existingById) {
      if (existingByName !== existingById)
        throw new Error('ID/Name mismatch for handler: ' + fqn)
      if (
        Number.isInteger(description.id) &&
        existingByName.id !== description.id
      ) {
        throw new Error('Cannot change the assigned ID for handler: ' + fqn)
      }
    }

    const request = this.schema.resolve(description.request.name)
    if (!request) throw new Error('Invalid request type')

    // send: true methods do not have response
    if (description.response) {
      const response = this.schema.resolve(description.response.name)
      if (!response) throw new Error('Invalid response type')
    }

    if (
      existingByName &&
      existingByName.request.name !== description.request.name
    ) {
      throw new Error('Cannot alter the request type for a handler')
    }

    if (
      existingByName &&
      existingByName.request.stream !== description.request.stream
    ) {
      throw new Error('Cannot alter the request stream attribute for a handler')
    }

    if (description.response) {
      if (
        existingByName &&
        existingByName.response.name !== description.response.name
      ) {
        throw new Error('Cannot alter the response type for a handler')
      }
      if (
        existingByName &&
        existingByName.response.stream !== description.response.stream
      ) {
        throw new Error(
          'Cannot alter the response stream attribute for a handler'
        )
      }
    }

    if (!this.initializing && !existingByName && !this.changed) {
      this.changed = true
      this.version += 1
    }

    const id = Number.isInteger(description.id)
      ? description.id
      : this.currentOffset++

    const handler = {
      id,
      name: fqn,
      request: description.request,
      response: description.response,
      version: Number.isInteger(description.version)
        ? description.version
        : this.version
    }

    this.handlersById.set(id, handler)
    this.handlersByName.set(fqn, handler)

    if (!existingByName) {
      this.handlers.push(handler)
    }
  }

  toJSON() {
    return {
      version: this.version,
      schema: this.handlers
    }
  }

  static from(schemaJson, hrpcJson, opts) {
    const schema = Hyperschema.from(schemaJson)
    if (typeof hrpcJson === 'string') {
      const jsonFilePath = p.join(p.resolve(hrpcJson), HRPC_JSON_FILE_NAME)
      let exists = false
      try {
        fs.statSync(jsonFilePath)
        exists = true
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      opts = { ...opts, hrpcDir: hrpcJson, schemaDir: schemaJson }
      if (exists)
        return new this(schema, JSON.parse(fs.readFileSync(jsonFilePath)), opts)
      return new this(schema, null, opts)
    }
    return new this(schema, hrpcJson, opts)
  }

  toCode({ esm = this.constructor.esm, filename } = {}) {
    return generateCode(this, { esm, filename })
  }

  static toDisk(hrpc, hrpcDir, opts = {}) {
    if (typeof hrpcDir === 'object' && hrpcDir) {
      opts = hrpcDir
      hrpcDir = null
    }
    if (typeof opts.esm === 'undefined') {
      opts = { ...opts, esm: this.esm }
    }
    if (!hrpcDir) hrpcDir = hrpc.hrpcDir
    fs.mkdirSync(hrpcDir, { recursive: true })

    const messagesPath = p.join(p.resolve(hrpcDir), MESSAGES_FILE_NAME)
    const hrpcJsonPath = p.join(p.resolve(hrpcDir), HRPC_JSON_FILE_NAME)
    const codePath = p.join(p.resolve(hrpcDir), CODE_FILE_NAME)

    fs.writeFileSync(
      hrpcJsonPath,
      JSON.stringify(hrpc.toJSON(), null, 2) + '\n',
      {
        encoding: 'utf-8'
      }
    )
    fs.writeFileSync(messagesPath, hrpc.schema.toCode(opts), {
      encoding: 'utf-8'
    })
    fs.writeFileSync(codePath, generateCode(hrpc, opts), { encoding: 'utf-8' })
  }
}
