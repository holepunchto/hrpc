const { RPCStream, RPCRequestStream } = require('./lib/stream')

module.exports = {
  c: require('compact-encoding'),
  RPC: require('bare-rpc'),
  RPCStream,
  RPCRequestStream
}
