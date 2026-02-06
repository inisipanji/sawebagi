import { Redis } from '@upstash/redis';
import { createHmac, timingSafeEqual } from 'node:crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Fungsi untuk validasi signature Bagi Bagi (opsional, jika BAGIBAGI_WEBHOOK_TOKEN di-set)
function isValidBagiBagiSignature(body, webhookToken, signature) {
  if (!webhookToken || !signature) return true; // Skip validasi jika tidak ada token
  try {
    const generatedSignature = createHmac('sha256', webhookToken)
      .update(JSON.stringify(body))
      .digest('hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    const generatedSignatureBuffer = Buffer.from(generatedSignature, 'hex');
    return timingSafeEqual(
      new Uint8Array(signatureBuffer),
      new Uint8Array(generatedSignatureBuffer)
    );
  } catch {
    return false;
  }
}

// Deteksi platform berdasarkan struktur payload
function detectPlatform(data, headers) {
  // Bagi Bagi: punya transaction_id yang diawali "bagibagi-" atau ada header X-Bagibagi-Signature
  if (data.transaction_id?.startsWith('bagibagi-') || headers['x-bagibagi-signature']) {
    return 'bagibagi';
  }
  // Saweria: punya donator_name dan amount_raw
  if (data.donator_name && data.amount_raw !== undefined) {
    return 'saweria';
  }
  return null;
}

// Normalize data dari berbagai platform ke format yang sama
function normalizeData(data, platform) {
  switch (platform) {
    case 'saweria':
      return {
        donator: data.donator_name.trim(),  // Jangan lowercase, biar Roblox yang handle
        amount: data.amount_raw,
        message: data.message || ''
      };
    case 'bagibagi':
      return {
        donator: data.name.trim(),  // Jangan lowercase, biar Roblox yang handle
        amount: data.amount,
        message: data.message || ''
      };
    default:
      return null;
  }
}

export default async function handler(request, response) {
  // 1. TERIMA DATA DARI SAWERIA / BAGI BAGI (WEBHOOK)
  if (request.method === 'POST') {
    try {
      const data = request.body;
      const headers = request.headers;
      
      // Deteksi platform
      const platform = detectPlatform(data, headers);
      
      if (!platform) {
        return response.status(400).json({ 
          error: 'Invalid data - unknown platform. Supported: Saweria, BagiBagi' 
        });
      }
      
      // Validasi signature untuk Bagi Bagi (jika token di-set)
      if (platform === 'bagibagi') {
        const bagiBagiToken = process.env.BAGIBAGI_WEBHOOK_TOKEN;
        const signature = headers['x-bagibagi-signature'];
        
        if (bagiBagiToken && !isValidBagiBagiSignature(data, bagiBagiToken, signature)) {
          return response.status(401).json({ error: 'Invalid BagiBagi signature' });
        }
      }
      
      // Normalize data ke format yang sama
      const normalized = normalizeData(data, platform);
      
      if (!normalized || !normalized.donator || !normalized.amount) {
        return response.status(400).json({ error: `Invalid data from ${platform}` });
      }
      
      // Simpan ke database antrian
      await redis.rpush('donations', JSON.stringify(normalized));
      await redis.zincrby('saweria_leaderboard', normalized.amount, normalized.donator);
      
      return response.status(200).json({ 
        status: 'ok', 
        platform: platform,
        donator: normalized.donator 
      });
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  }

  // 2. KIRIM DATA KE ROBLOX (POLLING)
  if (request.method === 'GET') {
    try {
      // Ambil 1 data terlama & hapus dari antrian
      const donation = await redis.lpop('donations');

      if (donation) {
        // Parse jika masih string
        const parsed = typeof donation === 'string' ? JSON.parse(donation) : donation;
        return response.status(200).json(parsed); 
      } else {
        return response.status(200).json(null);
      }
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  }

  return response.status(405).send('Method Not Allowed');
}
