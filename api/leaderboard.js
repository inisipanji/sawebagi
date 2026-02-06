
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Ambil Top 50 Data (High to Low)
  // Format Upstash biasanya mengembalikan array of objects atau array datar
  // Kita pakai try-catch biar aman
  try {
    const data = await redis.zrange('saweria_leaderboard', 0, 49, {
      rev: true,
      withScores: true
    });
    
    // Data dari Redis biasanya: [{member: "Budi", score: 50000}, ...]
    // Atau Flat: ["Budi", 50000, "Siti", 20000] tergantung versi.
    // Kita kirim mentahnya ke Roblox, biar Roblox yang olah.
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
