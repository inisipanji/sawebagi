
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Ambil SEMUA data donator (High to Low)
  // Pakai 0, -1 supaya semua member di sorted set ikut keluar
  // Jadi player yang pernah donate tapi di luar top 50 tetap muncul di leaderstats
  try {
    const data = await redis.zrange('saweria_leaderboard', 0, -1, {
      rev: true,
      withScores: true
    });
    
    // Data dari Redis: flat array ["Budi", 50000, "Siti", 20000, ...]
    // atau object array [{member: "Budi", score: 50000}, ...]
    // Kita kirim mentahnya ke Roblox, biar Roblox yang olah.
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
