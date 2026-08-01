import { BlockchainRecord, SalaryAgreement } from '../types';

/**
 * Calculates real SHA-256 cryptographic hash of string data or Uint8Array/ArrayBuffer (e.g. PDF bytes)
 */
export async function calculateSHA256(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } else {
    buffer = data;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a mock smart contract address
 */
export const SALARY_SMART_CONTRACT_ADDRESS = '0x3F8a9212C9438dB9aE029f6487D43c4f6B0B94A0';

/**
 * Generates a Merkle Root from a list of document hashes
 */
export async function generateMerkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) {
    return await calculateSHA256('EMPTY_MERKLE_TREE');
  }
  if (hashes.length === 1) {
    return hashes[0];
  }

  const currentLevel = [...hashes];
  if (currentLevel.length % 2 !== 0) {
    currentLevel.push(currentLevel[currentLevel.length - 1]); // Duplicate last if odd
  }

  const nextLevel: string[] = [];
  for (let i = 0; i < currentLevel.length; i += 2) {
    const combined = currentLevel[i] + currentLevel[i + 1];
    const parentHash = await calculateSHA256(combined);
    nextLevel.push(parentHash);
  }

  return generateMerkleRoot(nextLevel);
}

/**
 * Mines a new block on the simulated enterprise blockchain for a salary agreement
 */
export async function anchorAgreementToBlockchain(
  agreement: SalaryAgreement,
  currentBlockNumber: number = 18459201
): Promise<BlockchainRecord> {
  const timestamp = new Date().toISOString();
  const txPayload = `${agreement.id}:${agreement.fileHash}:${agreement.employeeId}:${timestamp}`;
  const txHash = await calculateSHA256(txPayload);
  
  const blockHeader = `BLOCK:${currentBlockNumber}:${txHash}:${timestamp}`;
  const blockHash = await calculateSHA256(blockHeader);
  const merkleRoot = await generateMerkleRoot([agreement.fileHash, txHash]);

  return {
    txHash,
    blockNumber: currentBlockNumber + 1,
    blockHash,
    merkleRoot,
    timestamp,
    smartContractAddress: SALARY_SMART_CONTRACT_ADDRESS,
    gasUsed: Math.floor(21000 + Math.random() * 15000),
    network: 'Ethereum Enterprise Mainnet',
    status: 'CONFIRMED'
  };
}

/**
 * Verification outcome interface
 */
export interface VerificationResult {
  isValid: boolean;
  matchType: 'EXACT_MATCH' | 'HASH_MISMATCH' | 'NOT_FOUND';
  calculatedHash: string;
  matchedAgreement?: SalaryAgreement;
  blockchainRecord?: BlockchainRecord;
  message: string;
  verifiedAt: string;
}

/**
 * Verifies an uploaded PDF file array buffer against stored documents
 */
export async function verifyPdfOnBlockchain(
  pdfBuffer: ArrayBuffer,
  agreements: SalaryAgreement[]
): Promise<VerificationResult> {
  const calculatedHash = await calculateSHA256(pdfBuffer);
  const verifiedAt = new Date().toISOString();

  const match = agreements.find(
    a => a.fileHash.toLowerCase() === calculatedHash.toLowerCase() ||
         a.signature?.signatureHash.toLowerCase() === calculatedHash.toLowerCase()
  );

  if (!match) {
    return {
      isValid: false,
      matchType: 'NOT_FOUND',
      calculatedHash,
      message: 'המסמך אינו רשום בבלוקצ׳יין של הארגון. ייתכן שזהו קובץ שלא נחתם במערכת זו.',
      verifiedAt
    };
  }

  if (match.status !== 'SIGNED' || !match.blockchain) {
    return {
      isValid: false,
      matchType: 'HASH_MISMATCH',
      calculatedHash,
      matchedAgreement: match,
      message: 'הקובץ נמצא במערכת אך אינו נושא חתימה מאושרת ומעוגנת בבלוקצ׳יין.',
      verifiedAt
    };
  }

  return {
    isValid: true,
    matchType: 'EXACT_MATCH',
    calculatedHash,
    matchedAgreement: match,
    blockchainRecord: match.blockchain,
    message: 'המסמך אומת בהצלחה! החתימה הדיגיטלית וטביעת האצבע של ה-PDF תואמות ב-100% לבלוקצ׳יין.',
    verifiedAt
  };
}
