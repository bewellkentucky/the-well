# The Well, Fulfillment Addendum

How redemptions actually become packages on doorsteps, gift cards in inboxes, and gifted PTO into BambooHR, without anyone at Be Well or LCED touching an order form.

---

## 1. The Honest Math on "Real Swag"

Before picking providers, the central question: **do you want a swag shop, or do you want a recognition program that happens to deliver swag?** These look identical from a screenshot but the operations are night-and-day different.

| Approach | Cost upfront | Ongoing work | Time-to-launch |
|---|---|---|---|
| **Bulk-buy inventory** (order 50 hoodies, store them in the office, ship/distribute manually) | $1,500-$3,000 capital tied up | Someone manages a closet, packs boxes, deals with sizing | 4-6 weeks (printing, shipping, organizing) |
| **Print-on-demand** (Printful prints + ships per order, no inventory) | $0 | Zero, fully automated | 1-2 weeks (set up products) |
| **Gift cards only** (skip physical swag, give people money to a place they actually want) | $0 | Zero | 2 days |

**For ~30 people redeeming maybe 4-8 items per quarter, print-on-demand + gift cards is the right pick.** You'd never hit the volume where bulk-buying breaks even, and the storage/fulfillment burden falls on whoever has the desk closest to the closet (probably Callie). Worth saying explicitly because the temptation to "design our own hoodies and buy 50" is real, and it almost always becomes someone's least favorite part of their job.

---

## 2. The Three-Provider Stack

For The Well, three providers cover everything:

| Provider | Handles | Cost model | Why it's the pick |
|---|---|---|---|
| **Tremendous** | Gift cards, cash equivalents (DoorDash, Visa prepaid, Amazon, local merchants, donations) | Free, pay only face value | No platform fees, no minimums, 2,400+ brands, sandbox is free, 10 req/sec rate limit (way more than you need), instant email delivery |
| **Printful** | Branded swag (hoodies, mugs, totes, hats) | Free API, pay per item printed + shipped | Most mature POD API, sandbox available, drop-ships from the closest facility, manual/API store type built specifically for custom integrations |
| **Internal** | Time off, CEU stipends, catered lunches, anything specific to your practice | The Well's existing systems | Sends approval emails via Gmail API, gifts PTO via BambooHR API, requests reimbursements via Gmail |

Each reward in the catalog has a `provider` field. The redemption router reads that field and dispatches to the right integration.

---

## 3. Tremendous (Gift Cards)

### Why Tremendous over Tango Card and Giftogram

For an internal program at your scale, Tremendous wins on three things:

1. **No platform fees**, you pay face value, full stop. Tango Card requires enterprise agreements with volume commitments; Giftogram charges per-transaction.
2. **Sandbox is free and fully functional**, you can build the integration end-to-end without spending a dollar.
3. **The "Reward Link" model**, instead of locking someone into a specific gift card, you send them a link and they pick from 2,400+ options. Hayley wants Starbucks, Tom wants Amazon, Cheri wants a charitable donation to a literacy nonprofit, they all use the same reward.

### Setup (15 minutes)

1. Create a free **sandbox** account at tremendous.com
2. Team Settings → Developers → **Add API key**
3. Store as `TREMENDOUS_API_KEY` (sandbox) and later swap to a production key
4. For production: fill out the API access request form, get approved (usually same-day for legitimate businesses), generate production key
5. Fund the production account via ACH ($500-$1,000 to start; auto-refill when balance drops below $200)

### Sending a gift card (the entire integration)

```typescript
// /lib/providers/tremendous.ts
const BASE = process.env.TREMENDOUS_ENV === "production"
  ? "https://api.tremendous.com"
  : "https://testflight.tremendous.com"

export async function sendReward({
  fundingSourceId,
  amount,           // USD, not drops — convert at the conversion rate
  productCode,      // e.g. "DOORDASH_US" or "AMAZON_US" or "REWARD_LINK"
  recipientName,
  recipientEmail,
  kudoMessage,      // optional — appears in the delivery email
}) {
  const res = await fetch(`${BASE}/api/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TREMENDOUS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment: { funding_source_id: fundingSourceId },
      reward: {
        value: { denomination: amount, currency_code: "USD" },
        products: [productCode],
        delivery: { method: "EMAIL" },
        recipient: { name: recipientName, email: recipientEmail },
        custom_message: kudoMessage,
        campaign_id: process.env.TREMENDOUS_CAMPAIGN_ID,
      },
    }),
  })
  if (!res.ok) throw new Error(`Tremendous ${res.status}: ${await res.text()}`)
  return res.json()  // contains order.id, reward.id, status
}
```

That's the full integration. **One POST request.** Tremendous handles the email, the branding, the delivery, the redemption flow, the support tickets when someone forwards the email to the wrong address.

### A The Well-branded "campaign"

Before going live, create a **campaign template** in the Tremendous dashboard:
- Logo: The Well mark
- Subject line: "{Recipient name}, you've earned a reward from Be Well Kentucky"
- Body copy: short, warm, mentions the program
- Custom thank-you page after redemption

Then pass `campaign_id` on every order so all emails look like they came from Be Well/LCED, not from Tremendous. People won't even know Tremendous is the provider, which is the goal.

---

## 4. Printful (Branded Swag)

### The "Manual / API Store" trick

This is the under-documented part. Printful's main use case is plugging into Shopify/Etsy/etc., you don't have a Shopify store. **You want their "Manual / API Store" type instead**, which is built specifically for custom integrations: products exist in Printful, you submit orders programmatically, no public storefront exposed.

### Setup (~2 hours including design work)

1. Create a Printful account
2. Dashboard → Stores → **Connect via API** → creates a manual/API store
3. Settings → API → generate token, store as `PRINTFUL_API_KEY`
4. Design your swag:
   - Upload an embroidered The Well mark for the hoodie chest
   - Upload a printed mark for the mug and tote
   - Pick blank products from Printful's catalog (e.g., Bella + Canvas hoodies are the standard)
   - Create variants for each size (S/M/L/XL/2XL)
5. Approve mockups, Printful generates them automatically
6. Note the `sync_variant_id` for each product/size combo; these go into The Well's reward catalog

### Submitting an order

```typescript
// /lib/providers/printful.ts
const BASE = "https://api.printful.com"

export async function createOrder({
  externalId,       // your The Well order ID — for idempotency
  recipient,        // { name, address1, city, state_code, country_code, zip }
  variantId,        // from the Printful sync product setup
  quantity = 1,
  autoConfirm = true,  // false = create as draft for review
}) {
  // Step 1: Create the order
  const draftRes = await fetch(`${BASE}/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: externalId,
      recipient,
      order_items: [{ source: "catalog", catalog_variant_id: variantId, quantity }],
    }),
  })
  if (!draftRes.ok) throw new Error(`Printful draft ${draftRes.status}: ${await draftRes.text()}`)
  const { data: order } = await draftRes.json()

  // Step 2: Confirm for fulfillment (this is the step that charges you)
  if (autoConfirm) {
    const confirmRes = await fetch(
      `${BASE}/v2/orders/${order.id}/confirmation`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
      }
    )
    if (!confirmRes.ok) throw new Error(`Printful confirm ${confirmRes.status}: ${await confirmRes.text()}`)
  }

  return order
}
```

### Webhooks for status updates

Printful pushes status updates to a webhook URL you configure. Subscribe to:
- `order_created`, confirms Printful received the order
- `order_failed`, address validation failed, item out of stock, etc.
- `package_shipped`, includes the tracking number
- `order_canceled`, rare but possible

Handler:

```typescript
// /app/api/webhooks/printful/route.ts
export async function POST(req: Request) {
  // Printful signs webhooks with a key you set in the dashboard
  const sig = req.headers.get("x-pf-webhook-signature")
  const raw = await req.text()
  // ... verify signature ...

  const event = JSON.parse(raw)
  const order = await db.redemption.findUnique({
    where: { printfulExternalId: event.data.external_id },
  })
  if (!order) return Response.json({ ignored: true })

  switch (event.type) {
    case "order_created":
      await db.redemption.update({
        where: { id: order.id },
        data: { status: "confirmed", printfulId: event.data.id },
      })
      break
    case "package_shipped":
      await db.redemption.update({
        where: { id: order.id },
        data: {
          status: "shipped",
          trackingNumber: event.data.shipments?.[0]?.tracking_number,
          trackingUrl: event.data.shipments?.[0]?.tracking_url,
        },
      })
      // Send the user a "your hoodie shipped" email
      await sendShipmentEmail(order.userId, event.data)
      break
    case "order_failed":
      // Refund the drops — this is the gotcha most people miss
      await db.user.update({
        where: { id: order.userId },
        data: { balance: { increment: order.cost } },
      })
      await db.redemption.update({
        where: { id: order.id },
        data: { status: "failed", failureReason: event.data.error },
      })
      await notifyAdminOfFailure(order, event.data.error)
      break
  }
  return Response.json({ ok: true })
}
```

### The four things to get right

1. **Address validation happens after order submission.** Printful rejects PO boxes, APO/FPO, and weird unit formats. Surface this in the UI, let people validate their address before redeeming, or accept that ~5% of orders will fail and refund the drops.
2. **Draft vs. Confirmed.** Orders start as `draft` (free) and need explicit confirmation to enter fulfillment (this is when you're charged). Always confirm in the same request flow, don't leave drafts hanging or your admin dashboard fills with garbage.
3. **Base cost is yours, not the recipient's.** When someone redeems a hoodie, The Well pays Printful ~$28.50 + $4.99 shipping. The drops cost (1,200n at $0.01/drops = $12) is what you charged in *opportunity cost*; the cash cost is what hits your card. Configure the drops→USD conversion so the program is sustainable. Set roughly **2x the wholesale Printful cost** as the minimum drops price.
4. **No advanced embroidery via API.** Printful does support embroidery, but the API hands the design straight to production, there's no design-review step. Either use simple prints (DTG, sublimation) or eat the manual-review overhead.

---

## 5. Internal Fulfillment

The rewards that don't go through Printful or Tremendous:

| Reward | What "fulfillment" means | How it works |
|---|---|---|
| Half-day Off (gifted) | Add 4 hours to recipient's BambooHR PTO balance | BambooHR API call to add the time as a bonus on top of accrued PTO, recipient then requests it through BambooHR like any other PTO |
| CEU stipend $100 | Approval from Callie + expense entry | Gmail to Callie cc supervisor → on approval, log a $100 line item in a Google Sheet that feeds QuickBooks, plus an email to the recipient with reimbursement instructions |
| Plant for desk | Manual order from local nursery | Gmail to Callie (or whoever owns office logistics) with name, plant preference, where to put it |
| Catered lunch | Gift card delivery in disguise | Actually a Tremendous $50 Visa prepaid card, let people pay for the lunch themselves, expense-style, no logistics |

The pattern: **for any "internal" reward, the right workflow engine is the system that already owns the data.** PTO lives in BambooHR, so The Well grants the time by adding hours to the BambooHR balance, then steps out of the way. CEU stipends are an accounting decision, so they route through email to the approver who handles them. Plant for desk is a one-off purchase, so it routes through email to whoever owns office logistics.

### Gifted PTO: the BambooHR API call

The Well doesn't try to be a PTO request system. Staff already request time off through BambooHR; that workflow is owned by HR and supervisors. The Well's role is **to add hours to the balance**, then let BambooHR's normal flow take it from there.

```typescript
// /lib/bamboohr.ts — gifting PTO to a user's balance
async function giftPto(employeeId: string, hours: number, reason: string) {
  // BambooHR's time-off API endpoint accepts manual balance adjustments
  // POST /v1/employees/{id}/time_off/balance_adjustment
  const response = await fetch(
    `https://api.bamboohr.com/api/gateway.php/${BAMBOO_SUBDOMAIN}/v1/employees/${employeeId}/time_off/balance_adjustment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(BAMBOO_API_KEY + ':x').toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeOffTypeId: PTO_TYPE_ID,  // numeric ID for your "PTO" category in BambooHR
        amount: hours,
        date: new Date().toISOString().split('T')[0],
        note: `Gifted via The Well — ${reason}`,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`BambooHR PTO grant failed: ${response.status}`)
  }
}
```

A few details worth noting about this flow:

- **No approval queue** in The Well for PTO redemptions. They auto-fulfill on click, the same way a gift card does. The user spent their drops; the hours are added; done.
- **Recipient gets a Chat DM** confirming: "🎁 4 hours of bonus PTO added to your BambooHR balance. Request it through BambooHR whenever you want to use it."
- **The supervisor isn't notified at this stage.** The PTO is added quietly. When the recipient later requests time off through BambooHR using that balance, the supervisor gets the normal BambooHR request, same as any other PTO request. They might never know it was gifted; they just see "PTO request from Bryn for Friday afternoon, approve/decline" through BambooHR's normal flow.
- **The "Time Off Type ID"** is the tricky setup piece. BambooHR has categories like "PTO," "Sick," "Bereavement," etc. each with a numeric ID. You either (a) grant gifted PTO under the existing "PTO" type, clean, no special tracking, or (b) create a separate "Gifted PTO" type in BambooHR settings so it's reportable separately. For your scale, the first option is fine.
- **No audit risk:** every gift includes a `note` field that says "Gifted via The Well, Half-day Off redemption" so BambooHR's time-off history shows exactly where it came from.

This is the cleanest possible internal-PTO model. The Well owns the *granting* of perk time; BambooHR owns the *requesting and approving* of all time off. Neither system overlaps the other's job.

---

## 6. The Money Side (Important)

This is the part most internal recognition programs get wrong: **the program needs a budget, and the budget is real money.**

For Be Well + LCED's scale:

```
Assumed: 28 staff × 100 drops/month allowance × $0.01/drops = $28/staff/mo earnable
Cap on what the program can cost: 28 × $28 = $784/mo if 100% utilized
Realistic at 60% utilization: ~$470/mo, or ~$5,600/year
```

Set up the funding plumbing once:

1. **Tremendous funding**, ACH from Be Well operating account, auto-refill from $200 to $1,500. Cap monthly auto-refill at the budget number above to prevent runaway spend.
2. **Printful billing**, corporate card on file. Set a monthly spending alert on the card so unusual activity surfaces.
3. **Cost attribution**, every redemption record stores the recipient's `entity` (BWK / LCED / Both) from BambooHR. End of quarter, run a report:
   ```sql
   SELECT entity, SUM(cost_usd) FROM redemptions
   WHERE created_at BETWEEN '2026-04-01' AND '2026-06-30'
   GROUP BY entity;
   ```
   Use that to allocate the cost across the two entities in your books. If you charge it all to Be Well, you're under-charging LCED for what amounts to a clinical-team benefit.

---

## 7. The Redemption Flow (Code)

The full path from "user clicks Redeem" to "order placed":

```typescript
// /app/api/redemptions/route.ts
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { rewardId, options } = await req.json()
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const reward = await db.reward.findUnique({ where: { id: rewardId } })

  if (!reward || !reward.active)
    return Response.json({ error: "Reward unavailable" }, { status: 404 })
  if (user.balance < reward.cost)
    return Response.json({ error: "Insufficient drops" }, { status: 402 })

  // Deduct first (we'll refund if fulfillment fails)
  await db.user.update({
    where: { id: user.id },
    data: { balance: { decrement: reward.cost } },
  })

  const redemption = await db.redemption.create({
    data: {
      userId: user.id,
      rewardId: reward.id,
      cost: reward.cost,
      status: "pending",
      options,
    },
  })

  // Route to the right provider
  try {
    switch (reward.provider) {
      case "tremendous": {
        const order = await tremendous.sendReward({
          fundingSourceId: process.env.TREMENDOUS_FUNDING_ID!,
          amount: reward.denominationUsd,
          productCode: reward.productCode,
          recipientName: user.fullName,
          recipientEmail: user.email,
          kudoMessage: `Earned through The Well — thanks for being you.`,
        })
        await db.redemption.update({
          where: { id: redemption.id },
          data: { status: "delivered", tremendousOrderId: order.order.id },
        })
        break
      }
      case "printful": {
        const order = await printful.createOrder({
          externalId: redemption.id,
          recipient: options.address,
          variantId: reward.variants[options.size],
          autoConfirm: true,
        })
        await db.redemption.update({
          where: { id: redemption.id },
          data: { status: "processing", printfulOrderId: order.id },
        })
        // package_shipped webhook will update to "shipped" later
        break
      }
      case "internal": {
        await handleInternalReward(redemption, reward, user)
        break
      }
    }
  } catch (err) {
    // Refund on failure
    await db.user.update({
      where: { id: user.id },
      data: { balance: { increment: reward.cost } },
    })
    await db.redemption.update({
      where: { id: redemption.id },
      data: { status: "failed", failureReason: String(err) },
    })
    return Response.json({ error: "Fulfillment failed" }, { status: 502 })
  }

  return Response.json({ redemption })
}
```

---

## 8. Schema Additions

Append to the `Reward` and `Redemption` models from the main plan:

```prisma
model Reward {
  id          String  @id @default(cuid())
  title       String
  description String
  cost        Int                   // drops
  category    String
  imageUrl    String?
  active      Boolean @default(true)

  // Provider routing
  provider    String                // "tremendous" | "printful" | "internal"

  // Tremendous-specific
  productCode      String?          // "DOORDASH_US", "AMAZON_US", "REWARD_LINK"
  denominationUsd  Float?           // face value

  // Printful-specific
  printfulProductId String?         // sync_product_id
  variants          Json?           // { "S": "v_id", "M": "v_id", ... }
  needsSize         Boolean @default(false)
  needsAddress      Boolean @default(false)
  basePriceUsd      Float?          // for budgeting

  // Internal-specific
  internalAction    String?         // "giftPto" | "ceuStipend" | "manualOrder"
  fulfillmentOwner  String?         // email of the person who handles it
  needsApproval     String?         // "supervisor" | "admin" | null

  redemptions Redemption[]
}

model Redemption {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  rewardId  String
  reward    Reward   @relation(fields: [rewardId], references: [id])
  cost      Int
  status    String   @default("pending")
  options   Json?

  // Provider-specific tracking
  tremendousOrderId String?
  printfulOrderId   String?
  printfulExternalId String? @unique
  trackingNumber    String?
  trackingUrl       String?
  failureReason     String?

  // For approval flows
  approverEmail     String?
  approvedAt        DateTime?
  approvedBy        String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 9. The Hidden Gotchas (Real Ones)

1. **Refund logic is non-trivial.** What happens when Printful fails an order three days after you charged the drops? The user's balance has been spent, they may have spent more drops since. Always refund instantly when the failure webhook fires; never wait to "review", the user's experience of a failed redemption is worse than the cost of the refund.

2. **HSAs and HIPAA-adjacent tax weirdness.** Recognition gifts > $25 in cash equivalents (gift cards count) are technically taxable income to the employee. The IRS calls these "fringe benefits" and at scale your payroll provider (Gusto, in your case) needs to know. For a small program at your scale this is usually below the threshold worth tracking, but if someone redeems three $100 gift cards in a year, Don will need to know. Add a `taxable` boolean to the Reward model and run a year-end report for your accountant.

3. **Gift card fraud.** Tremendous has built-in fraud detection, but the most common abuse pattern is internal: a user redeems a $100 Visa prepaid, then "loses" the email. Tremendous lets you re-send to the same address but not to a different one, keep that policy in place. Don't let anyone forward gift card emails to personal addresses; they're delivered to work email for a reason.

4. **Printful printing quality.** The hoodies are good. The mugs are fine. The mousepads and tumblers are surprisingly bad. **Order one of every product you plan to offer before launching** and have someone on the team handle the unboxing, there's no substitute for seeing the actual quality before staff see it.

5. **The "I want something else" problem.** Even with 2,400 Tremendous brands and Printful's full catalog, someone will want something neither offers. Don't custom-build for these, add an "Other / Custom Request" option in the rewards catalog at a high drops cost (say 5,000n) that just triggers a Gmail to Callie. Solve the long tail with a human.

---

## 10. Build Order (~3-5 days on top of the main plan)

After the The Well backend is up:

1. **Tremendous sandbox account, test reward send** (~1h), fastest provider to validate
2. **Add `provider`, `productCode`, `denominationUsd` to the Reward schema** (~30 min)
3. **Build the redemption router** (`/api/redemptions`) with the switch-on-provider pattern (~2h)
4. **Wire Tremendous in production** (~1h once API access is approved)
5. **Printful account, design upload, mockup approval** (~3h, most of this is design work)
6. **Configure manual/API store, note variant IDs** (~1h)
7. **Build Printful order submission + webhook handler** (~3h)
8. **Order one of each Printful product, verify quality** (~1 week for delivery)
9. **Internal reward flows**, Gmail-based approvals (~3h)
10. **End-to-end test with a real $25 DoorDash redemption to yourself** (~30 min)

---

## 11. The One-Sentence Summary

**Tremendous handles "things people want" (gift cards); Printful handles "things branded with our stuff" (swag); Gmail+Calendar handle "things only we can give" (time off, stipends), and The Well's job is to make the routing decision invisible to the person clicking Redeem.**

When this is built right, the staff member who hits Redeem on a $25 DoorDash card has their lunch ordered before they finish the next sentence of their next session note. That's the bar.
