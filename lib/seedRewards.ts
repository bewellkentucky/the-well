import { db } from "@/lib/db"

const REWARDS = [
  {
    id: "reward-1",
    title: "Be Well Hoodie",
    description: "Heavyweight fleece, embroidered Be Well Kentucky mark on the chest.",
    cost: 1200,
    category: "Swag",
  },
  {
    id: "reward-2",
    title: "Ceramic Mug",
    description: "Hand-thrown, dishwasher-safe. Cream with deep slate interior.",
    cost: 350,
    category: "Swag",
  },
  {
    id: "reward-3",
    title: "$25 DoorDash",
    description: "Lunch on us. Delivered to your inbox in 90 seconds.",
    cost: 2500,
    category: "Gift Card",
  },
  {
    id: "reward-4",
    title: "Half-Day Off",
    description: "4 hours of bonus PTO added to your BambooHR balance. Use it whenever.",
    cost: 5000,
    category: "Time",
  },
  {
    id: "reward-5",
    title: "Plant for Your Desk",
    description: "Local nursery picks. Pothos, ZZ, or snake plant. Your call.",
    cost: 600,
    category: "Office",
  },
  {
    id: "reward-6",
    title: "Coffee Subscription",
    description: "One month of bags from Sunergos. Locally roasted, your address.",
    cost: 1800,
    category: "Gift Card",
  },
  {
    id: "reward-7",
    title: "Lunch Catered",
    description: "Treat your pod to a meal. You pick the spot, we handle the order.",
    cost: 4500,
    category: "Team",
  },
  {
    id: "reward-8",
    title: "Be Well Tote",
    description: "Heavy canvas, leather handle. Carries a laptop, a lunch, and dignity.",
    cost: 700,
    category: "Swag",
  },
  {
    id: "reward-9",
    title: "CEU Stipend $100",
    description: "Apply to any approved continuing education course.",
    cost: 10000,
    category: "Growth",
  },
]

export async function seedRewards() {
  for (const reward of REWARDS) {
    await db.reward.upsert({
      where: { id: reward.id },
      create: reward,
      update: {},
    })
  }
}
