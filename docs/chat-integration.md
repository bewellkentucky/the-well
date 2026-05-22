# The Well, Google Chat Integration Addendum

How to make kudos appear in people's Google Chat the moment they're sent, plus weekly digests, milestone reminders, and slash commands.

This is where The Well stops being "a website you have to remember to visit" and starts being a presence in the tool everyone already has open all day.

---

## 1. Why Google Chat Is The Right Move

Your team is already in Workspace; Google Chat is built into Gmail's left rail and the dedicated Chat app. Recognition that lives only on a website fails because nobody remembers to check the website. **A kudo notification in Chat appears in 0 seconds and surfaces a smile in 5.** That's the whole proposition.

The Google Chat API gives you three things that matter:

1. **Direct messages to any Workspace user**, your Chat app DMs Hayley directly when she gets a kudo. She doesn't need to opt in; the DM space is auto-created the first time.
2. **A persistent `#kudos` space**, all recognition flows into one room everyone's in, like a permanent feed. Reactions and replies thread under each kudo.
3. **Interactive cards with buttons**, the kudo card has a "🙏 React" button that posts back to your backend. No leaving Chat to do anything.

---

## 2. The Architecture (One Service Account, Two Sources of Messages)

The The Well backend already has a Google service account from the Workspace directory sync. **You can reuse the same service account for Chat**, just enable the Chat API in the Google Cloud project and add the relevant scopes. One service account, three jobs:

1. **Directory sync** → `admin.googleapis.com` (already built)
2. **Email digests** → `gmail.googleapis.com` (already in the main plan)
3. **Chat notifications** → `chat.googleapis.com` (new)

```
                              ┌─────────────────────┐
   User sends kudo in app ──► │ /api/kudos (Next.js)│
                              └──────────┬──────────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
        ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
        │ DB: insert     │    │ Chat API:      │    │ Chat API:      │
        │ kudo record    │    │ DM recipient   │    │ Post to #kudos │
        └────────────────┘    └────────────────┘    └────────────────┘
                                  ~200ms                ~200ms
```

Both Chat sends happen in parallel after the DB insert. Total latency from "click send" to "Hayley sees notification": under one second.

---

## 3. Setup (≈45 minutes, one-time)

Building on the Google Cloud project from the main plan:

### Step 1, Enable the Chat API
Console → APIs & Services → Library → **Google Chat API** → Enable.

### Step 2, Configure the Chat app
APIs & Services → Google Chat API → **Configuration** tab. Fill in:

- **App name:** The Well
- **Avatar URL:** Host the thewell mark somewhere public (Google Drive public link works; better is your own domain like `https://thewell.bewellkentucky.com/avatar.png`)
- **Description:** "Recognition for Be Well Kentucky & LCED"
- **Functionality:** ✅ Receive 1:1 messages, ✅ Join spaces and group conversations
- **Connection settings:** "HTTP endpoint URL", `https://thewell.bewellkentucky.com/api/chat/events` (for receiving slash commands and button clicks)
- **Authentication:** Service account (use the existing `thewell-sync@…` one)
- **Visibility:** **"Make this Chat app available to specific people and groups in bewellkentucky.com"**, restrict to your domain so it never accidentally lists in any public marketplace
- **Slash commands** (define each one, covered in §6 below)

### Step 3, Grant the service account Chat API scopes
In **admin.google.com** → Security → API Controls → Domain-wide Delegation, edit the existing entry for the service account and add:

```
https://www.googleapis.com/auth/chat.bot
```

This is the only scope you need for sending app-authenticated messages (DMs, space posts, card updates). Note: `chat.bot` doesn't begin with `chat.app.*`, so it does *not* require special administrator approval, it works immediately.

### Step 4, Install the Chat app for everyone
Workspace Admin Console → Apps → Google Workspace → Google Chat → Manage Chat apps → find The Well → set to **"On for everyone"** in the bewellkentucky.com domain.

This auto-installs the app for all 28 staff. They'll see The Well appear in their Chat sidebar within ~5 minutes. **They don't need to do anything.**

### Step 5, Create the #kudos space
The first time the Chat app boots, have it create the public space and add everyone:

```typescript
// /scripts/bootstrap-chat-space.ts
import { chat } from "../lib/google-chat"

async function bootstrapKudosSpace() {
  // Create the space
  const space = await chat.spaces.create({
    requestBody: {
      displayName: "💧 Kudos · Be Well Kentucky & LCED",
      spaceType: "SPACE",
      spaceDetails: {
        description: "Where we celebrate each other. Cross-posted from The Well.",
        guidelines: "Be specific in your kudos. Tell the story.",
      },
    },
  })

  // Save the space name (e.g., "spaces/AAAA-thewell") in your DB or env
  await db.config.upsert({
    where: { key: "chat_kudos_space" },
    create: { key: "chat_kudos_space", value: space.data.name! },
    update: { value: space.data.name! },
  })

  // Add everyone from the directory
  const users = await db.user.findMany({ where: { active: true } })
  for (const u of users) {
    await chat.spaces.members.create({
      parent: space.data.name!,
      requestBody: {
        member: {
          name: `users/${u.googleId}`,
          type: "HUMAN",
        },
      },
    })
  }
  return space.data.name
}
```

Run once during setup. After that, the directory sync handles adding new hires to the space automatically.

---

## 4. The Code That Sends a Kudo to Chat

This is the entire "notify in Chat" flow, about 60 lines.

```typescript
// /lib/providers/google-chat.ts
import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/chat.bot"]

let chatClient: any
async function getChatClient() {
  if (chatClient) return chatClient
  const auth = new google.auth.JWT({
    email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).client_email,
    key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).private_key,
    scopes: SCOPES,
    // For app-auth Chat calls, do NOT set `subject` — service account itself
    // is the actor. This is the opposite of the Directory API pattern.
  })
  chatClient = google.chat({ version: "v1", auth })
  return chatClient
}

export async function sendKudoToChat({ kudo, fromUser, toUser }: {
  kudo: Kudo
  fromUser: User
  toUser: User
}) {
  const chat = await getChatClient()
  const card = buildKudoCard(kudo, fromUser, toUser)

  // Send DM to the recipient — the app will create the DM space if needed
  const dmSpace = await chat.spaces.findDirectMessage({
    name: `users/${toUser.googleId}`,
  })

  await chat.spaces.messages.create({
    parent: dmSpace.data.name,
    requestBody: {
      text: `💧 You just got kudos from *${fromUser.fullName}*!`,
      cardsV2: [card],
    },
  })

  // Also cross-post to the #kudos space
  const kudosSpaceName = await getKudosSpaceName() // from DB config
  await chat.spaces.messages.create({
    parent: kudosSpaceName,
    requestBody: {
      cardsV2: [card],
    },
  })
}

function buildKudoCard(kudo: Kudo, fromUser: User, toUser: User) {
  return {
    cardId: `kudo_${kudo.id}`,
    card: {
      header: {
        title: `${fromUser.fullName} → ${toUser.fullName}`,
        subtitle: `+${kudo.amount} drops · ${kudo.entity}`,
        imageUrl: fromUser.thumbnailUrl ?? "https://thewell.bewellkentucky.com/avatar-default.png",
        imageType: "CIRCLE",
      },
      sections: [
        {
          widgets: [
            { textParagraph: { text: `<i>"${escape(kudo.message)}"</i>` } },
            ...(kudo.values.length
              ? [{ textParagraph: { text: kudo.values.map(v => `<b>${v}</b>`).join(" · ") } }]
              : []),
          ],
        },
        {
          widgets: [{
            buttonList: {
              buttons: [
                {
                  text: "🙏 React",
                  onClick: {
                    action: {
                      function: "reactToKudo",
                      parameters: [{ key: "kudoId", value: kudo.id }],
                    },
                  },
                },
                {
                  text: "Open in The Well",
                  onClick: {
                    openLink: { url: `https://thewell.bewellkentucky.com/kudo/${kudo.id}` },
                  },
                },
              ],
            },
          }],
        },
      ],
    },
  }
}

function escape(s: string) {
  // Google Chat supports a narrow HTML subset (b, i, u, a, br, font color)
  // and does NOT support standard markdown
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
```

The wrapper hides three things worth knowing:

- **`findDirectMessage` auto-creates the DM space** if one doesn't exist. You don't need to "open a chat" first.
- **No subject impersonation for Chat.** Unlike Directory API where you impersonate a super-admin, Chat API uses the service account *as itself* (the Chat app). The service account is the sender; the user is the recipient.
- **Cards v2, not v1.** Cards v1 is deprecated. Always use `cardsV2` in the request, the format is different in subtle ways and old docs lie.

---

## 5. The Webhook That Handles Button Clicks

> **Reaction model for v1: keep it simple, two separate pools.**
> There are two places a kudo can be reacted to, and for v1 they are deliberately NOT synced:
> 1. **In The Well web app**, reactions are stored in your Postgres DB against the kudo. This is the authoritative pool. It feeds "most celebrated", the warm counts in the feed, etc.
> 2. **In Google Chat**, the card we post can be reacted to with Chat's own native emoji reactions. Those live in Google's system and we do not read them back.
>
> The optional "React" button described below is a third, controlled path: it's a button on the card that writes one reaction back into your DB. It's nice-to-have, not required. If you skip it, the Chat card is purely a notification/snapshot and all real reactions happen in the app.
>
> **Why not sync them?** Full bidirectional sync means subscribing to Chat `REACTION` events, writing them back, pushing app reactions out to update the Chat message, handling rate limits, and inheriting Chat's anything-goes emoji set (including ones that don't fit the app's curated, on-brand set: 💧 💛 🙌 🙏). For a 28-person practice that's a lot of fragile plumbing for little gain, and the failure mode (counts briefly disagreeing between app and Chat) is exactly the kind of small bug that erodes trust. Revisit only if people actually ask for it.

When someone clicks the optional "React" button in a kudo card, Google Chat POSTs an interaction event to your endpoint:

```typescript
// /app/api/chat/events/route.ts
import crypto from "crypto"

export async function POST(req: Request) {
  // Google signs events with a bearer token in the Authorization header
  const auth = req.headers.get("authorization")
  if (!auth || !await verifyChatJWT(auth)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const event = await req.json()

  switch (event.type) {
    case "MESSAGE":
      // User sent a message to the app (1:1 DM or @-mention in space)
      return Response.json(await handleMessage(event))

    case "CARD_CLICKED":
      // User clicked a button in a card we sent earlier
      return Response.json(await handleCardClick(event))

    case "ADDED_TO_SPACE":
      // App was added to a new space — send the welcome message
      return Response.json({
        text: "👋 Hi! I'm The Well. Try `/kudos @teammate 25 great work on...` to send a kudo.",
      })

    case "REMOVED_FROM_SPACE":
      // Cleanup, log, etc.
      return new Response(null, { status: 200 })
  }
}

async function handleCardClick(event: any) {
  const fn = event.common?.invokedFunction
  const params = Object.fromEntries(
    (event.common?.parameters ?? []).map((p: any) => [p.key, p.value])
  )

  if (fn === "reactToKudo") {
    const userEmail = event.user.email
    // The card's React button adds the signature droplet, matching the app's default reaction.
    await db.reaction.upsert({
      where: { kudoId_userId_emoji: { kudoId: params.kudoId, userId: userEmail, emoji: "💧" } },
      create: { kudoId: params.kudoId, userEmail, emoji: "💧" },
      update: {},
    })
    // Re-render this one card to reflect the DB reaction count. Note: this only reflects
    // reactions made through the app or this button, NOT Chat's native emoji reactions.
    return {
      actionResponse: { type: "UPDATE_MESSAGE" },
      cardsV2: [updatedCard],  // rebuild with new reaction count
    }
  }
}
```

---

## 6. Slash Commands (Make It Effortless)

The killer feature. Defined in the Chat app configuration, called inline from any chat window:

| Command | What it does | Example |
|---|---|---|
| `/kudos` | Open a dialog to send a kudo without leaving Chat | `/kudos` → modal pops up with recipient picker, amount slider, message field |
| `/balance` | Returns your current drops (giving + earned) as a private response | `/balance` → "Justin · 75n to give · 1,247n earned" |
| `/redeem` | Browse the rewards catalog in Chat | `/redeem` → card with reward options + Redeem buttons |
| `/leaderboard` | Show this month's leaderboard | `/leaderboard` → top 5 givers + top 5 recognized this month |
| `/celebrate` | Quick celebration for a milestone | `/celebrate @hayley 3 years!` → posts a celebration card to #kudos |

Setup in the Chat app config:

```
Command name: /kudos
Description: Send recognition to a teammate
Command ID: 1
Type: Dialog
```

Handler:

```typescript
async function handleMessage(event: any) {
  const command = event.message?.slashCommand?.commandId

  if (command === 1) {  // /kudos
    // Return a dialog (modal in Chat)
    return {
      actionResponse: {
        type: "DIALOG",
        dialogAction: {
          dialog: {
            body: { sections: [buildKudoComposerSection(event)] },
          },
        },
      },
    }
  }
  if (command === 2) {  // /balance
    const user = await db.user.findUnique({ where: { email: event.user.email } })
    return {
      privateMessageViewer: { name: `users/${user.googleId}` },
      text: `*${user.fullName}* · ${user.givingBalance}n to give · ${user.balance}n earned`,
    }
  }
  // ... other commands
}
```

The `privateMessageViewer` field on a response makes the message visible *only to the person who invoked the command*, perfect for `/balance` so colleagues don't see how much someone has.

---

## 7. The Three Daily Notifications Worth Building

Beyond per-kudo DMs, three scheduled Chat messages make the program feel alive:

### A. Morning "happening today" digest (8 AM weekdays)

A single message in `#kudos` listing birthdays, work anniversaries, and people OOO today, pulled from BambooHR.

```typescript
// /app/api/cron/morning-digest/route.ts
export async function GET() {
  const today = new Date()
  const milestones = await getMilestonesForDate(today)
  const outToday = await db.timeOff.findMany({
    where: { start: { lte: today }, end: { gte: today } },
  })

  if (milestones.length === 0 && outToday.length === 0) return Response.json({ skipped: true })

  await chat.spaces.messages.create({
    parent: KUDOS_SPACE,
    requestBody: { cardsV2: [buildMorningCard(milestones, outToday)] },
  })
  return Response.json({ ok: true })
}
```

Cron: `0 13 * * 1-5` (8 AM Eastern = 13:00 UTC, weekdays).

### B. Weekly Monday recap (9 AM Mondays)

A roll-up of the prior week's kudos posted to #kudos. Reminds people the program exists, surfaces who's been quiet (gentle nudge), and celebrates the most-recognized person.

### C. Reminder DMs for unused allowance (Friday 3 PM)

A *quiet* DM to anyone who hasn't given any drops this week: "Hey, you've got 100 drops to give and the week's almost over. Anyone you want to recognize?" This single message has the biggest impact on program activation; most kudos programs die because *givers* forget, not because there's nothing to celebrate.

---

## 8. Privacy & Forced Notifications

Two things worth knowing for the implementation:

**Silent vs. forced messages.** Chat API messages support a `notificationType` field (`NOTIFICATION` or `SILENT`). Use:

- **NOTIFICATION** (default) for the kudo DMs, recipient gets a notification badge, sound, and a push to mobile
- **SILENT** for the morning digest and weekly recap, they post to the space but don't ping everyone

**Email mirroring.** When The Well sends a Chat DM, Google Chat will *also* email it if the recipient hasn't opened Chat recently (their notification setting). You don't control this, it's per-user. So Hayley gets a Chat ping if she's online, an email if she's not. This is good behavior, not a bug.

**Anti-spam threshold.** Don't send more than ~10 Chat DMs to the same user in an hour, or Google starts rate-limiting. For a 30-person org getting 5-15 kudos/day, this is never a problem.

---

## 9. The Schema Adjustment

Add Chat-specific identifiers to the schema from the main plan:

```prisma
model User {
  // ... everything from before ...

  // Google Chat tracking
  googleId       String?  @unique    // from Workspace sync — needed for Chat user reference
  chatDmSpace    String?             // cached "spaces/AAA..." for the DM with this user
  chatNotifyKudos    Boolean @default(true)  // user-level notification preference
  chatNotifyDigest   Boolean @default(true)
  chatNotifyReminder Boolean @default(true)
}

model Config {
  key   String @id
  value String
}
// Stores chat_kudos_space, chat_app_id, etc.
```

The `chatDmSpace` cache matters because `findDirectMessage` is one API call per send. Cache it on first lookup and you'll cut Chat send latency roughly in half.

---

## 10. The Build Order

The Chat layer takes about a day on top of the main plan:

1. **Enable Chat API, configure the Chat app** in Cloud Console (~30 min)
2. **Add the `chat.bot` scope to the existing service account's domain-wide delegation** (~5 min)
3. **Install the Chat app for everyone** in Workspace Admin (~5 min)
4. **Write the `google-chat.ts` provider** (~1h)
5. **Hook the existing `/api/kudos` route to send to Chat after DB insert** (~30 min)
6. **Create the #kudos space and bootstrap membership** (~30 min)
7. **Wire the events endpoint for button clicks** (~1h)
8. **Define the four slash commands and their handlers** (~2h)
9. **Set up the three scheduled crons (morning digest, Monday recap, Friday reminders)** (~2h)
10. **End-to-end test: send yourself a kudo, watch the DM arrive, click react** (~15 min)

---

## 11. The Hidden Gotchas

1. **Chat uses HTML, not Markdown.** A narrow subset: `<b>`, `<i>`, `<u>`, `<a>`, `<br>`, `<font color>`. Standard markdown like `**bold**` will appear as literal asterisks. Always escape user input before inserting.

2. **Card size limit is 100 widgets.** A kudo card is maybe 5-6 widgets, so you're fine. But if you ever try to fit a full leaderboard in a card, watch the count.

3. **`chat.app.spaces.*` scopes need admin approval.** If you ever need a higher-privilege scope (creating spaces app-authoritatively, deleting messages other users sent), that requires a one-time admin click. The `chat.bot` scope this plan uses does not.

4. **Cards v1 vs v2 confusion.** Old Stack Overflow answers and Google's own outdated tutorials reference Cards v1. Always use **`cardsV2`** in the message body. The field names are different (`cardsV2` vs `cards`), the widget structure is different.

5. **Service account messages can't @-mention users.** If you want a kudo DM to start with "@Hayley, …", you can't actually use a Chat-recognized mention via app-auth, it'll appear as plain text. Workaround: put the name in bold (`<b>Hayley</b>`) instead. Recipients still recognize their own name and the visual cue is the same.

6. **Avatar URL needs to be HTTPS and publicly accessible.** No auth-walled images. The Chat app icon shows up next to every DM, get this right because it's the most-seen brand asset of the whole program. Use the thewell mark.

---

## 12. The Two-Sentence Summary

**Google Chat turns The Well from a website you have to remember to visit into a presence in Workspace's already-open tool, every kudo arrives as a DM in under a second, the #kudos space becomes the de facto culture board, and slash commands let people give recognition without ever leaving the conversation they're already in.** The setup is genuinely small (one service account scope, one Cloud Console config screen, one cron file) because Workspace is already your identity layer; Chat is just another endpoint on the stack you've already built.
