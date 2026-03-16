'use strict'

const fs = require('fs')
const path = require('path')
const HRPCBuilder = require('./builder.cjs')
const generateSwift = require('./lib/swift-codegen')

const BARE_RPC_SWIFT_URL = 'https://github.com/holepunchto/bare-rpc-swift'

class SwiftHRPC extends HRPCBuilder {
  static toDisk(hrpc, dir, opts = {}) {
    // Mirror parent argument-shifting: if dir is an object, treat it as opts
    if (typeof dir === 'object' && dir !== null && !Array.isArray(dir)) {
      opts = dir
      dir = null
    }
    if (!dir) dir = hrpc.hrpcDir
    SwiftHRPC._writeToDisk(hrpc, dir, opts)
  }

  // Separated so tests can call it directly with a fake hrpc object
  static _writeToDisk(
    hrpc,
    dir,
    {
      schemaPackagePath = '../schema',
      schemaPackageName = 'Schema',
      schemaPackageId = 'schema'
    } = {}
  ) {
    const root = path.resolve(dir)
    const sources = path.join(root, 'Sources')
    fs.mkdirSync(sources, { recursive: true })

    // hrpc.json — same append-only schema snapshot as JS codegen
    fs.writeFileSync(
      path.join(root, 'hrpc.json'),
      JSON.stringify(hrpc.toJSON(), null, 2) + '\n',
      { encoding: 'utf-8' }
    )

    // Sources/HRPC.swift
    fs.writeFileSync(path.join(sources, 'HRPC.swift'), generateSwift(hrpc), {
      encoding: 'utf-8'
    })

    // Package.swift
    fs.writeFileSync(
      path.join(root, 'Package.swift'),
      generatePackageSwift({
        schemaPackagePath,
        schemaPackageName,
        schemaPackageId
      }),
      { encoding: 'utf-8' }
    )
  }
}

function generatePackageSwift({
  schemaPackagePath,
  schemaPackageName,
  schemaPackageId
}) {
  return `// swift-tools-version: 5.10
import PackageDescription

let package = Package(
  name: "HRPC",
  platforms: [.macOS(.v11), .iOS(.v14)],
  dependencies: [
    .package(url: "${BARE_RPC_SWIFT_URL}", branch: "main"),
    .package(path: "${schemaPackagePath}")
  ],
  targets: [
    .target(
      name: "HRPC",
      dependencies: [
        .product(name: "BareRPC", package: "bare-rpc-swift"),
        .product(name: "${schemaPackageName}", package: "${schemaPackageId}")
      ],
      path: "Sources"
    )
  ]
)
`
}

module.exports = SwiftHRPC
