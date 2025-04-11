const p = require('path')
const fs = require('fs')
const Hyperschema = require('hyperschema')
const generateCode = require('./lib/codegen')

const CODE_FILE_NAME = 'index.js'
const MESSAGES_FILE_NAME = 'messages.js'
const INTERFACE_JSON_FILE_NAME = 'interface.json'

class HyperInterfaceNamespace {
  constructor (hyperInterface, name) {
    this.hyperInterface = hyperInterface
    this.name = name
  }

  register (description) {
    const fqn = '@' + this.name + '/' + description.name
    this.hyperInterface.register(fqn, description)
  }
}

module.exports = class HyperInterface {
  constructor (schema, interfaceJson, { offset, interfaceDir = null, schemaDir = null } = {}) {
    this.schema = schema
    this.version = interfaceJson ? interfaceJson.version : 0
    this.offset = interfaceJson ? interfaceJson.offset : (offset || 0)
    this.interfaceDir = interfaceDir
    this.schemaDir = schemaDir

    this.namespaces = new Map()

    this.handlersByName = new Map()
    this.handlersById = new Map()
    this.handlers = []

    this.changed = false
    this.initializing = true
    if (interfaceJson) {
      for (let i = 0; i < interfaceJson.schema.length; i++) {
        const description = interfaceJson.schema[i]
        this.register(description.name, description)
      }
    }
    this.initializing = false
  }

  namespace (name) {
    return new HyperInterfaceNamespace(this, name)
  }

  register (fqn, description) {
    const existingByName = this.handlersByName.get(fqn)
    const existingById = Number.isInteger(description.id) ? this.handlersById.get(description.id) : null
    if (existingByName && existingById) {
      if (existingByName !== existingById) throw new Error('ID/Name mismatch for handler: ' + fqn)
      if (Number.isInteger(description.id) && (existingByName.id !== description.id)) {
        throw new Error('Cannot change the assigned ID for handler: ' + fqn)
      }
    }

    const request = this.schema.resolve(description.request.name)
    if (!request) throw new Error('Invalid request type')

    const response = this.schema.resolve(description.response.name)
    if (!response) throw new Error('Invalid response type')

    if (existingByName && (existingByName.request.name !== description.request.name)) {
      throw new Error('Cannot alter the request type for a handler')
    }

    if (existingByName && (existingByName.request.stream !== description.request.stream)) {
      throw new Error('Cannot alter the request stream attribute for a handler')
    }

    if (existingByName && (existingByName.response.name !== description.response.name)) {
      throw new Error('Cannot alter the response type for a handler')
    }

    if (existingByName && (existingByName.response.stream !== description.response.stream)) {
      throw new Error('Cannot alter the response stream attribute for a handler')
    }

    if (!this.initializing && !existingByName && !this.changed) {
      this.changed = true
      this.version += 1
    }

    const id = Number.isInteger(description.id) ? description.id : this.currentOffset++

    const handler = {
      id,
      name: fqn,
      request: description.request,
      response: description.response,
      version: Number.isInteger(description.version) ? description.version : this.version
    }

    this.handlersById.set(id, handler)
    this.handlersByName.set(fqn, handler)

    if (!existingByName) {
      this.handlers.push(handler)
    }
  }

  toJSON () {
    return {
      version: this.version,
      schema: this.handlers
    }
  }

  static from (schemaJson, interfaceJson, opts) {
    const schema = Hyperschema.from(schemaJson)
    if (typeof interfaceJson === 'string') {
      const jsonFilePath = p.join(p.resolve(interfaceJson), INTERFACE_JSON_FILE_NAME)
      let exists = false
      try {
        fs.statSync(jsonFilePath)
        exists = true
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      opts = { ...opts, interfaceDir: interfaceJson, schemaDir: schemaJson }
      if (exists) return new this(schema, JSON.parse(fs.readFileSync(jsonFilePath)), opts)
      return new this(schema, null, opts)
    }
    return new this(schema, interfaceJson, opts)
  }

  toCode ({ esm = this.constructor.esm, filename } = {}) {
    return generateCode(this, { esm, filename })
  }

  static toDisk (hyperInterface, interfaceDir, opts = {}) {
    if (typeof interfaceDir === 'object' && interfaceDir) {
      opts = interfaceDir
      interfaceDir = null
    }
    if (typeof opts.esm === 'undefined') {
      opts = { ...opts, esm: this.esm }
    }
    if (!interfaceDir) interfaceDir = hyperInterface.interfaceDir
    fs.mkdirSync(interfaceDir, { recursive: true })

    const messagesPath = p.join(p.resolve(interfaceDir), MESSAGES_FILE_NAME)
    const interfaceJsonPath = p.join(p.resolve(interfaceDir), INTERFACE_JSON_FILE_NAME)
    const codePath = p.join(p.resolve(interfaceDir), CODE_FILE_NAME)

    fs.writeFileSync(interfaceJsonPath, JSON.stringify(hyperInterface.toJSON(), null, 2), { encoding: 'utf-8' })
    fs.writeFileSync(messagesPath, hyperInterface.schema.toCode(opts), { encoding: 'utf-8' })
    fs.writeFileSync(codePath, generateCode(hyperInterface, opts), { encoding: 'utf-8' })
  }
}
