const { Duplex, isEnded, isFinished } = require('streamx')
const b4a = require('b4a')

class RPCStream extends Duplex {
  constructor (readStream, readStreamEncoding, writeStream, writeStreamEncoding) {
    super()

    this.data = null

    this.readStream = readStream
    this.readStreamEncoding = readStreamEncoding

    this.writeStream = writeStream
    this.writeStreamEncoding = writeStreamEncoding

    this._writeCallback = null

    const destroy = this.destroy.bind(this)

    if (this.writeStream) {
      this.writeStream.on('drain', this._continueWrite.bind(this, null))
      this.writeStream.on('error', destroy)
      this.writeStream.on('close', onwriteclose)
    } else {
      this.end()
    }

    if (this.readStream) {
      this.readStream.on('data', this._ondata.bind(this))
      this.readStream.on('error', destroy)
      this.readStream.on('close', onreadclose)
    } else {
      this.push(null)
    }

    function onreadclose () {
      if (!isEnded(this)) this.destroy()
    }

    function onwriteclose () {
      if (!isFinished(this)) this.destroy()
    }
  }

  _read (cb) {
    this.readStream.resume()
    cb(null)
  }

  _writev (datas, cb) {
    let flushed = true

    for (let i = 0; i < datas.length; i++) {
      const state = { start: 0, end: 0, buffer: null }
      const data = datas[i]
      this.writeStreamEncoding.preencode(state, data)
      state.buffer = b4a.allocUnsafe(state.end)
      this.writeStreamEncoding.encode(state, data)
      flushed = this.writeStream.write(state.buffer)
    }

    if (flushed) {
      cb(null)
      return
    }

    this._writeCallback = cb
  }

  _final (cb) {
    if (this.writeStream) this.writeStream.end()
    cb(null)
  }

  _continueWrite (err) {
    if (this._writeCallback === null) return
    const cb = this._writeCallback
    this._writeCallback = null
    cb(err)
  }

  _predestroy () {
    this._continueWrite(null)
    if (this.readStream) this.readStream.destroy()
    if (this.writeStream) this.writeStream.destroy()
  }

  _ondata (buffer) {
    const state = { start: 0, end: buffer.byteLength, buffer }

    let data = null

    try {
      data = this.readStreamEncoding.decode(state)
    } catch (err) {
      this.destroy(err)
      return
    }

    if (!this.push(data)) this.pause()
  }
}

class RPCRequestStream extends RPCStream {
  constructor (request, replyEncoding, readStream, readStreamEncoding, writeStream, writeStreamEncoding) {
    super(readStream, readStreamEncoding, writeStream, writeStreamEncoding)

    this.request = request
    this.replyEncoding = replyEncoding
  }

  async reply () {
    const buffer = await this.request.reply()
    const state = { start: 0, end: buffer.byteLength, buffer }
    return this.replyEncoding.decode(state)
  }
}

module.exports = {
  RPCStream,
  RPCRequestStream
}
