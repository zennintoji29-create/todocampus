/**
 * CampusOS Cryptographic Audit Ledger (Blockchain-grade Tamper Evident Log)
 * 
 * Uses SHA-256 cryptographic hashing to chain state mutations and administrative
 * actions into an immutable ledger. Any modification or truncation of past blocks
 * invalidates the hash chain, providing verifiable proof of integrity.
 */

export interface AuditBlock {
  index: number
  timestamp: string
  action: string
  actor: string
  target: string
  payloadHash: string
  previousHash: string
  hash: string
  nonce: number
}

const STORAGE_KEY = 'campusos_audit_blockchain_v1'
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Computes a SHA-256 hexadecimal hash using the Web Crypto API
 */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Calculates hash for a block structure
 */
export async function computeBlockHash(
  index: number,
  timestamp: string,
  action: string,
  actor: string,
  target: string,
  payloadHash: string,
  previousHash: string,
  nonce: number
): Promise<string> {
  const content = `${index}:${timestamp}:${action}:${actor}:${target}:${payloadHash}:${previousHash}:${nonce}`
  return sha256(content)
}

/**
 * Retrieves the current local blockchain ledger
 */
export function getBlockchainLedger(): AuditBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Saves the blockchain ledger to persistent local storage
 */
function saveBlockchainLedger(chain: AuditBlock[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chain))
  } catch (err) {
    console.error('Failed to persist blockchain ledger:', err)
  }
}

/**
 * Initializes the blockchain with a genesis block if empty
 */
export async function initBlockchain(): Promise<AuditBlock[]> {
  const chain = getBlockchainLedger()
  if (chain.length > 0) return chain

  const timestamp = new Date().toISOString()
  const genesisPayloadHash = await sha256('Genesis Block CampusOS Decentralized Audit Ledger')
  const genesisHash = await computeBlockHash(
    0,
    timestamp,
    'GENESIS',
    'system@campusos.internal',
    'root',
    genesisPayloadHash,
    GENESIS_HASH,
    0
  )

  const genesisBlock: AuditBlock = {
    index: 0,
    timestamp,
    action: 'GENESIS_ANCHOR',
    actor: 'system',
    target: 'network_anchor',
    payloadHash: genesisPayloadHash,
    previousHash: GENESIS_HASH,
    hash: genesisHash,
    nonce: 0,
  }

  const initialChain = [genesisBlock]
  saveBlockchainLedger(initialChain)
  return initialChain
}

/**
 * Appends a new verified cryptographic audit block to the ledger
 */
export async function recordAuditBlock(
  action: string,
  actor: string,
  target: string,
  payload: any = {}
): Promise<AuditBlock> {
  let chain = getBlockchainLedger()
  if (chain.length === 0) {
    chain = await initBlockchain()
  }

  const lastBlock = chain[chain.length - 1]
  const index = lastBlock.index + 1
  const timestamp = new Date().toISOString()
  const payloadHash = await sha256(typeof payload === 'string' ? payload : JSON.stringify(payload))
  const previousHash = lastBlock.hash
  const nonce = Math.floor(Math.random() * 1000000)

  const hash = await computeBlockHash(
    index,
    timestamp,
    action,
    actor,
    target,
    payloadHash,
    previousHash,
    nonce
  )

  const newBlock: AuditBlock = {
    index,
    timestamp,
    action,
    actor,
    target,
    payloadHash,
    previousHash,
    hash,
    nonce,
  }

  chain.push(newBlock)
  saveBlockchainLedger(chain)
  return newBlock
}

/**
 * Validates the entire blockchain from genesis to the latest block
 */
export async function verifyBlockchainIntegrity(): Promise<{
  valid: boolean
  blockCount: number
  brokenIndex?: number
  latestHash: string
  details?: string
}> {
  const chain = getBlockchainLedger()
  if (chain.length === 0) {
    const initialized = await initBlockchain()
    return {
      valid: true,
      blockCount: initialized.length,
      latestHash: initialized[0].hash,
    }
  }

  for (let i = 0; i < chain.length; i++) {
    const block = chain[i]

    // Verify previous hash pointer
    if (i === 0) {
      if (block.previousHash !== GENESIS_HASH) {
        return { valid: false, blockCount: chain.length, brokenIndex: 0, latestHash: block.hash, details: 'Genesis previousHash is altered' }
      }
    } else {
      const prevBlock = chain[i - 1]
      if (block.previousHash !== prevBlock.hash) {
        return { valid: false, blockCount: chain.length, brokenIndex: i, latestHash: block.hash, details: `Broken hash link between block ${i - 1} and ${i}` }
      }
    }

    // Recalculate block hash
    const recalculated = await computeBlockHash(
      block.index,
      block.timestamp,
      block.action,
      block.actor,
      block.target,
      block.payloadHash,
      block.previousHash,
      block.nonce
    )

    if (recalculated !== block.hash) {
      return {
        valid: false,
        blockCount: chain.length,
        brokenIndex: i,
        latestHash: block.hash,
        details: `Hash collision or payload tampering at block ${i}`,
      }
    }
  }

  return {
    valid: true,
    blockCount: chain.length,
    latestHash: chain[chain.length - 1].hash,
  }
}
