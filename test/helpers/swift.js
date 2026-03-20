'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const SwiftHyperschema = require('hyperschema/swift')
const generateSwift = require('../../lib/swift-codegen')

const WORKSPACE = path.join(__dirname, '../swift-workspace')
const SOURCES = path.join(WORKSPACE, 'Sources')
const TIMEOUT = 120000

// Single-module executable: Schema.swift and HRPC.swift live in the same
// target so we avoid cross-module visibility issues (hyperschema types are
// not yet `public`). We strip `import Schema` from HRPC.swift since the
// types are already in scope.
const TEST_PACKAGE_SWIFT = `// swift-tools-version: 5.10
import PackageDescription

let package = Package(
  name: "HRPCTest",
  platforms: [.macOS(.v11), .iOS(.v14)],
  dependencies: [
    .package(url: "https://github.com/holepunchto/bare-rpc-swift", branch:"main"),
    .package(url: "https://github.com/holepunchto/compact-encoding-swift", branch: "main")
  ],
  targets: [
    .executableTarget(
      name: "HRPCTest",
      dependencies: [
        .product(name: "BareRPC", package: "bare-rpc-swift"),
        .product(name: "CompactEncoding", package: "compact-encoding-swift")
      ],
      path: "Sources"
    )
  ]
)
`

function runSwift(schema, hrpc, mainSwift) {
  fs.mkdirSync(SOURCES, { recursive: true })

  // Generate Schema.swift from hyperschema (types are internal)
  const schemaSwift = schema.toCode()
  fs.writeFileSync(path.join(SOURCES, 'Schema.swift'), schemaSwift, {
    encoding: 'utf-8'
  })

  // Generate HRPC.swift: strip `import Schema` (same module in test) and
  // downgrade `public` to internal so it can use internal Schema types.
  let hrpcSwift = generateSwift(hrpc)
  hrpcSwift = hrpcSwift.replace('import Schema\n', '')
  hrpcSwift = hrpcSwift.replace(/public /g, '')
  fs.writeFileSync(path.join(SOURCES, 'HRPC.swift'), hrpcSwift, {
    encoding: 'utf-8'
  })

  // Write test Package.swift and main.swift
  fs.writeFileSync(path.join(WORKSPACE, 'Package.swift'), TEST_PACKAGE_SWIFT)
  fs.writeFileSync(path.join(SOURCES, 'main.swift'), mainSwift)

  const result = spawnSync('swift', ['run'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    timeout: TIMEOUT
  })

  const timedOut = result.error && result.error.code === 'ETIMEDOUT'
  return {
    ok: result.status === 0 && !timedOut,
    stdout: result.stdout ? result.stdout.toString() : '',
    stderr: timedOut
      ? `[swift run timed out after ${TIMEOUT}ms] ${result.error.message}`
      : result.stderr
        ? result.stderr.toString()
        : ''
  }
}

module.exports = { runSwift }
